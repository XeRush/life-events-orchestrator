import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import ConsentStatus, ConsentType


class Consent(UUIDPrimaryKey, TimestampMixin, Base):
    """First-class consent record. A GRANTED CALLBACK consent carries the token the callback engine requires to dial."""

    __tablename__ = "consents"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    consent_type: Mapped[ConsentType] = mapped_column(enum_type(ConsentType), index=True)
    status: Mapped[ConsentStatus] = mapped_column(enum_type(ConsentStatus), default=ConsentStatus.GRANTED, index=True)
    token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    version: Mapped[str] = mapped_column(String(20), default="2026-10")
    scope: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(30), default="VOICE_TOOL")
    language: Mapped[str] = mapped_column(String(8), default="en")
    call_session_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    evidence: Mapped[dict] = mapped_column(JSONType, default=dict)  # transcript turn / audio reference, never the audio
    captured_at: Mapped[datetime] = mapped_column(UTCDateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class OptOut(UUIDPrimaryKey, TimestampMixin, Base):
    """'Stop calling' - voice callbacks end immediately and the case switches to SMS-only."""

    __tablename__ = "opt_outs"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    channel: Mapped[str] = mapped_column(String(10), default="VOICE")
    reason: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(30), default="VOICE")
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
