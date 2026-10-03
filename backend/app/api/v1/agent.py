"""Voice agent API: calls (simulated or ElevenLabs), ElevenLabs server tools, post-call webhooks, TTS/STT,
Agent Testing and agent sync."""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, File, Header, Query, Request, Response, UploadFile
from pydantic import BaseModel, Field

from app.agents.testing.scenarios import run_isolated
from app.agents.tools import ToolContext, ToolRegistry
from app.api.deps import STAFF, get_container, get_current_user, rate_limit, require_roles, require_tool_secret
from app.core.config import LANGUAGES
from app.core.errors import Forbidden, NotFound, ServiceUnavailable
from app.core.i18n import LANGUAGE_NAMES, LANGUAGE_NAMES_EN, normalise_lang
from app.integrations.elevenlabs.agent import agent_tests_payload, build_agent_config, sync_agent
from app.integrations.elevenlabs.client import ElevenLabsError
from app.models.call import CallSession
from app.models.enums import CallState, UserRole
from app.models.user import User
from app.schemas.agent import LanguageIn, MuteIn, StartCallIn, ToolCallIn, TranscriptIn, TtsIn, TurnIn
from app.services.container import ServiceContainer
from app.services.knowledge_service import load_documents
from app.workflows.case_orchestrator import CaseOrchestrator

router = APIRouter(prefix="/agent", tags=["agent"])
RTL = {"ar", "ur"}


@router.get("/config", summary="Voice provider status, languages, tools and graphs (no secrets)")
async def config(user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return {
        "voice": c.infra.voice_status(),
        "languages": [{"code": code, "name": LANGUAGE_NAMES[code], "english_name": LANGUAGE_NAMES_EN[code], "rtl": code in RTL} for code in LANGUAGES],
        "tools": ToolRegistry.catalog(),
        "orchestrator_graph": CaseOrchestrator.describe(),
        "conversation_graph": {"nodes": ["DISCLOSURE", "EXCEPTION", "ROUTER", "LANGUAGE", "INTAKE", "VERIFY", "STATUS", "BUILD_CASE"],
                               "sub_agents": ["INTAKE", "STATUS", "EXCEPTION"]},
    }


@router.post("/calls", status_code=201, summary="Start a call. Step 1 (the disclosure) is written before anything else.")
async def start_call(body: StartCallIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    result = await c.calls.start(user, case_ref=body.case_reference, language=body.language)
    await c.commit()
    return result


@router.get("/calls", summary="My calls (residents) or calls on cases I can see (staff)")
async def list_calls(limit: int = Query(20, ge=1, le=100), user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    if user.role != UserRole.RESIDENT:
        raise Forbidden("Officers read calls per case.")
    items, _ = await c.calls_repo.page(c.calls_repo.for_user(user.id), limit=limit)
    return [await c.calls.view(x, include_transcript=False) for x in items]


@router.get("/calls/ringing", summary="Callbacks currently ringing for me (simulated telephony rings in the app)")
async def ringing(user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    items, _ = await c.calls_repo.page(c.calls_repo.for_user(user.id).where(CallSession.state == CallState.RINGING), limit=5)
    return [await c.calls.view(x, include_transcript=False) for x in items]


@router.get("/calls/{call_id}", summary="One call with its redacted transcript")
async def get_call(call_id: uuid.UUID, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return await c.calls.view(await c.calls.get(call_id, user))


@router.post("/calls/{call_id}/answer", summary="Answer a ringing callback (the callback disclosure is spoken first)")
async def answer(call_id: uuid.UUID, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    result = await c.calls.answer(user, call_id)
    await c.commit()
    return result


@router.post("/calls/{call_id}/turn", dependencies=[Depends(rate_limit("default"))], summary="One utterance -> agent reply (simulated channel)")
async def turn(call_id: uuid.UUID, body: TurnIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    result = await c.calls.turn(user, call_id, body.utterance)
    await c.commit()
    return result


@router.post("/calls/{call_id}/end", summary="End (or decline) a call")
async def end(call_id: uuid.UUID, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    result = await c.calls.end(user, call_id)
    await c.commit()
    return result


@router.post("/calls/{call_id}/mute", summary="Mute / unmute")
async def mute(call_id: uuid.UUID, body: MuteIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    result = await c.calls.set_muted(user, call_id, body.muted)
    await c.commit()
    return result


@router.post("/calls/{call_id}/language", summary="Change the call language")
async def language(call_id: uuid.UUID, body: LanguageIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    result = await c.calls.change_language(user, call_id, body.language)
    await c.commit()
    return result


@router.post("/calls/{call_id}/human", summary="Request a human (warm transfer to the case's Amer officer)")
async def request_human(call_id: uuid.UUID, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    result = await c.calls.turn(user, call_id, "I want to speak to a human officer")
    await c.commit()
    return result


@router.post("/calls/{call_id}/stop-calling", summary="'Stop calling' at any point: opt out, cancel callbacks, SMS-only")
async def stop_calling(call_id: uuid.UUID, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    result = await c.calls.turn(user, call_id, "Stop calling")
    await c.commit()
    return result


@router.post("/calls/{call_id}/uae-pass", summary="Approve verification with UAE Pass (simulated one-tap)")
async def uae_pass(call_id: uuid.UUID, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    result = await c.calls.turn(user, call_id, "UAE Pass")
    await c.commit()
    return result


@router.post("/calls/{call_id}/transcript", summary="Stream transcript from a browser ElevenLabs session (live console)")
async def push_transcript(call_id: uuid.UUID, body: TranscriptIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    await c.calls.push_transcript(user, call_id, [m.model_dump() for m in body.messages], body.provider_conversation_id)
    await c.commit()
    return {"ok": True}


@router.post("/tools/{tool_name}", dependencies=[Depends(require_tool_secret)],
             summary="ElevenLabs server tool endpoint (shared-secret header + call binding)")
async def server_tool(tool_name: str, body: ToolCallIn, c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    try:
        call = await c.calls_repo.get(uuid.UUID(body.lifeloop_call_id))
    except ValueError:
        call = None
    if call is None or call.state not in (CallState.ACTIVE, CallState.RINGING) or call.user_id is None:
        raise NotFound("No active call is bound to this tool request.")
    user = await c.users_repo.get(call.user_id)
    result = await c.tools.run(tool_name, ToolContext(user=user, call=call, channel="ELEVENLABS"), body.arguments)
    await c.commit()
    return result


@router.post("/webhooks/elevenlabs", summary="ElevenLabs post-call webhook (HMAC signature, replay window, idempotent)")
async def elevenlabs_webhook(request: Request, elevenlabs_signature: str | None = Header(default=None),
                             c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    body = await request.body()
    result = await c.webhooks.elevenlabs(body, elevenlabs_signature)
    await c.commit()
    return result


class InitiationIn(BaseModel):
    caller_id: str = Field(min_length=4, max_length=32)
    agent_id: str | None = Field(default=None, max_length=80)
    called_number: str | None = Field(default=None, max_length=32)
    call_sid: str | None = Field(default=None, max_length=64)


@router.post("/webhooks/elevenlabs/initiation", dependencies=[Depends(require_tool_secret)],
             summary="ElevenLabs conversation-initiation webhook for calls to the life-event number (binds the call to a resident)")
async def elevenlabs_initiation(body: InitiationIn, c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    result = await c.calls.inbound_phone(caller_id=body.caller_id, called_number=body.called_number, call_sid=body.call_sid)
    await c.commit()
    return result


@router.post("/testing/sync", summary="Create the Agent Testing suite in the ElevenLabs workspace and run it (admin)")
async def sync_tests(_: User = Depends(require_roles(UserRole.ADMIN)), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    client, agent_id = c.infra.elevenlabs, c.settings.elevenlabs_agent_id
    if client is None or not agent_id:
        raise ServiceUnavailable("Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID to sync Agent Testing; the local suite runs at /agent/testing/run.",
                                 code="elevenlabs_not_configured")
    try:
        ids = [await client.create_agent_test(test) for test in agent_tests_payload()]
        run = await client.run_agent_tests(agent_id, ids)
    except ElevenLabsError as exc:
        raise ServiceUnavailable(f"ElevenLabs Agent Testing sync failed: {exc}") from exc
    return {"created": len(ids), "test_ids": ids, "run": run}


@router.post("/tts", summary="Eleven v3 text-to-speech for the web console (key stays on the server)")
async def tts(body: TtsIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> Response:
    client, s = c.infra.elevenlabs, c.settings
    if client is None or not s.elevenlabs_voice_id or c.infra.voice_down:
        raise ServiceUnavailable("ElevenLabs TTS is not configured; the console uses the browser's voice.", code="tts_unavailable")
    try:
        audio = await client.text_to_speech(voice_id=s.elevenlabs_voice_id, text=body.text, model_id=s.elevenlabs_tts_model,
                                            language_code=normalise_lang(body.language))
    except ElevenLabsError as exc:
        raise ServiceUnavailable(f"ElevenLabs TTS unavailable: {exc}", code="tts_unavailable") from exc
    return Response(content=audio, media_type="audio/mpeg")


@router.post("/stt", summary="Scribe v2 speech-to-text for the web console")
async def stt(language: str | None = None, audio: UploadFile = File(...), user: User = Depends(get_current_user),
              c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    client = c.infra.elevenlabs
    if client is None or c.infra.voice_down:
        raise ServiceUnavailable("ElevenLabs STT is not configured; type or use the browser's speech recognition.", code="stt_unavailable")
    data = await audio.read(10 * 1024 * 1024)
    try:
        result = await client.speech_to_text(audio=data, filename=audio.filename or "audio.webm", content_type=audio.content_type or "audio/webm",
                                             model_id=c.settings.elevenlabs_stt_model, language_code=language)
    except ElevenLabsError as exc:
        raise ServiceUnavailable(f"ElevenLabs STT unavailable: {exc}", code="stt_unavailable") from exc
    return {"text": result.get("text", ""), "language": result.get("language_code")}


@router.get("/testing/definitions", summary="Agent Testing definitions (as synced to ElevenLabs)")
async def testing_definitions(_: User = Depends(require_roles(*STAFF))) -> list[dict[str, Any]]:
    return agent_tests_payload()


@router.post("/testing/run", summary="Run the guardrail scenario suite (isolated; rolled back)")
async def run_tests(_: User = Depends(require_roles(*STAFF)), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    results = await run_isolated(c)
    return {"results": results, "passed": sum(1 for r in results if r["passed"]), "total": len(results)}


@router.post("/sync", summary="Create/update the ElevenLabs agent from code (admin). dry_run returns the config.")
async def sync(dry_run: bool = True, _: User = Depends(require_roles(UserRole.ADMIN)), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    if dry_run or c.infra.elevenlabs is None:
        return {"dry_run": True, "configured": c.infra.elevenlabs is not None, "config": build_agent_config(c.settings)}
    try:
        return await sync_agent(c.infra.elevenlabs, c.settings, list(load_documents()), dry_run=False)
    except ElevenLabsError as exc:
        raise ServiceUnavailable(f"ElevenLabs sync failed: {exc}") from exc


@router.get("/sessions/{call_id}", summary="LangGraph conversation state and path for a call")
async def agent_session(call_id: uuid.UUID, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    call = await c.calls.get(call_id, user)
    session = await c.calls_repo.agent_session(call.id)
    if session is None:
        raise NotFound("No agent session")
    return {"graph": session.graph, "thread_id": session.thread_id, "current_node": session.current_node,
            "sub_agent": session.sub_agent.value if session.sub_agent else None, "steps": session.steps, "path": session.path,
            "state": {k: v for k, v in (session.state or {}).items() if k not in ("slots",)}}
