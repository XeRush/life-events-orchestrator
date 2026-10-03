import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import Entity


class EntityRequest(UUIDPrimaryKey, TimestampMixin, Base):
    """A filing with a (mock) authority. The idempotency key guarantees one application per node attempt."""

    __tablename__ = "entity_requests"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("life_event_nodes.id", ondelete="CASCADE"), index=True)
    entity: Mapped[Entity] = mapped_column(enum_type(Entity), index=True)
    request_type: Mapped[str] = mapped_column(String(60))
    idempotency_key: Mapped[str] = mapped_column(String(160), unique=True)
    external_ref: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    state: Mapped[str] = mapped_column(String(30), default="SUBMITTING", index=True)
    fields_sent: Mapped[list] = mapped_column(JSONType, default=list)  # field NAMES only - the minimisation record
    approval_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    released_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    last_polled_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    last_status_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class EntityStatus(UUIDPrimaryKey, TimestampMixin, Base):
    """Every status the authority returned (poll, webhook, or demo simulation), append-only."""

    __tablename__ = "entity_statuses"

    request_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("entity_requests.id", ondelete="CASCADE"), index=True)
    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    entity: Mapped[Entity] = mapped_column(enum_type(Entity))
    status: Mapped[str] = mapped_column(String(30))
    detail: Mapped[str] = mapped_column(Text, default="")
    channel: Mapped[str] = mapped_column(String(20), default="POLL")  # SUBMIT | POLL | WEBHOOK | DEMO
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)
    received_at: Mapped[datetime] = mapped_column(UTCDateTime)
