from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
    id: UUID
    event_type: str
    case_id: UUID | None
    task_id: UUID | None
    actor: str
    actor_type: str
    old_state: str | None
    new_state: str | None
    metadata: dict[str, Any] = Field(validation_alias="event_metadata")
    source: str
    processed: bool
    error: str | None
    created_at: datetime


class EventPage(BaseModel):
    items: list[EventOut]
    total: int
    limit: int
    offset: int


class EntityEventIn(BaseModel):
    """Webhook body an authority sends when its own state changes."""

    entity_code: str = Field(examples=["IDENTITY"])
    reference: str = Field(description="The authority's application reference.")
    kind: str = Field(description="ACKNOWLEDGED | COMPLETED | DELAYED | REJECTED | DOCUMENT_REQUIRED", examples=["COMPLETED"])
    idempotency_key: str = Field(min_length=6, max_length=160)
    payload: dict[str, Any] = Field(default_factory=dict)


class IngestOut(BaseModel):
    applied: bool
    duplicate: bool
    task_id: UUID | None
    event_type: str | None
    message: str
