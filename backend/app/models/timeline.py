import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import ActorType


class TimelineEvent(UUIDPrimaryKey, TimestampMixin, Base):
    """Resident-facing digital timeline entry, derived from persisted domain events."""

    __tablename__ = "timeline_events"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("life_event_cases.id"), index=True)
    event_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("events.id"), nullable=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    category: Mapped[str] = mapped_column(String(32), default="workflow")
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    actor_type: Mapped[ActorType] = mapped_column(enum_type(ActorType), default=ActorType.SYSTEM)
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    details: Mapped[dict] = mapped_column(JSONType, default=dict)
