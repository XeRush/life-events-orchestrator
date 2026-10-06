import uuid
from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import CallDirection, CallProvider, CallState, SubAgent, TranscriptRole


class CallSession(UUIDPrimaryKey, TimestampMixin, Base):
    """One voice call (ElevenLabs or the simulated channel), inbound or a proactive callback."""

    __tablename__ = "call_sessions"

    case_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
    callback_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    direction: Mapped[CallDirection] = mapped_column(enum_type(CallDirection))
    provider: Mapped[CallProvider] = mapped_column(enum_type(CallProvider), default=CallProvider.SIMULATED)
    provider_conversation_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    language: Mapped[str] = mapped_column(String(8), default="en")
    state: Mapped[CallState] = mapped_column(enum_type(CallState), default=CallState.ACTIVE, index=True)
    sub_agent: Mapped[SubAgent] = mapped_column(enum_type(SubAgent), default=SubAgent.ROUTER)
    disclosure_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_method: Mapped[str | None] = mapped_column(String(40), nullable=True)
    muted: Mapped[bool] = mapped_column(Boolean, default=False)
    transferred_to_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    extracted_fields: Mapped[dict] = mapped_column(JSONType, default=dict)  # names + safe values only


class Transcript(UUIDPrimaryKey, TimestampMixin, Base):
    """One utterance. Text is redacted before storage (Emirates IDs, passport numbers and phone numbers removed)."""

    __tablename__ = "transcripts"
    __table_args__ = (UniqueConstraint("call_session_id", "seq"),)

    call_session_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("call_sessions.id", ondelete="CASCADE"), index=True)
    case_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    seq: Mapped[int] = mapped_column(Integer)
    role: Mapped[TranscriptRole] = mapped_column(enum_type(TranscriptRole))
    text: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(8), default="en")
    sub_agent: Mapped[SubAgent | None] = mapped_column(enum_type(SubAgent), nullable=True)
    tool_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    is_disclosure: Mapped[bool] = mapped_column(Boolean, default=False)


class AgentSession(UUIDPrimaryKey, TimestampMixin, Base):
    """LangGraph run state for a conversation or a case orchestration pass (PII-free)."""

    __tablename__ = "agent_sessions"

    call_session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("call_sessions.id", ondelete="CASCADE"), nullable=True, index=True)
    case_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), nullable=True, index=True)
    graph: Mapped[str] = mapped_column(String(30))  # conversation | orchestrator
    thread_id: Mapped[str] = mapped_column(String(80), index=True)
    current_node: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sub_agent: Mapped[SubAgent | None] = mapped_column(enum_type(SubAgent), nullable=True)
    state: Mapped[dict] = mapped_column(JSONType, default=dict)
    path: Mapped[list] = mapped_column(JSONType, default=list)
    steps: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    trace_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
