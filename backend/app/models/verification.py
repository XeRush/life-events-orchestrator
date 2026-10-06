import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UUIDPrimaryKey, enum_type
from app.models.enums import VerificationMethod


class VerificationAttempt(UUIDPrimaryKey, TimestampMixin, Base):
    """UAE Pass one-tap or two non-secret facts already in the case file. Never secrets, never ID numbers."""

    __tablename__ = "verification_attempts"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    call_session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    method: Mapped[VerificationMethod] = mapped_column(enum_type(VerificationMethod))
    success: Mapped[bool] = mapped_column(Boolean)
    attempt_no: Mapped[int] = mapped_column(Integer, default=1)
    facts_checked: Mapped[list] = mapped_column(JSONType, default=list)  # fact names, never answers
    failure_reason: Mapped[str | None] = mapped_column(String(160), nullable=True)
