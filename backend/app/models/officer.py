import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import ApprovalState, EscalationReason, EscalationStatus, OfficerDecision


class Approval(UUIDPrimaryKey, TimestampMixin, Base):
    """The human gate: the agent prepares a submission; only an officer can release it to the authority."""

    __tablename__ = "approvals"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    node_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("life_event_nodes.id", ondelete="CASCADE"), index=True)
    state: Mapped[ApprovalState] = mapped_column(enum_type(ApprovalState), default=ApprovalState.PENDING, index=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    fields: Mapped[list] = mapped_column(JSONType, default=list)  # [{name, label, value(masked)}] for officer review
    requested_at: Mapped[datetime] = mapped_column(UTCDateTime)
    requested_by: Mapped[str] = mapped_column(String(60), default="LifeLoop agent")
    decided_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    decided_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)


class OfficerReview(UUIDPrimaryKey, TimestampMixin, Base):
    """Append-only record of every officer decision on a case."""

    __tablename__ = "officer_reviews"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    node_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    approval_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    officer_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    decision: Mapped[OfficerDecision] = mapped_column(enum_type(OfficerDecision))
    notes: Mapped[str] = mapped_column(Text, default="")
    details: Mapped[dict] = mapped_column(JSONType, default=dict)


class Escalation(UUIDPrimaryKey, TimestampMixin, Base):
    """A warm handover to a named Amer officer."""

    __tablename__ = "escalations"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    node_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    reason: Mapped[EscalationReason] = mapped_column(enum_type(EscalationReason), index=True)
    status: Mapped[EscalationStatus] = mapped_column(enum_type(EscalationStatus), default=EscalationStatus.OPEN, index=True)
    assigned_officer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
    warm_transfer: Mapped[bool] = mapped_column(Boolean, default=False)
    call_session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    summary: Mapped[str] = mapped_column(Text, default="")
    opened_by: Mapped[str] = mapped_column(String(30), default="AI_AGENT")
    opened_at: Mapped[datetime] = mapped_column(UTCDateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    resolution: Mapped[str | None] = mapped_column(Text, nullable=True)
