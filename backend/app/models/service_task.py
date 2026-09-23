import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import TaskStatus


class ServiceTask(UUIDPrimaryKey, TimestampMixin, Base):
    """A workflow node instantiated for one case."""

    __tablename__ = "service_tasks"
    __table_args__ = (UniqueConstraint("case_id", "key"),)

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("life_event_cases.id"), index=True)
    node_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("workflow_nodes.id"), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("government_entities.id"), nullable=True, index=True)
    key: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    service_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[TaskStatus] = mapped_column(enum_type(TaskStatus), default=TaskStatus.PENDING, index=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    config: Mapped[dict] = mapped_column(JSONType, default=dict)
    external_ref: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    replanned: Mapped[bool] = mapped_column(Boolean, default=False)
    required_documents: Mapped[list] = mapped_column(JSONType, default=list)
    resident_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class TaskDependency(UUIDPrimaryKey, TimestampMixin, Base):
    """`task_id` depends on `depends_on_id` (per-case instance of a workflow edge)."""

    __tablename__ = "task_dependencies"
    __table_args__ = (UniqueConstraint("task_id", "depends_on_id"),)

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("life_event_cases.id"), index=True)
    task_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("service_tasks.id"), index=True)
    depends_on_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("service_tasks.id"), index=True)
