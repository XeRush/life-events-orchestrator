import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import CallbackStatus


class Callback(UUIDPrimaryKey, TimestampMixin, Base):
    """A proactive call decided by a state change. Consent and opt-out are checked at scheduling AND at dial time."""

    __tablename__ = "callbacks"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    node_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reason: Mapped[str] = mapped_column(String(40))  # CLEARED | BLOCKED | DOCUMENT_MISSING | STALLED | HUMAN_ESCALATION | PARENT_INPUT
    reasons: Mapped[list] = mapped_column(JSONType, default=list)  # coalesced updates
    trigger_event: Mapped[str] = mapped_column(String(64))
    status: Mapped[CallbackStatus] = mapped_column(enum_type(CallbackStatus), default=CallbackStatus.SCHEDULED, index=True)
    channel: Mapped[str] = mapped_column(String(10), default="VOICE")
    language: Mapped[str] = mapped_column(String(8), default="en")
    consent_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    scheduled_for: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    dialed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    call_session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    provider: Mapped[str | None] = mapped_column(String(20), nullable=True)
