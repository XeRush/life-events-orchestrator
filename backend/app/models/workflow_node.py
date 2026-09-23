import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UUIDPrimaryKey


class WorkflowNode(UUIDPrimaryKey, TimestampMixin, Base):
    """A node in the workflow definition; instantiated as a ServiceTask per case.

    `config` keys: required_documents, max_attempts, alternative (node key),
    started_label / completed_label (timeline wording), resident_label.
    """

    __tablename__ = "workflow_nodes"
    __table_args__ = (UniqueConstraint("workflow_id", "key"),)

    workflow_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("workflows.id"), index=True)
    key: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    entity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("government_entities.id"), nullable=True, index=True)
    service_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    config: Mapped[dict] = mapped_column(JSONType, default=dict)
