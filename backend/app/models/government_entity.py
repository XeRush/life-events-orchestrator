import uuid
from datetime import datetime

from sqlalchemy import Boolean, Float, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey


class GovernmentEntity(UUIDPrimaryKey, TimestampMixin, Base):
    """A (mock) government authority that owns approvals for one or more services."""

    __tablename__ = "government_entities"

    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    avg_processing_hours: Mapped[float] = mapped_column(Float, default=24.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class MockApplication(UUIDPrimaryKey, TimestampMixin, Base):
    """An application held by a mock authority's own system of record."""

    __tablename__ = "mock_applications"

    entity_code: Mapped[str] = mapped_column(String(64), index=True)
    service_code: Mapped[str] = mapped_column(String(64))
    reference: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    case_reference: Mapped[str] = mapped_column(String(32), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True)
    status: Mapped[str] = mapped_column(String(40), default="RECEIVED", index=True)
    applicant: Mapped[dict] = mapped_column(JSONType, default=dict)
    required_documents: Mapped[list] = mapped_column(JSONType, default=list)
    history: Mapped[list] = mapped_column(JSONType, default=list)
    submitted_at: Mapped[datetime] = mapped_column(UTCDateTime)
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("service_tasks.id"), nullable=True)
