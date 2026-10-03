import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import ActorType, Source


class AuditLog(UUIDPrimaryKey, TimestampMixin, Base):
    """Who did what, when, from where, on which case, under which trace, with what result. Append-only."""

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_logs_case_occurred", "case_id", "occurred_at"),)

    occurred_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    actor_type: Mapped[ActorType] = mapped_column(enum_type(ActorType))
    actor_label: Mapped[str] = mapped_column(String(160))
    action: Mapped[str] = mapped_column(String(80), index=True)
    case_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="SET NULL"), nullable=True)
    node_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    source: Mapped[Source] = mapped_column(enum_type(Source), default=Source.SYSTEM)
    result: Mapped[str] = mapped_column(String(20), default="SUCCESS")
    trace_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ip_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict] = mapped_column(JSONType, default=dict)
