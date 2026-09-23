from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ConsentType


class CreateCaseIn(BaseModel):
    event_type: str = Field(default="BIRTH", examples=["BIRTH"])
    event_date: date | None = None
    participants: list[dict[str, Any]] = Field(default_factory=list)
    preferences: dict[str, Any] = Field(default_factory=dict)
    consent_service_initiation: bool = False
    consent_callback: bool = False
    consent_data_processing: bool = False
    source: str = "dashboard"
    idempotency_key: str | None = Field(default=None, max_length=128)


class ConsentIn(BaseModel):
    consent_type: ConsentType
    granted: bool = True
    scope: str | None = None
    source: str = "dashboard"


class ConsentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    consent_type: ConsentType
    status: str
    version: str
    scope: str
    source: str
    captured_at: datetime


class CaseOut(BaseModel):
    id: UUID
    reference: str
    title: str
    event_type: str
    status: str
    event_date: date | None
    created_at: datetime
    updated_at: datetime
    participants: list[dict[str, Any]]
    preferences: dict[str, Any]
    progress: dict[str, int]
    current_stage: str | None
    resident_action_required: bool
    waiting_on: str
    summary: str


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    case_id: UUID
    key: str
    name: str
    description: str
    status: str
    service_code: str | None
    is_system: bool
    external_ref: str | None
    attempts: int
    replanned: bool
    required_documents: list[dict[str, Any]]
    resident_action: str | None
    status_reason: str | None
    submitted_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TimelineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    case_id: UUID
    event_type: str
    category: str
    title: str
    description: str
    actor_type: str
    occurred_at: datetime
    task_id: UUID | None


class TimelinePage(BaseModel):
    items: list[TimelineOut]
    total: int
    limit: int
    offset: int


class CallbackRequestIn(BaseModel):
    reason: str = Field(default="Resident requested a call", max_length=500)
    when: str | None = Field(default=None, examples=["tomorrow", "in 2 hours"])
