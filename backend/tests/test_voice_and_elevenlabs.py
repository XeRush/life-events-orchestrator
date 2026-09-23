import hashlib
import hmac
import json
import time

import httpx
import pytest
from sqlalchemy import select

from app.agents.tools import TOOL_SPECS
from app.core.security import hash_password, verify_hmac_signature
from app.integrations.elevenlabs.agent import build_agent_config, sync_agent
from app.integrations.elevenlabs.callbacks import ElevenLabsOutboundCaller, SimulatedCaller
from app.integrations.elevenlabs.client import ElevenLabsClient, ElevenLabsError
from app.integrations.elevenlabs.schemas import OutboundCallRequest
from app.models import Callback, Conversation, LifeEventCase, User
from app.models.enums import CallbackStatus, CaseStatus, UserRole
from tests.helpers import act, make_case


async def test_agent_definition_exposes_every_tool_and_safety_rules(test_settings):
    config = build_agent_config(test_settings.model_copy(update={"public_base_url": "https://lifeloop.example"}), TOOL_SPECS)
    prompt = config["conversation_config"]["agent"]["prompt"]
    names = {t["name"] for t in prompt["tools"]}
    assert names == {"create_life_event_case", "get_case_status", "get_case_timeline", "get_pending_actions", "get_workflow_graph",
                     "submit_consent", "initiate_service", "get_service_status", "get_required_documents", "record_document",
                     "request_callback", "pause_case", "resume_case", "escalate_case", "complete_case"}
    assert "AI" in prompt["prompt"] and "NEVER invent" in prompt["prompt"]
    assert "I don't have a confirmed update from the relevant authority yet." in prompt["prompt"]
    tool = prompt["tools"][0]["api_schema"]
    assert tool["url"].startswith("https://lifeloop.example/api/v1/voice/tools/") and "X-LifeLoop-Tool-Secret" in tool["request_headers"]


async def test_dialog_engine_full_conversation(container, resident):
    c = container
    conv = Conversation(user_id=resident.id, state={})
    c.session.add(conv)
    await c.session.flush()
    r1 = await c.agent.respond(resident, conv, "My daughter was born yesterday.")
    assert "Would you like me to proceed?" in r1.text and r1.stage == "awaiting_consent"
    assert (await c.session.scalar(select(LifeEventCase))) is None  # nothing created before consent
    r2 = await c.agent.respond(resident, conv, "Yes.")
    await c.commit()
    case = await c.session.scalar(select(LifeEventCase))
    assert case and case.reference in r2.text and case.status == CaseStatus.IN_PROGRESS
    assert [t["name"] for t in r2.tool_calls] == ["create_life_event_case"]
    assert conv.case_id == case.id
    # zero repetition: she can call back and just ask
    conv2 = Conversation(user_id=resident.id, state={})
    c.session.add(conv2)
    await c.session.flush()
    await act(c, case, "complete_birth_registration")
    await act(c, case, "issue_birth_certificate")
    await act(c, case, "start_identity")
    r3 = await c.agent.respond(resident, conv2, "Where are we?")
    assert "five stages" in r3.text and "Two are complete" in r3.text and "Civil Identity Authority" in r3.text
    assert "don't need to take any action" in r3.text
    r4 = await c.agent.respond(resident, conv2, "What's next?")
    assert "Additional Services" in r4.text


async def test_declining_consent_creates_nothing(container, resident):
    c = container
    conv = Conversation(user_id=resident.id, state={})
    c.session.add(conv)
    await c.session.flush()
    await c.agent.respond(resident, conv, "My son was born today")
    reply = await c.agent.respond(resident, conv, "No, not now")
    assert "haven't created a case" in reply.text
    assert (await c.session.scalar(select(LifeEventCase))) is None


async def test_tools_refuse_to_invent_or_overreach(container, resident):
    tools = container.agent.tools
    assert (await tools.run("create_life_event_case", resident, {"event_type": "BIRTH"}))["error"] == "consent_required"
    assert (await tools.run("get_case_status", resident, {}))["error"] == "no_case"
    assert (await tools.run("nope", resident, {}))["error"] == "unknown_tool"
    created = await tools.run("create_life_event_case", resident, {"event_type": "BIRTH", "consent_confirmed": True, "event_date": "2026-09-20"})
    assert created["ok"] and created["created"]
    dup = await tools.run("create_life_event_case", resident, {"event_type": "BIRTH", "consent_confirmed": True, "event_date": "2026-09-20"})
    assert dup["already_exists"] and dup["case_reference"] == created["case_reference"]
    # the agent cannot close a case the authorities have not confirmed
    closing = await tools.run("complete_case", resident, {})
    assert not closing["ok"] and closing["error"] == "not_all_services_confirmed"
    blocked = await tools.run("initiate_service", resident, {"service_key": "IDENTITY_PROCESS"})
    assert blocked["error"] == "not_actionable" and "Birth Certificate" in blocked["message"]
    status = await tools.run("get_service_status", resident, {"service_key": "BIRTH_REGISTRATION"})
    assert status["confirmed_by_authority"] is False and "confirmed update" in status["note"]
    esc = await tools.run("escalate_case", resident, {"reason": "wants a person"})
    assert esc["ok"] and esc["status"] == "ESCALATED"
    assert (await tools.run("get_workflow_graph", resident, {}))["services"]


async def test_document_flow_via_tools(container, resident):
    c = container
    case = await make_case(c, resident)
    await act(c, case, "complete_birth_registration")
    await act(c, case, "issue_birth_certificate")
    await act(c, case, "start_identity")
    await act(c, case, "require_document")
    pending = await c.agent.tools.run("get_pending_actions", resident, {})
    assert pending["actions"][0]["documents"][0]["type"] == "PROOF_OF_ADDRESS"
    docs = await c.agent.tools.run("get_required_documents", resident, {})
    assert docs["outstanding"] == ["Proof of parent's address"]
    rec = await c.agent.tools.run("record_document", resident, {"document_type": "PROOF_OF_ADDRESS"})
    await c.commit()
    assert rec["ok"]
    assert (await c.agent.tools.run("get_pending_actions", resident, {}))["actions"] == []


async def test_callback_script_and_simulated_provider(container, resident):
    case = await make_case(container, resident)
    await act(container, case, "complete_birth_registration")
    cb = (await container.session.scalars(select(Callback))).one()
    await container.callbacks.execute(cb)
    await container.commit()
    assert cb.status == CallbackStatus.COMPLETED
    conv = await container.session.get(Conversation, cb.conversation_id)
    assert conv.transcript[0]["role"] == "agent" and case.reference in conv.transcript[0]["text"]
    assert conv.duration_seconds == cb.duration_seconds


def make_client(handler, **kw) -> ElevenLabsClient:
    return ElevenLabsClient("test-key", transport=httpx.MockTransport(handler), backoff=0, **kw)


async def test_client_retries_rate_limits_then_succeeds():
    calls = {"n": 0}

    def handler(request: httpx.Request):
        calls["n"] += 1
        assert request.headers["xi-api-key"] == "test-key"
        if calls["n"] < 3:
            return httpx.Response(429 if calls["n"] == 1 else 503)
        return httpx.Response(200, json={"signed_url": "wss://example/signed"})

    assert await make_client(handler).get_signed_url("agent_1") == "wss://example/signed"
    assert calls["n"] == 3


async def test_client_error_mapping():
    with pytest.raises(ElevenLabsError) as exc:
        await make_client(lambda r: httpx.Response(401)).get_signed_url("a")
    assert exc.value.status_code == 401 and not exc.value.retriable
    with pytest.raises(ElevenLabsError, match="malformed"):
        await make_client(lambda r: httpx.Response(200, content=b"<html>")).get_signed_url("a")
    with pytest.raises(ElevenLabsError, match="signed_url"):
        await make_client(lambda r: httpx.Response(200, json={})).get_signed_url("a")

    def boom(request):
        raise httpx.ConnectTimeout("slow")

    with pytest.raises(ElevenLabsError) as exc:
        await make_client(boom, max_attempts=2).get_signed_url("a")
    assert exc.value.retriable


async def test_sync_agent_creates_or_updates(test_settings):
    seen = []

    def handler(request: httpx.Request):
        seen.append((request.method, request.url.path))
        return httpx.Response(200, json={"agent_id": "agent_new"})

    created = await sync_agent(make_client(handler), test_settings, TOOL_SPECS)
    assert created == {"agent_id": "agent_new", "action": "created"} and seen[-1] == ("POST", "/v1/convai/agents/create")
    updated = await sync_agent(make_client(handler), test_settings.model_copy(update={"elevenlabs_agent_id": "agent_9"}), TOOL_SPECS)
    assert updated["action"] == "updated" and seen[-1] == ("PATCH", "/v1/convai/agents/agent_9")


async def test_outbound_caller_uses_elevenlabs_or_falls_back(test_settings):
    settings = test_settings.model_copy(update={"elevenlabs_api_key": "k", "elevenlabs_agent_id": "a", "elevenlabs_phone_number_id": "pn_1"})
    sent = {}

    def handler(request: httpx.Request):
        sent.update(json.loads(request.content))
        return httpx.Response(200, json={"success": True, "conversation_id": "conv_123"})

    caller = ElevenLabsOutboundCaller(make_client(handler), settings)
    req = OutboundCallRequest(callback_id="cb", conversation_id="c1", case_reference="L-1", to_number="+15550100", script="Hello there.",
                              dynamic_variables={"resident_id": "r"})
    result = await caller.place_call(req)
    assert result.status == "initiated" and result.call_id == "conv_123"
    assert sent["agent_id"] == "a" and sent["agent_phone_number_id"] == "pn_1" and sent["to_number"] == "+15550100"
    assert sent["conversation_initiation_client_data"]["conversation_config_override"]["agent"]["first_message"] == "Hello there."
    no_phone = await caller.place_call(req.model_copy(update={"to_number": None}))
    assert no_phone.provider == "simulated" and no_phone.status == "completed"
    failing = ElevenLabsOutboundCaller(make_client(lambda r: httpx.Response(500), max_attempts=1), settings)
    assert (await failing.place_call(req)).status == "failed"


def sign(secret: str, body: bytes) -> str:
    ts = str(int(time.time()))
    return f"t={ts},v0=" + hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()


def test_signature_verification():
    body = b'{"type":"x"}'
    assert verify_hmac_signature("s3cret", body, sign("s3cret", body))
    assert not verify_hmac_signature("other", body, sign("s3cret", body))
    assert not verify_hmac_signature("s3cret", body + b" ", sign("s3cret", body))
    assert not verify_hmac_signature("s3cret", body, "garbage")
    old = f"t={int(time.time()) - 99999},v0=abc"
    assert not verify_hmac_signature("s3cret", body, old)


async def test_voice_http_flow_tools_and_webhook(client, session, monkeypatch):
    from app.core.config import get_settings

    session.add(User(email="caller@example.test", hashed_password=hash_password("pw-caller-1", 4), full_name="Caller", role=UserRole.RESIDENT))
    await session.commit()
    token = (await client.post("/api/v1/auth/login", json={"email": "caller@example.test", "password": "pw-caller-1"})).json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    cfg = (await client.get("/api/v1/voice/config", headers=h)).json()
    assert cfg["provider"] == "simulated" and not any("key" in k or "secret" in k for k in cfg)

    sess = (await client.post("/api/v1/voice/sessions", json={}, headers=h)).json()
    assert sess["provider"] == "simulated" and "AI assistant" in sess["opening_message"]
    cid = sess["conversation_id"]
    t1 = (await client.post(f"/api/v1/voice/sessions/{cid}/turn", json={"utterance": "My daughter was born yesterday."}, headers=h)).json()
    assert t1["stage"] == "awaiting_consent"
    t2 = (await client.post(f"/api/v1/voice/sessions/{cid}/turn", json={"utterance": "Yes please"}, headers=h)).json()
    ref = t2["case_reference"]
    assert ref and t2["tool_calls"][0]["name"] == "create_life_event_case"
    assert (await client.get(f"/api/v1/cases/{ref}", headers=h)).json()["status"] == "IN_PROGRESS"
    ended = (await client.post(f"/api/v1/voice/sessions/{cid}/end", headers=h)).json()
    assert ended["status"] == "COMPLETED" and len(ended["transcript"]) >= 5
    assert (await client.post(f"/api/v1/voice/sessions/{cid}/turn", json={"utterance": "hi"}, headers=h)).status_code == 409
    history = (await client.get("/api/v1/voice/conversations", headers=h)).json()
    assert history and history[0]["case_id"]

    # ElevenLabs tool endpoint: secret required, resident resolved from resident_id
    me = (await client.get("/api/v1/auth/me", headers=h)).json()
    secret = get_settings().voice_tool_secret
    assert (await client.post("/api/v1/voice/tools/get_case_status", json={"resident_id": me["id"]})).status_code == 401
    ok = await client.post("/api/v1/voice/tools/get_case_status", json={"resident_id": me["id"]}, headers={"X-LifeLoop-Tool-Secret": secret})
    assert ok.status_code == 200 and ok.json()["case_reference"] == ref and "five stages" in ok.json()["summary"]

    # post-call webhook: signature enforced when a secret is configured, duplicates ignored
    monkeypatch.setattr(get_settings(), "elevenlabs_webhook_secret", "whsec")
    payload = {"type": "post_call_transcription", "data": {
        "conversation_id": "el_conv_1", "transcript": [{"role": "agent", "message": "Hello"}, {"role": "user", "message": "Hi"}],
        "metadata": {"call_duration_secs": 42}, "analysis": {"transcript_summary": "Greeting"},
        "conversation_initiation_client_data": {"dynamic_variables": {"lifeloop_conversation_id": cid}}}}
    body = json.dumps(payload).encode()
    assert (await client.post("/api/v1/voice/webhook", content=body)).status_code == 401
    good = await client.post("/api/v1/voice/webhook", content=body, headers={"ElevenLabs-Signature": sign("whsec", body)})
    assert good.status_code == 200 and good.json()["matched"]
    conv = (await client.get(f"/api/v1/voice/conversations/{cid}", headers=h)).json()
    assert conv["provider"] == "elevenlabs" and conv["duration_seconds"] == 42 and conv["summary"] == "Greeting"
    dup = await client.post("/api/v1/voice/webhook", content=body, headers={"ElevenLabs-Signature": sign("whsec", body)})
    assert dup.json().get("duplicate")


async def test_callback_conversation_completes_via_webhook(container, resident):
    """A real (initiated) outbound call is finished by the post-call webhook."""
    from app.integrations.elevenlabs.schemas import OutboundCallResult, WebhookEnvelope

    class Initiated(SimulatedCaller):
        provider = "elevenlabs"

        async def place_call(self, request):
            return OutboundCallResult(provider="elevenlabs", status="initiated", call_id="el_out_1")

    container.caller = Initiated()
    case = await make_case(container, resident)
    await act(container, case, "complete_birth_registration")
    cb = (await container.session.scalars(select(Callback))).one()
    await container.callbacks.execute(cb)
    assert cb.status == CallbackStatus.IN_PROGRESS
    env = WebhookEnvelope(type="post_call_transcription", data={
        "conversation_id": "el_out_1", "transcript": [{"role": "agent", "message": "Hi"}], "metadata": {"call_duration_secs": 61}})
    out = await container.voice.handle_webhook(env)
    await container.commit()
    assert out["matched"] and cb.status == CallbackStatus.COMPLETED and cb.duration_seconds == 61


async def test_conversation_stays_on_its_own_case(container, resident):
    """Asking 'where are we' right after a case completes must not drift to another open case."""
    c = container
    older = await make_case(c, resident)  # stays open
    conv = Conversation(user_id=resident.id, state={})
    c.session.add(conv)
    await c.session.flush()
    await c.agent.respond(resident, conv, "My daughter was born yesterday.")
    await c.agent.respond(resident, conv, "Yes")
    await c.commit()
    mine = await c.session.get(LifeEventCase, conv.case_id)
    assert mine.id != older.id
    for action in ("complete_birth_registration", "issue_birth_certificate", "approve_identity", "complete_health", "complete_additional_services"):
        await act(c, mine, action)
    reply = await c.agent.respond(resident, conv, "Where are we?")
    assert "All of them are complete" in reply.text
