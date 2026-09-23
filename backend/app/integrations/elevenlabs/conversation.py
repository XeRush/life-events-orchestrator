"""Voice session lifecycle: start (ElevenLabs signed URL or simulated), turns, end, post-call webhooks."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from app.core.clock import utcnow
from app.core.errors import Conflict, Forbidden, NotFound
from app.core.logging import get_logger
from app.integrations.elevenlabs.client import ElevenLabsClient, ElevenLabsError
from app.integrations.elevenlabs.schemas import PostCallData, WebhookEnvelope
from app.models.conversation import Conversation
from app.models.enums import CallbackStatus, ConversationChannel, ConversationStatus, UserRole
from app.models.life_event_case import LifeEventCase
from app.models.user import User

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

log = get_logger("lifeloop.voice")


class ConversationManager:
    def __init__(self, c: ServiceContainer, client: ElevenLabsClient | None = None) -> None:
        self.c = c
        self._client = client

    @property
    def client(self) -> ElevenLabsClient:
        if self._client is None:
            self._client = ElevenLabsClient.from_settings(self.c.settings)
        return self._client

    def status(self) -> dict[str, Any]:
        s = self.c.settings
        return {
            "provider": "elevenlabs" if s.elevenlabs_configured else "simulated",
            "elevenlabs_configured": s.elevenlabs_configured,
            "outbound_telephony_configured": bool(s.elevenlabs_configured and s.elevenlabs_phone_number_id),
            "agent_id_set": bool(s.elevenlabs_agent_id),
            "webhook_signature_required": bool(s.elevenlabs_webhook_secret),
            "note": None if s.elevenlabs_configured else "Set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID for live voice; the backend dialog engine is used meanwhile.",
        }

    async def get(self, conversation_id: uuid.UUID, user: User | None = None) -> Conversation:
        conv = await self.c.session.get(Conversation, conversation_id)
        if not conv:
            raise NotFound("Conversation not found")
        if user and user.role not in {UserRole.ADMIN, UserRole.OPERATOR} and conv.user_id != user.id:
            raise Forbidden("This conversation belongs to another resident")
        return conv

    async def start(self, user: User, *, mode: str = "inbound", case_id: str | None = None, callback_id: uuid.UUID | None = None, language: str | None = None) -> dict[str, Any]:
        s = self.c.session
        lang = language or user.preferred_language
        case: LifeEventCase | None = await self.c.cases.resolve(case_id, user) if case_id else await self.c.cases.latest_active(user.id)
        callback = await self.c.callbacks.get(callback_id) if callback_id else None
        script = None
        if callback:
            case = await s.get(LifeEventCase, callback.case_id)
            snapshot = await self.c.cases.snapshot(case)
            script = callback.payload.get("script") or self.c.agent.compose_callback_script(snapshot, callback.payload.get("updates", []), callback.language)
        conv = Conversation(
            user_id=user.id, case_id=case.id if case else None, callback_id=callback.id if callback else None,
            channel=ConversationChannel.VOICE_OUTBOUND if callback else ConversationChannel.VOICE_INBOUND,
            language=lang, transcript=[], state={"stage": "callback" if callback else "greeting"}, started_at=utcnow(),
        )
        s.add(conv)
        await s.flush()
        dynamic = {
            "resident_id": str(user.id), "case_reference": case.reference if case else "", "language": lang,
            "lifeloop_conversation_id": str(conv.id),
        }
        info: dict[str, Any] = {"conversation_id": str(conv.id), "language": lang, "case_reference": case.reference if case else None, "dynamic_variables": dynamic}
        provider, fallback_reason, signed_url = "simulated", None, None
        if self.c.settings.elevenlabs_configured:
            try:
                signed_url = await self.client.get_signed_url(self.c.settings.elevenlabs_agent_id)
                provider = "elevenlabs"
            except ElevenLabsError as exc:
                fallback_reason = f"ElevenLabs unavailable ({exc}); using the backend dialog engine."
                log.error("voice_session_fallback", error=str(exc))
        else:
            fallback_reason = "ElevenLabs is not configured; using the backend dialog engine."
        conv.provider = provider
        opening = None
        if provider == "simulated":
            opening = await self.c.agent.opening_message(user, conv, callback_script=script)
            conv.transcript = [{"role": "agent", "text": opening, "at": utcnow().isoformat()}]
        elif script:
            dynamic["callback_script"] = script
        info.update(provider=provider, signed_url=signed_url, opening_message=opening, fallback_reason=fallback_reason,
                    first_message_override=script if provider == "elevenlabs" else None)
        return info

    async def turn(self, user: User, conversation_id: uuid.UUID, utterance: str) -> dict[str, Any]:
        conv = await self.get(conversation_id, user)
        if conv.status != ConversationStatus.ACTIVE:
            raise Conflict("This conversation has ended")
        if conv.provider == "elevenlabs":
            raise Conflict("This session is handled by ElevenLabs; text turns are only for the simulated voice channel")
        reply = await self.c.agent.respond(user, conv, utterance)
        if reply.case_reference and not conv.case_id:
            case = await self.c.cases.resolve(reply.case_reference, user)
            conv.case_id = case.id
        return {"reply": reply.text, "tool_calls": reply.tool_calls, "stage": reply.stage, "case_reference": reply.case_reference}

    async def append_transcript(self, user: User, conversation_id: uuid.UUID, messages: list[dict[str, str]], provider_conversation_id: str | None = None) -> Conversation:
        """Browser-side ElevenLabs sessions push their transcript so the console can show it."""
        conv = await self.get(conversation_id, user)
        if provider_conversation_id:
            conv.provider_conversation_id = provider_conversation_id
        conv.transcript = [*(conv.transcript or []), *[{"role": m["role"], "text": m["text"], "at": utcnow().isoformat()} for m in messages]]
        return conv

    async def end(self, user: User, conversation_id: uuid.UUID) -> Conversation:
        conv = await self.get(conversation_id, user)
        if conv.status == ConversationStatus.ACTIVE:
            await self._finish(conv, (utcnow() - conv.started_at).total_seconds(), "Call ended by the resident.")
        return conv

    async def _finish(self, conv: Conversation, duration: float, outcome: str) -> None:
        conv.status = ConversationStatus.COMPLETED
        conv.ended_at = utcnow()
        conv.duration_seconds = round(duration, 1)
        if conv.callback_id:
            cb = await self.c.callbacks.get(conv.callback_id)
            if cb.status in {CallbackStatus.IN_PROGRESS, CallbackStatus.SCHEDULED}:
                cb.conversation_id = conv.id
                cb.provider = cb.provider or conv.provider
                await self.c.callbacks.complete(cb, duration=conv.duration_seconds, outcome=outcome)

    # ---- webhooks ------------------------------------------------------------------------------
    async def handle_webhook(self, envelope: WebhookEnvelope) -> dict[str, Any]:
        if envelope.type == "post_call_transcription":
            data = PostCallData.model_validate(envelope.data)
            conv = None
            local_id = data.dynamic_variables.get("lifeloop_conversation_id")
            if local_id:
                try:
                    conv = await self.c.session.get(Conversation, uuid.UUID(str(local_id)))
                except ValueError:
                    conv = None
            if conv is None:
                from sqlalchemy import select
                conv = await self.c.session.scalar(select(Conversation).where(Conversation.provider_conversation_id == data.conversation_id))
            if conv is None:
                log.warning("voice_webhook_unmatched", conversation=data.conversation_id)
                return {"matched": False}
            if conv.status == ConversationStatus.COMPLETED and conv.provider_conversation_id == data.conversation_id:
                return {"matched": True, "duplicate": True}  # webhooks are retried by the provider
            conv.provider_conversation_id = data.conversation_id
            conv.provider = "elevenlabs"
            conv.transcript = [
                {"role": "agent" if t.role == "agent" else "user", "text": t.message or "", "at": utcnow().isoformat()}
                for t in data.transcript if t.message
            ]
            conv.summary = (data.analysis or {}).get("transcript_summary")
            outcome = "Resident answered; call completed." if data.transcript else "No conversation took place."
            await self._finish(conv, data.duration_seconds or (utcnow() - conv.started_at).total_seconds(), outcome)
            return {"matched": True, "conversation_id": str(conv.id)}
        if envelope.type == "call_initiation_failure":
            conv_id = ((envelope.data.get("metadata") or {}).get("conversation_id")) or envelope.data.get("conversation_id")
            log.warning("voice_call_initiation_failure", conversation=conv_id)
            return {"matched": False, "type": envelope.type}
        return {"matched": False, "ignored": envelope.type}
