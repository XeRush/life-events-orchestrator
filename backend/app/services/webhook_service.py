"""Inbound webhooks: signature verification, replay protection, idempotency, redacted persistence.

ElevenLabs signs post-call webhooks with `ElevenLabs-Signature: t=<unix>,v0=<hmac-sha256(secret, "<t>.<body>")>`.
* Signature: required whenever ELEVENLABS_WEBHOOK_SECRET is set; in production an unset secret rejects everything.
* Replay: timestamps outside WEBHOOK_TOLERANCE_SECONDS fail; each signature is accepted once (cache nonce).
* Idempotency: one IntegrationEvent per (provider, type, conversation) - provider retries are acknowledged, not re-run.
* The handler only records and enqueues (PostCallWebhookReceived); processing happens in the agent-events consumer.
"""
from __future__ import annotations

import hashlib
import json
from typing import TYPE_CHECKING, Any

from sqlalchemy import select

from app.core.clock import utcnow
from app.core.errors import Unauthorized, ValidationFailed
from app.core.pii import redact_value
from app.core.security import verify_hmac_signature
from app.events.recorder import Actor
from app.models.enums import IntegrationDirection, IntegrationStatus, Source
from app.models.integration import IntegrationEvent
from app.observability.logging import get_logger

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

log = get_logger("lifeloop.webhooks")


class WebhookService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def elevenlabs(self, body: bytes, signature: str | None) -> dict[str, Any]:
        settings = self.c.settings
        secret = settings.elevenlabs_webhook_secret
        signature_valid: bool | None = None
        if secret:
            ok, _ = verify_hmac_signature(secret, body, signature, settings.webhook_tolerance_seconds)
            if not ok:
                await self.c.events.audit("WebhookRejected", actor=Actor.provider("ElevenLabs"), result="DENIED", source=Source.SYSTEM,
                                          details={"why": "invalid or expired signature"})
                await self.c.commit()
                raise Unauthorized("Invalid webhook signature", code="invalid_signature")
            if not await self.c.infra.cache.set_if_absent(f"webhook:nonce:{hashlib.sha256((signature or '').encode()).hexdigest()}",
                                                          settings.webhook_tolerance_seconds * 2):
                return {"status": "duplicate", "reason": "replayed signature"}
            signature_valid = True
        elif settings.environment == "production":
            raise Unauthorized("Webhook signing secret is not configured", code="webhook_not_configured")
        try:
            envelope = json.loads(body)
        except json.JSONDecodeError as exc:
            raise ValidationFailed("Malformed webhook body") from exc
        kind = str(envelope.get("type", "unknown"))[:60]
        data = envelope.get("data") or {}
        conversation_id = str(data.get("conversation_id") or envelope.get("event_timestamp") or "")[:120]
        key = f"elevenlabs:{kind}:{conversation_id}"
        existing = await self.c.session.scalar(select(IntegrationEvent).where(IntegrationEvent.idempotency_key == key))
        if existing is not None:
            return {"status": "duplicate", "integration_event_id": str(existing.id)}
        event = IntegrationEvent(provider="ELEVENLABS", direction=IntegrationDirection.INBOUND, event_type=kind, external_id=conversation_id,
                                 idempotency_key=key, signature_valid=signature_valid, status=IntegrationStatus.RECEIVED,
                                 payload=redact_value(data), received_at=utcnow())
        self.c.session.add(event)
        await self.c.session.flush()
        if kind == "post_call_transcription":
            await self.c.events.emit("PostCallWebhookReceived", actor=Actor.provider("ElevenLabs"), source=Source.AI_AGENT, timeline=False,
                                     payload={"integration_event_id": str(event.id), "conversation_id": conversation_id})
        else:
            event.status, event.processed_at = IntegrationStatus.PROCESSED, utcnow()
        log.info("webhook_received", provider="ELEVENLABS", type=kind, signature_valid=signature_valid)
        return {"status": "accepted", "integration_event_id": str(event.id)}
