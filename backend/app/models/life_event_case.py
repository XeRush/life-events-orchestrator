import uuid
from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import CaseStatus


class LifeEventCase(UUIDPrimaryKey, TimestampMixin, Base):
    """The persistent Life Event Case - the resident's 'passport' for one life event."""

    __tablename__ = "life_event_cases"

    reference: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    life_event_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("life_events.id"), index=True)
    workflow_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workflows.id"))
    status: Mapped[CaseStatus] = mapped_column(enum_type(CaseStatus), default=CaseStatus.PENDING_CONSENT, index=True)
    title: Mapped[str] = mapped_column(String(120))
    event_type: Mapped[str] = mapped_column(String(40), index=True)
    event_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    participants: Mapped[list] = mapped_column(JSONType, default=list)
    preferences: Mapped[dict] = mapped_column(JSONType, default=dict)
    memory: Mapped[dict] = mapped_column(JSONType, default=dict)  # facts already collected - never asked twice
    source: Mapped[str] = mapped_column(String(40), default="voice")
    idempotency_key: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
