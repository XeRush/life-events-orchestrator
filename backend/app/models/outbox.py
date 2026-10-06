import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import OutboxStatus


class OutboxEvent(UUIDPrimaryKey, TimestampMixin, Base):
    """Transactional outbox: written in the same transaction as the state change, relayed to Kafka afterwards."""

    __tablename__ = "outbox_events"
    __table_args__ = (Index("ix_outbox_status_available", "status", "available_at"),)

    event_type: Mapped[str] = mapped_column(String(64), index=True)
    category: Mapped[str] = mapped_column(String(40))
    topic: Mapped[str] = mapped_column(String(80))
    case_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), nullable=True, index=True)
    node_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    actor: Mapped[str] = mapped_column(String(160), default="LifeLoop")
    source: Mapped[str] = mapped_column(String(30), default="SYSTEM")
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    idempotency_key: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    status: Mapped[OutboxStatus] = mapped_column(enum_type(OutboxStatus), default=OutboxStatus.PENDING)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    available_at: Mapped[datetime] = mapped_column(UTCDateTime)
    published_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    trace_id: Mapped[str | None] = mapped_column(String(40), nullable=True)


class ConsumerReceipt(UUIDPrimaryKey, TimestampMixin, Base):
    """Exactly-once effect per consumer: a redelivered event is acknowledged without re-running the handler."""

    __tablename__ = "consumer_receipts"
    __table_args__ = (UniqueConstraint("consumer", "event_id"),)

    consumer: Mapped[str] = mapped_column(String(64))
    event_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
