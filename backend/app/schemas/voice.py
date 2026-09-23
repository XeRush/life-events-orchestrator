from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class StartSessionIn(BaseModel):
    mode: str = Field(default="inbound", description="inbound (resident calls) or callback (answering a proactive call)")
    case_id: str | None = None
    callback_id: UUID | None = None
    language: str | None = None


class TurnIn(BaseModel):
    utterance: str = Field(min_length=1, max_length=1000)


class TranscriptMessage(BaseModel):
    role: str
    text: str = Field(max_length=4000)


class TranscriptIn(BaseModel):
    messages: list[TranscriptMessage] = Field(default_factory=list)
    provider_conversation_id: str | None = None


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    case_id: UUID | None
    callback_id: UUID | None
    channel: str
    status: str
    provider: str
    language: str
    transcript: list[dict[str, Any]]
    summary: str | None
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: float | None
