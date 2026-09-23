import json
import uuid
from typing import Any

from fastapi import APIRouter, Body, Depends, Query, Request
from sqlalchemy import select

from app.agents.tools import TOOL_SPECS
from app.api.deps import STAFF, get_container, get_current_user, limit, require_roles, require_tool_secret
from app.core.errors import Unauthorized, ValidationFailed
from app.core.security import verify_hmac_signature
from app.integrations.elevenlabs.agent import build_agent_config, sync_agent
from app.integrations.elevenlabs.client import ElevenLabsError
from app.integrations.elevenlabs.schemas import WebhookEnvelope
from app.models.conversation import Conversation
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.voice import ConversationOut, StartSessionIn, TranscriptIn, TurnIn
from app.services.container import ServiceContainer

router = APIRouter(prefix="/voice", tags=["voice"])


@router.get("/config", summary="Which voice provider is active (never returns secrets)")
async def voice_config(_: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return c.voice.status()


@router.post("/sessions", summary="Start a voice session",
             description="Returns an ElevenLabs signed URL when configured (browser connects directly to ElevenLabs), otherwise an "
                         "opening message for the backend dialog engine. Either way a persistent Conversation is created.",
             dependencies=[Depends(limit())])
async def start_session(body: StartSessionIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    info = await c.voice.start(user, mode=body.mode, case_id=body.case_id, callback_id=body.callback_id, language=body.language)
    await c.commit()
    return info


@router.post("/sessions/{conversation_id}/turn", summary="One resident utterance -> agent reply (simulated channel)")
async def turn(conversation_id: uuid.UUID, body: TurnIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    result = await c.voice.turn(user, conversation_id, body.utterance)
    await c.commit()
    return result


@router.post("/sessions/{conversation_id}/transcript", response_model=ConversationOut, summary="Append transcript from a browser ElevenLabs session")
async def push_transcript(conversation_id: uuid.UUID, body: TranscriptIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)):
    conv = await c.voice.append_transcript(user, conversation_id, [m.model_dump() for m in body.messages], body.provider_conversation_id)
    await c.commit()
    return conv


@router.post("/sessions/{conversation_id}/end", response_model=ConversationOut, summary="End the session")
async def end_session(conversation_id: uuid.UUID, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)):
    conv = await c.voice.end(user, conversation_id)
    await c.commit()
    return conv


@router.get("/conversations", response_model=list[ConversationOut], summary="Call history")
async def conversations(case_id: str | None = None, limit: int = Query(30, ge=1, le=100), user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)):
    q = select(Conversation).order_by(Conversation.started_at.desc()).limit(limit)
    if case_id:
        q = q.where(Conversation.case_id == (await c.cases.resolve(case_id, user)).id)
    elif user.role not in {UserRole.ADMIN, UserRole.OPERATOR}:
        q = q.where(Conversation.user_id == user.id)
    return list((await c.session.scalars(q)).all())


@router.get("/conversations/{conversation_id}", response_model=ConversationOut, summary="One conversation with transcript")
async def conversation(conversation_id: uuid.UUID, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)):
    return await c.voice.get(conversation_id, user)


@router.post("/webhook", summary="ElevenLabs post-call webhook",
             description="Verifies the `ElevenLabs-Signature` header (HMAC-SHA256) when ELEVENLABS_WEBHOOK_SECRET is set, then stores the "
                         "transcript and completes the related callback. Duplicate deliveries are ignored.")
async def webhook(request: Request, c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    raw = await request.body()
    secret = c.settings.elevenlabs_webhook_secret
    if secret and not verify_hmac_signature(secret, raw, request.headers.get("elevenlabs-signature", "")):
        raise Unauthorized("Invalid webhook signature")
    try:
        envelope = WebhookEnvelope.model_validate(json.loads(raw or b"{}"))
    except (ValueError, TypeError) as exc:
        raise ValidationFailed("Malformed webhook payload") from exc
    result = await c.voice.handle_webhook(envelope)
    await c.commit()
    return result


@router.post("/tools/{tool_name}", summary="Voice-agent tool endpoint (ElevenLabs webhook tools call this)",
             description="Authenticated with the `X-LifeLoop-Tool-Secret` header. The resident is identified by `resident_id` "
                         "(an ElevenLabs dynamic variable). Every case fact the agent speaks comes from these tools.",
             dependencies=[Depends(require_tool_secret)])
async def run_tool(tool_name: str, args: dict[str, Any] = Body(default_factory=dict), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    resident_id = args.pop("resident_id", None)
    user = None
    if resident_id:
        try:
            user = await c.session.get(User, uuid.UUID(str(resident_id)))
        except ValueError:
            user = None
    if user is None and c.settings.demo_mode:
        user = await c.session.scalar(select(User).where(User.email == c.settings.demo_user_email))
    if user is None:
        return {"ok": False, "error": "unknown_resident", "message": "I could not identify the resident for this call."}
    result = await c.agent.tools.run(tool_name, user, args)
    await c.commit()
    return result


@router.get("/agent", summary="The agent definition LIFELOOP would push to ElevenLabs (prompt + tools)")
async def agent_definition(_: User = Depends(require_roles(*STAFF)), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    config = build_agent_config(c.settings, TOOL_SPECS)
    for tool in config["conversation_config"]["agent"]["prompt"]["tools"]:
        tool["api_schema"]["request_headers"] = {"X-LifeLoop-Tool-Secret": "[REDACTED]"}
    return config


@router.post("/agent/sync", summary="Create or update the ElevenLabs agent from the definition above")
async def agent_sync(_: User = Depends(require_roles(UserRole.ADMIN)), c: ServiceContainer = Depends(get_container)) -> dict[str, str]:
    if not c.settings.elevenlabs_api_key:
        raise ValidationFailed("ELEVENLABS_API_KEY is not configured", code="elevenlabs_not_configured")
    try:
        return await sync_agent(c.voice.client, c.settings, TOOL_SPECS)
    except ElevenLabsError as exc:
        raise ValidationFailed(f"ElevenLabs rejected the request: {exc}", code="elevenlabs_error") from exc
