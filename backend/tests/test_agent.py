"""Voice agent: dialog engine, scoped tools, verification, opt-out by voice, escalation, and Agent Testing."""
import pytest
from sqlalchemy import select

from app.agents.guardrails import CaseFacts, GuardrailEvaluator, contains_disclosure
from app.agents.testing.scenarios import run_scenarios
from app.agents.tools import ToolContext
from app.models import CallSession
from app.models.enums import CallDirection, CallState
from tests.conftest import login, open_case, run


async def _say(client, headers, call_id, text):
    r = await client.post(f"/api/v1/agent/calls/{call_id}/turn", headers=headers, json={"utterance": text})
    assert r.status_code == 200, r.text
    return r.json()


async def test_full_voice_intake_creates_case_and_never_reads_ids_back(client, infra, world):
    headers = await login(client, "resident@test.local")
    r = await client.post("/api/v1/agent/calls", headers=headers, json={"language": "en"})
    assert r.status_code == 201
    call = r.json()["call"]
    assert call["transcript"][0]["is_disclosure"] and contains_disclosure(call["transcript"][0]["text"])
    cid = call["id"]
    turns = ["English", "Yes, my daughter was born yesterday at Latifa Hospital in Dubai", "Aisha Khan", "Ahmed Khan",
             "784-1990-1234567-1", "Fatima Khan", "784 1992 7654321 2", "Indian", "Yes", "Yes", "Yes, please call me"]
    replies = [await _say(client, headers, cid, t) for t in turns]
    last = replies[-1]
    assert last["case_reference"] and last["case_reference"].startswith("LL-")
    full = (await client.get(f"/api/v1/agent/calls/{cid}", headers=headers)).json()
    assert all("1234567" not in m["text"] and "7654321" not in m["text"] for m in full["transcript"])  # redacted, never echoed
    violations = GuardrailEvaluator().evaluate([{"role": m["role"], "text": m["text"]} for m in full["transcript"]], CaseFacts())
    assert not violations, violations
    case = (await client.get(f"/api/v1/cases/{last['case_reference']}", headers=headers)).json()
    assert case["consent"]["callback"] and case["child"]["full_name_en"] == "Aisha Khan"


async def test_where_are_we_and_stop_calling_by_voice(client, infra, world):
    ref = await open_case(infra, world["resident"])
    headers = await login(client, "resident@test.local")
    cid = (await client.post("/api/v1/agent/calls", headers=headers, json={"case_reference": ref})).json()["call"]["id"]
    await _say(client, headers, cid, "English")
    status = await _say(client, headers, cid, "Where are we?")
    assert "six steps" in status["reply"]
    fee = await _say(client, headers, cid, "How much is the visa fee?")
    assert "won't quote" in fee["reply"]
    mofa = await _say(client, headers, cid, "How much does MOFA attestation cost?")
    assert "AED 150" in mofa["reply"] and "Source" in mofa["reply"]
    stop = await _say(client, headers, cid, "Please stop calling me")
    assert stop["ended"] and "SMS" in stop["reply"]
    assert (await client.get(f"/api/v1/cases/{ref}", headers=headers)).json()["channel_mode"] == "SMS_ONLY"


async def test_approval_question_triggers_warm_transfer(client, infra, world):
    ref = await open_case(infra, world["resident"])
    headers = await login(client, "resident@test.local")
    cid = (await client.post("/api/v1/agent/calls", headers=headers, json={"case_reference": ref})).json()["call"]["id"]
    await _say(client, headers, cid, "English")
    reply = await _say(client, headers, cid, "Will the birth certificate be approved?")
    assert reply["transferred"] and "Officer One" in reply["reply"]
    officer = await login(client, "officer@test.local")
    escalations = (await client.get("/api/v1/officer/escalations", headers=officer)).json()
    assert escalations[0]["reason"] == "APPROVAL_QUESTION" and escalations[0]["warm_transfer"]


async def test_callback_requires_verification_and_two_failures_escalate(infra, world):
    ref = await open_case(infra, world["resident"])

    async def go(c):
        case = await c.cases_repo.by_reference(ref)
        user = await c.users_repo.get(world["resident"].id)
        call = CallSession(case_id=case.id, user_id=user.id, direction=CallDirection.OUTBOUND, language="en", state=CallState.ACTIVE,
                           started_at=case.created_at, verified=False)
        c.session.add(call)
        await c.session.flush()
        ctx = ToolContext(user=user, call=call, channel="SIMULATED")
        assert (await c.tools.run("get_case_status", ctx))["error"] == "verification_required"
        bad = await c.tools.run("verify_callback", ctx, {"method": "KNOWLEDGE_FACTS", "date_of_birth": "1 January 2020", "hospital": "Elsewhere"})
        assert not bad["verified"] and not bad["escalated"]
        bad2 = await c.tools.run("verify_callback", ctx, {"method": "KNOWLEDGE_FACTS", "date_of_birth": "1 January 2020", "hospital": "Elsewhere"})
        assert bad2["escalated"] and call.state == CallState.TRANSFERRED
        child = await c.cases_repo.child(case.id)
        call2 = CallSession(case_id=case.id, user_id=user.id, direction=CallDirection.OUTBOUND, language="en", state=CallState.ACTIVE,
                            started_at=case.created_at, verified=False)
        c.session.add(call2)
        await c.session.flush()
        good = await c.tools.run("verify_callback", ToolContext(user=user, call=call2, channel="SIMULATED"),
                                 {"method": "KNOWLEDGE_FACTS", "date_of_birth": child.date_of_birth.isoformat(), "hospital": "Latifa"})
        assert good["verified"]
    await run(infra, go)


async def test_tools_enforce_scope(client, infra, world):
    ref = await open_case(infra, world["resident"])

    async def go(c):
        case = await c.cases_repo.by_reference(ref)
        other = await c.users_repo.get(world["admin"].id)
        call = CallSession(case_id=case.id, user_id=other.id, direction=CallDirection.INBOUND, language="en", state=CallState.ACTIVE,
                           started_at=case.created_at, verified=True)
        c.session.add(call)
        await c.session.flush()
        ctx = ToolContext(user=other, call=call, channel="ELEVENLABS")
        assert (await c.tools.run("get_case_status", ctx))["error"] == "forbidden"
        assert (await c.tools.run("approve_submission", ctx))["error"] == "unknown_tool"
        assert (await c.tools.run("report_consulate_milestone", ctx, {"milestone": "INVENTED"}))["error"] == "invalid_arguments"
        return str(call.id)
    call_id = await run(infra, go)
    r = await client.post("/api/v1/agent/tools/get_case_status", json={"lifeloop_call_id": call_id, "arguments": {}})
    assert r.status_code == 401  # shared secret required
    r = await client.post("/api/v1/agent/tools/get_case_status", json={"lifeloop_call_id": call_id, "arguments": {}},
                          headers={"X-LifeLoop-Tool-Secret": "test-tool-secret"})
    assert r.status_code == 200 and r.json()["error"] == "forbidden"


async def test_consulate_never_claimed(client, infra, world):
    ref = await open_case(infra, world["resident"])
    headers = await login(client, "resident@test.local")
    r = await client.post(f"/api/v1/cases/{ref}/consulate", headers=headers, json={"milestone": "PASSPORT_ISSUED", "passport_number_present": True})
    assert r.status_code == 409  # the consulate step is not open until MOFA clears
    async def go(c):
        case = await c.cases_repo.by_reference(ref)
        user = await c.users_repo.get(world["resident"].id)
        call = await c.session.scalar(select(CallSession))
        ctx = ToolContext(user=user, call=call, channel="SIMULATED", case=case)
        status = await c.tools.run("get_entity_status", ctx, {"node_key": "CONSULATE_PASSPORT"})
        assert status["source"] == "PARENT_REPORTED" and status["has_api"] is False and "haven't reported" in status["say"]
    await run(infra, go)


@pytest.mark.parametrize("lang", ["ar", "hi", "ur", "ml", "tl"])
def test_translations_cover_every_key_and_keep_the_disclosure(lang):
    import re

    from app.core.i18n import EN, t

    mod = pytest.importorskip(f"app.core.translations.{lang}")
    for key, en in EN.items():
        assert key in mod.MESSAGES, f"{lang} missing {key}"
        assert set(re.findall(r"\{(\w+)\}", en)) == set(re.findall(r"\{(\w+)\}", mod.MESSAGES[key])), f"{lang}:{key} placeholders"
    assert contains_disclosure(t("disclosure", lang))
    assert contains_disclosure(t("disclosure_callback", lang, ref="LL-1"))


async def test_agent_testing_scenarios(infra, world):
    async with infra.sessionmaker() as session:
        from app.services.container import ServiceContainer

        results = await run_scenarios(ServiceContainer(session, infra=infra))
        await session.rollback()
    by_id = {r["id"]: r for r in results}
    assert len(results) == 10
    for rid in ("missing-disclosure", "invented-approval", "invented-consulate", "unsourced-fee", "eid-read-aloud",
                "callback-without-consent", "callback-after-opt-out", "approval-bypass", "escalation"):
        assert by_id[rid]["passed"], (rid, by_id[rid]["violations"], by_id[rid]["system_check"])
    assert by_id["multilingual"]["passed"], (by_id["multilingual"]["violations"], by_id["multilingual"]["transcript"][-3:])


async def test_phone_call_to_the_life_event_line_binds_tools(client, infra, world):
    headers = {"X-LifeLoop-Tool-Secret": "test-tool-secret"}
    assert (await client.post("/api/v1/agent/webhooks/elevenlabs/initiation", json={"caller_id": "+971500000001"})).status_code == 401
    r = await client.post("/api/v1/agent/webhooks/elevenlabs/initiation", json={"caller_id": "+971 50 000 0001", "call_sid": "CA123"}, headers=headers)
    assert r.status_code == 200, r.text
    dyn = r.json()["dynamic_variables"]
    assert dyn["verified"] == "false" and dyn["lifeloop_call_id"]
    # A first-time caller gets a phone-only resident and can open a case by voice through the scoped tools.
    r = await client.post("/api/v1/agent/webhooks/elevenlabs/initiation", json={"caller_id": "+971509998877"}, headers=headers)
    call_id = r.json()["dynamic_variables"]["lifeloop_call_id"]
    args = {"child_full_name_en": "Phone Baby", "child_date_of_birth": "2026-09-30", "place_of_birth": "Rashid Hospital", "emirate": "DUBAI",
            "child_nationality": "Pakistani", "consent_callback": True}
    r = await client.post("/api/v1/agent/tools/create_case", json={"lifeloop_call_id": call_id, "arguments": args}, headers=headers)
    assert r.status_code == 200 and r.json()["ok"], r.text
    status = await client.post("/api/v1/agent/tools/get_case_status", json={"lifeloop_call_id": call_id, "arguments": {}}, headers=headers)
    assert status.json()["error"] == "verification_required"  # telephone callers verify before details are read out
