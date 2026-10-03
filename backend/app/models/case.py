import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import CaseStatus, ChannelMode, ParentRole, RiskLevel


class Case(UUIDPrimaryKey, TimestampMixin, Base):
    """One persistent life-event case: the resident's Life-Event Passport for a birth."""

    __tablename__ = "cases"

    reference: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    resident_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("organizations.id"), nullable=True, index=True)
    assigned_officer_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
    life_event_type: Mapped[str] = mapped_column(String(32), default="BIRTH")
    status: Mapped[CaseStatus] = mapped_column(enum_type(CaseStatus), default=CaseStatus.INTAKE, index=True)
    language: Mapped[str] = mapped_column(String(8), default="en")
    channel_mode: Mapped[ChannelMode] = mapped_column(enum_type(ChannelMode), default=ChannelMode.VOICE)
    emirate: Mapped[str] = mapped_column(String(20), default="DUBAI")
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    deadline_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    risk: Mapped[RiskLevel] = mapped_column(enum_type(RiskLevel), default=RiskLevel.LOW, index=True)
    intake_channel: Mapped[str] = mapped_column(String(16), default="VOICE")
    passport: Mapped[dict] = mapped_column(JSONType, default=dict)  # write log: field -> {captured_at, source}
    re_entry_count: Mapped[int] = mapped_column(Integer, default=0)
    opted_out_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    last_activity_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)


class Parent(UUIDPrimaryKey, TimestampMixin, Base):
    """A parent on the case. The Emirates ID is held as a keyed hash plus the last four digits only."""

    __tablename__ = "parents"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    role: Mapped[ParentRole] = mapped_column(enum_type(ParentRole))
    full_name: Mapped[str] = mapped_column(String(160))
    nationality: Mapped[str] = mapped_column(String(60))
    emirates_id_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    emirates_id_last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    passport_present: Mapped[bool] = mapped_column(Boolean, default=True)


class Child(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "children"

    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("cases.id", ondelete="CASCADE"), unique=True)
    full_name_en: Mapped[str] = mapped_column(String(160))
    full_name_ar: Mapped[str | None] = mapped_column(String(160), nullable=True)
    date_of_birth: Mapped[date] = mapped_column(Date)
    sex: Mapped[str | None] = mapped_column(String(10), nullable=True)
    place_of_birth: Mapped[str] = mapped_column(String(160))
    nationality: Mapped[str] = mapped_column(String(60))
    birth_notification_ref: Mapped[str | None] = mapped_column(String(40), nullable=True)
