from sqlalchemy import Boolean, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKey


class LifeEvent(UUIDPrimaryKey, TimestampMixin, Base):
    """A life-event template (BIRTH, MARRIAGE, MOVE, BUSINESS_START)."""

    __tablename__ = "life_events"

    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    case_title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(40), default="sparkles")
    # Only configured templates may be activated; others are definitions for the roadmap.
    is_configured: Mapped[bool] = mapped_column(Boolean, default=False)
