from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CallbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    case_id: UUID
    case_reference: str | None = None
    status: str
    reason: str
    trigger_event_type: str
    scheduled_for: datetime
    started_at: datetime | None
    completed_at: datetime | None
    duration_seconds: float | None
    outcome: str | None
    provider: str | None
    language: str
    conversation_id: UUID | None
    attempts: int
    payload: dict[str, Any]
    created_at: datetime
