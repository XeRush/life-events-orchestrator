"""Outbound (proactive) call providers. The callback engine depends only on `OutboundCaller`."""
from __future__ import annotations

from abc import ABC, abstractmethod

from app.core.config import Settings
from app.core.logging import get_logger
from app.integrations.elevenlabs.client import ElevenLabsClient, ElevenLabsError
from app.integrations.elevenlabs.schemas import OutboundCallRequest, OutboundCallResult

log = get_logger("lifeloop.callbacks.provider")


def estimate_speech_seconds(text: str) -> float:
    """Deterministic duration estimate (~2.4 words/sec speech + connection overhead)."""
    return round(12 + len(text.split()) / 2.4, 1)


class OutboundCaller(ABC):
    provider: str

    @abstractmethod
    async def place_call(self, request: OutboundCallRequest) -> OutboundCallResult: ...


class SimulatedCaller(OutboundCaller):
    """Used when ElevenLabs telephony is not configured. Produces the exact script the real agent would open with."""

    provider = "simulated"

    def __init__(self, reason: str = "ElevenLabs outbound telephony is not configured") -> None:
        self.reason = reason

    async def place_call(self, request: OutboundCallRequest) -> OutboundCallResult:
        return OutboundCallResult(
            provider=self.provider, status="completed", call_id=None,
            transcript=[{"role": "agent", "text": request.script}],
            duration_seconds=estimate_speech_seconds(request.script),
            outcome="Resident notified (simulated voice channel).", detail=self.reason,
        )


class ElevenLabsOutboundCaller(OutboundCaller):
    provider = "elevenlabs"

    def __init__(self, client: ElevenLabsClient, settings: Settings, fallback: OutboundCaller | None = None) -> None:
        self.client = client
        self.settings = settings
        self.fallback = fallback or SimulatedCaller()

    async def place_call(self, request: OutboundCallRequest) -> OutboundCallResult:
        if not request.to_number or not self.settings.elevenlabs_phone_number_id:
            missing = "resident phone number" if not request.to_number else "ELEVENLABS_PHONE_NUMBER_ID"
            log.info("outbound_call_fallback", reason=f"missing {missing}", callback_id=request.callback_id)
            return await SimulatedCaller(f"Real call skipped: missing {missing}").place_call(request)
        try:
            data = await self.client.outbound_call(
                agent_id=self.settings.elevenlabs_agent_id,
                phone_number_id=self.settings.elevenlabs_phone_number_id,
                to_number=request.to_number,
                client_data={
                    "dynamic_variables": {**request.dynamic_variables, "lifeloop_conversation_id": request.conversation_id},
                    "conversation_config_override": {
                        "agent": {"first_message": request.script, "language": request.language}
                    },
                },
            )
        except ElevenLabsError as exc:
            log.error("outbound_call_failed", callback_id=request.callback_id, error=str(exc), retriable=exc.retriable)
            return OutboundCallResult(provider=self.provider, status="failed", detail=str(exc))
        return OutboundCallResult(
            provider=self.provider, status="initiated", call_id=data.get("conversation_id") or data.get("callSid"),
            outcome="Call placed; awaiting post-call webhook.",
        )


def build_caller(settings: Settings, client: ElevenLabsClient | None = None) -> OutboundCaller:
    if settings.elevenlabs_configured:
        return ElevenLabsOutboundCaller(client or ElevenLabsClient.from_settings(settings), settings)
    return SimulatedCaller()
