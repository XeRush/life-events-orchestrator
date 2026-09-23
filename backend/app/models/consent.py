import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.clock import utcnow
from app.db.base import Base, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import ConsentStatus, ConsentType


class Consent(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "consents"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    case_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("life_event_cases.id"), index=True)
    consent_type: Mapped[ConsentType] = mapped_column(enum_type(ConsentType), index=True)
    status: Mapped[ConsentStatus] = mapped_column(enum_type(ConsentStatus), index=True)
    version: Mapped[str] = mapped_column(String(16), default="1.0")
    scope: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(40), default="voice")
    captured_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
