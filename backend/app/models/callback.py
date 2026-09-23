import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import CallbackStatus


class Callback(UUIDPrimaryKey, TimestampMixin, Base):
    """A proactive outbound call to the resident, driven by a meaningful state change."""

    __tablename__ = "callbacks"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("life_event_cases.id"), index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    status: Mapped[CallbackStatus] = mapped_column(enum_type(CallbackStatus), default=CallbackStatus.SCHEDULED, index=True)
    reason: Mapped[str] = mapped_column(Text)
    trigger_event_type: Mapped[str] = mapped_column(String(64), index=True)
    trigger_event_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    scheduled_for: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    channel: Mapped[str] = mapped_column(String(20), default="voice")
    language: Mapped[str] = mapped_column(String(8), default="en")
    provider: Mapped[str | None] = mapped_column(String(40), nullable=True)
    provider_call_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)  # {"updates": [...], "script": "..."}
    idempotency_key: Mapped[str] = mapped_column(String(160), unique=True)
