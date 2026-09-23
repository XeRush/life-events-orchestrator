"""Provider-neutral DTOs for the voice layer + the subset of ElevenLabs payloads we consume."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ToolSpec(BaseModel):
    """A backend function exposed to the voice agent (rendered as an ElevenLabs webhook tool)."""

    name: str
    description: str
    parameters: dict[str, dict[str, Any]] = Field(default_factory=dict)  # name -> JSON-schema property
    required: list[str] = Field(default_factory=list)


class SignedUrl(BaseModel):
    signed_url: str


class OutboundCallRequest(BaseModel):
    callback_id: str
    conversation_id: str
    case_reference: str
    to_number: str | None = None
    language: str = "en"
    script: str
    dynamic_variables: dict[str, str] = Field(default_factory=dict)


class OutboundCallResult(BaseModel):
    provider: str
    status: str  # "completed" (finished synchronously) | "initiated" (webhook will finish it) | "failed"
    call_id: str | None = None
    transcript: list[dict[str, Any]] = Field(default_factory=list)
    duration_seconds: float | None = None
    outcome: str | None = None
    detail: str | None = None


class TranscriptTurn(BaseModel):
    role: str
    message: str | None = None
    time_in_call_secs: float | None = None


class PostCallData(BaseModel):
    conversation_id: str
    agent_id: str | None = None
    status: str | None = None
    transcript: list[TranscriptTurn] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    analysis: dict[str, Any] = Field(default_factory=dict)
    conversation_initiation_client_data: dict[str, Any] = Field(default_factory=dict)

    @property
    def dynamic_variables(self) -> dict[str, Any]:
        return (self.conversation_initiation_client_data or {}).get("dynamic_variables", {}) or {}

    @property
    def duration_seconds(self) -> float | None:
        value = (self.metadata or {}).get("call_duration_secs")
        return float(value) if value is not None else None


class WebhookEnvelope(BaseModel):
    type: str
    event_timestamp: int | None = None
    data: dict[str, Any] = Field(default_factory=dict)
