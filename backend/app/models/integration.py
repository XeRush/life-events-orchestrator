import uuid
from datetime import datetime

from sqlalchemy import Boolean, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, JSONType, TimestampMixin, UTCDateTime, UUIDPrimaryKey, enum_type
from app.models.enums import IntegrationDirection, IntegrationStatus


class IntegrationEvent(UUIDPrimaryKey, TimestampMixin, Base):
    """Inbound webhooks / outbound provider calls. The idempotency key makes webhook retries harmless."""

    __tablename__ = "integration_events"

    provider: Mapped[str] = mapped_column(String(30), index=True)
    direction: Mapped[IntegrationDirection] = mapped_column(enum_type(IntegrationDirection))
    event_type: Mapped[str] = mapped_column(String(60))
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(200), unique=True)
    signature_valid: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    status: Mapped[IntegrationStatus] = mapped_column(enum_type(IntegrationStatus), default=IntegrationStatus.RECEIVED, index=True)
    case_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, index=True)
    payload: Mapped[dict] = mapped_column(JSONType, default=dict)  # redacted
    received_at: Mapped[datetime] = mapped_column(UTCDateTime)
    processed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
