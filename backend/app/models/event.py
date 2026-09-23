import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import ActorType


class Event(UUIDPrimaryKey, TimestampMixin, Base):
    """Persisted domain event AND audit record (append-only by convention).

    Doubles as the outbox for the PostgreSQL-backed event bus: `processed` flips once all
    handlers have run.
    """

    __tablename__ = "events"

    event_type: Mapped[str] = mapped_column(String(64), index=True)
    case_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("life_event_cases.id"), nullable=True, index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    actor: Mapped[str] = mapped_column(String(120), default="system")
    actor_type: Mapped[ActorType] = mapped_column(enum_type(ActorType), default=ActorType.SYSTEM)
    old_state: Mapped[str | None] = mapped_column(String(40), nullable=True)
    new_state: Mapped[str | None] = mapped_column(String(40), nullable=True)
    event_metadata: Mapped[dict] = mapped_column("metadata", JSONType, default=dict)
    source: Mapped[str] = mapped_column(String(60), default="lifeloop")
    idempotency_key: Mapped[str | None] = mapped_column(String(160), unique=True, nullable=True)
    processed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    processed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
