import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKey


class Workflow(UUIDPrimaryKey, TimestampMixin, Base):
    """Versioned workflow definition for a life event."""

    __tablename__ = "workflows"

    life_event_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("life_events.id"), index=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
