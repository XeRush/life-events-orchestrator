import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import ApprovalState, Entity, NodeState, NodeType, Source


class LifeEventNode(UUIDPrimaryKey, TimestampMixin, Base):
    """One service in the case's Life-Event Graph (birth certificate, MOFA, consulate, visa, Emirates ID, insurance)."""

    __tablename__ = "life_event_nodes"
    __table_args__ = (UniqueConstraint("case_id", "key"),)

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(120))
    entity: Mapped[Entity] = mapped_column(enum_type(Entity), index=True)
    entity_label: Mapped[str] = mapped_column(String(160))
    type: Mapped[NodeType] = mapped_column(enum_type(NodeType))
    state: Mapped[NodeState] = mapped_column(enum_type(NodeState), default=NodeState.PENDING, index=True)
    status: Mapped[str] = mapped_column(String(240), default="")  # human-readable status line
    status_source: Mapped[Source] = mapped_column(enum_type(Source), default=Source.SYSTEM)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    required_documents: Mapped[list] = mapped_column(JSONType, default=list)
    form_fields: Mapped[list] = mapped_column(JSONType, default=list)  # the only passport fields this entity receives
    human_approval_required: Mapped[bool] = mapped_column(Boolean, default=True)
    approval_state: Mapped[ApprovalState | None] = mapped_column(enum_type(ApprovalState), nullable=True)
    resident_present_required: Mapped[bool] = mapped_column(Boolean, default=False)
    success_state: Mapped[NodeState] = mapped_column(enum_type(NodeState, name="successstate"), default=NodeState.CLEARED)
    sla_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sla_due_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    cleared_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    stalled_since: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    blocked_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_action_owner: Mapped[str | None] = mapped_column(String(20), nullable=True)  # AGENT | PARENT | OFFICER | ENTITY
    fee_note: Mapped[str | None] = mapped_column(String(240), nullable=True)
    parent_report: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)


class LifeEventEdge(UUIDPrimaryKey, TimestampMixin, Base):
    """`to_node` cannot start until `from_node` is cleared or completed."""

    __tablename__ = "life_event_edges"
    __table_args__ = (UniqueConstraint("from_node_id", "to_node_id"),)

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    from_node_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("life_event_nodes.id", ondelete="CASCADE"), index=True)
    to_node_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("life_event_nodes.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="REQUIRES")
