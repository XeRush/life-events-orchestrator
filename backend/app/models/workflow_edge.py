import uuid

from sqlalchemy import CheckConstraint, ForeignKey, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKey


class WorkflowEdge(UUIDPrimaryKey, TimestampMixin, Base):
    """Directed dependency: `to_node` cannot start until `from_node` completes."""

    __tablename__ = "workflow_edges"
    __table_args__ = (
        UniqueConstraint("from_node_id", "to_node_id"),
        CheckConstraint("from_node_id <> to_node_id", name="no_self_edge"),
    )

    workflow_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workflows.id"), index=True)
    from_node_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workflow_nodes.id"))
    to_node_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workflow_nodes.id"))
