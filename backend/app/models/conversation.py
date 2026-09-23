import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.clock import utcnow
from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import ConversationChannel, ConversationStatus


class Conversation(UUIDPrimaryKey, TimestampMixin, Base):
    """A voice interaction (inbound call, outbound callback or demo session)."""

    __tablename__ = "conversations"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    case_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("life_event_cases.id"), nullable=True, index=True)
    callback_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    channel: Mapped[ConversationChannel] = mapped_column(enum_type(ConversationChannel), default=ConversationChannel.DEMO)
    status: Mapped[ConversationStatus] = mapped_column(enum_type(ConversationStatus), default=ConversationStatus.ACTIVE)
    provider: Mapped[str] = mapped_column(String(40), default="simulated")
    provider_conversation_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    language: Mapped[str] = mapped_column(String(8), default="en")
    transcript: Mapped[list] = mapped_column(JSONType, default=list)  # [{role, text, at, tool?}]
    state: Mapped[dict] = mapped_column(JSONType, default=dict)  # dialog state for the demo engine
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
