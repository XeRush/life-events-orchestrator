import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import ActorType, Source


class CaseEvent(UUIDPrimaryKey, TimestampMixin, Base):
    """The case timeline: every meaningful state change, with who said it (agent, authority, parent, officer)."""

    __tablename__ = "case_events"
    __table_args__ = (Index("ix_case_events_case_occurred", "case_id", "occurred_at"),)

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"))
    node_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[Source] = mapped_column(enum_type(Source), default=Source.SYSTEM)
    actor: Mapped[str] = mapped_column(String(160), default="LifeLoop")
    actor_type: Mapped[ActorType] = mapped_column(enum_type(ActorType), default=ActorType.SYSTEM)
    status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    resident_present: Mapped[bool] = mapped_column(Boolean, default=False)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONType, default=dict)
    trace_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    outbox_event_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime)
