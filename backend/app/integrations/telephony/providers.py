"""Outbound calling.

* ElevenLabsTwilioTelephony: a real outbound call placed by the ElevenLabs agent on the Twilio number imported in
  ElevenLabs (ELEVENLABS_PHONE_NUMBER_ID). The conversation is handled by ElevenLabs; the post-call webhook writes the
  outcome back into the case.
* SimulatedTelephony: no phone call is made. The callback rings in the resident's web console instead (the same
  CallSession, disclosure, verification and dialog engine), so the full flow is demonstrable without credentials.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from app.core.config import Settings
from app.integrations.elevenlabs.client import ElevenLabsClient, ElevenLabsError

if TYPE_CHECKING:
    pass


@dataclass
class DialResult:
    provider: str
    rings_in_browser: bool
    provider_conversation_id: str | None = None
    detail: str = ""


class TelephonyError(Exception):
    pass


class SimulatedTelephony:
    name = "SIMULATED"

    async def dial(self, *, to_number: str | None, client_data: dict[str, Any]) -> DialResult:
        return DialResult(provider=self.name, rings_in_browser=True, detail="Simulated call: ringing in the resident's LifeLoop app.")


class ElevenLabsTwilioTelephony:
    name = "ELEVENLABS"

    def __init__(self, settings: Settings, client: ElevenLabsClient) -> None:
        self.settings = settings
        self.client = client

    async def dial(self, *, to_number: str | None, client_data: dict[str, Any]) -> DialResult:
        if not to_number:
            raise TelephonyError("No phone number on file for this resident")
        try:
            data = await self.client.outbound_call(agent_id=self.settings.elevenlabs_agent_id,
                                                   phone_number_id=self.settings.elevenlabs_phone_number_id,
                                                   to_number=to_number, client_data=client_data)
        except ElevenLabsError as exc:
            raise TelephonyError(str(exc)) from exc
        return DialResult(provider=self.name, rings_in_browser=False, provider_conversation_id=data.get("conversation_id"),
                          detail="Outbound call placed through ElevenLabs telephony.")


def build_telephony(settings: Settings, client: ElevenLabsClient | None) -> SimulatedTelephony | ElevenLabsTwilioTelephony:
    if settings.elevenlabs_configured and settings.elevenlabs_phone_number_id and client is not None:
        return ElevenLabsTwilioTelephony(settings, client)
    return SimulatedTelephony()
