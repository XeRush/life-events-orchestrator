import uuid
from datetime import datetime

from sqlalchemy import Boolean, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import UserRole


class User(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(enum_type(UserRole), default=UserRole.RESIDENT, index=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    preferred_language: Mapped[str] = mapped_column(String(8), default="en")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class RevokedToken(UUIDPrimaryKey, TimestampMixin, Base):
    """Logout / refresh-rotation denylist."""

    __tablename__ = "revoked_tokens"

    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
