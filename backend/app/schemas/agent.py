"""Voice-agent request schemas."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class StartCallIn(BaseModel):
    case_reference: str | None = Field(default=None, max_length=40)
    language: str | None = Field(default=None, max_length=8)


class TurnIn(BaseModel):
    utterance: str = Field(min_length=1, max_length=1000)


class MuteIn(BaseModel):
    muted: bool


class LanguageIn(BaseModel):
    language: Literal["en", "ar", "hi", "ur", "ml", "tl"]


class TranscriptMessage(BaseModel):
    role: Literal["agent", "user"]
    text: str = Field(max_length=4000)


class TranscriptIn(BaseModel):
    messages: list[TranscriptMessage] = Field(max_length=20)
    provider_conversation_id: str | None = Field(default=None, max_length=80)


class ToolCallIn(BaseModel):
    """Body of an ElevenLabs server-tool call. `lifeloop_call_id` is injected from a dynamic variable."""

    lifeloop_call_id: str = Field(min_length=10, max_length=64)
    arguments: dict = Field(default_factory=dict)


class TtsIn(BaseModel):
    text: str = Field(min_length=1, max_length=1200)
    language: str | None = Field(default=None, max_length=8)
