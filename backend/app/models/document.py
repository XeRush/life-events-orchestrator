import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import DocumentCategory, DocumentStatus, Source


class Document(UUIDPrimaryKey, TimestampMixin, Base):
    """A document the case needs or holds. VERIFIED means checked by a LifeLoop officer, never 'government-verified'."""

    __tablename__ = "documents"
    __table_args__ = (UniqueConstraint("case_id", "doc_type"),)

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    node_key: Mapped[str | None] = mapped_column(String(40), nullable=True)
    category: Mapped[DocumentCategory] = mapped_column(enum_type(DocumentCategory), index=True)
    doc_type: Mapped[str] = mapped_column(String(60))
    title: Mapped[str] = mapped_column(String(160))
    status: Mapped[DocumentStatus] = mapped_column(enum_type(DocumentStatus), default=DocumentStatus.REQUIRED, index=True)
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    declared_available: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[Source] = mapped_column(enum_type(Source), default=Source.RESIDENT)
    issued_by: Mapped[str | None] = mapped_column(String(60), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    uploaded_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    verified_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    expires_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
