import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import DocumentStatus, VerificationStatus


class Document(UUIDPrimaryKey, TimestampMixin, Base):
    """Document metadata. Bytes live behind the storage abstraction (local disk in dev)."""

    __tablename__ = "documents"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("life_event_cases.id"), index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("service_tasks.id"), nullable=True, index=True)
    doc_type: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[DocumentStatus] = mapped_column(enum_type(DocumentStatus), default=DocumentStatus.REQUESTED, index=True)
    verification_status: Mapped[VerificationStatus] = mapped_column(
        enum_type(VerificationStatus), default=VerificationStatus.PENDING
    )
    storage_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(String(40), default="system")
    requested_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    uploaded_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
