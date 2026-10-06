"""The integration contract each authority would implement. Published unchanged for the pilot (canvas box N).

Requests carry only the fields that authority's own form requires (`allowed_fields`); the adapter rejects
anything else, so the Life-Event Passport is never sent wholesale.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

AuthorityStatus = Literal["SUBMITTED", "PROCESSING", "CLEARED", "COMPLETED", "BLOCKED", "DOCUMENT_MISSING", "STALLED",
                          "REJECTED", "WAITING_FOR_PARENT", "CANCELLED"]


class SubmitRequest(BaseModel):
    request_type: str
    idempotency_key: str = Field(min_length=8, max_length=160)
    case_reference: str
    fields: dict[str, Any]
    declared_documents: list[str] = Field(default_factory=list)


class SubmitResponse(BaseModel):
    external_ref: str
    status: AuthorityStatus
    detail: str
    received_at: datetime
    duplicate: bool = False


class StatusResponse(BaseModel):
    external_ref: str
    status: AuthorityStatus
    detail: str
    missing_documents: list[str] = Field(default_factory=list)
    updated_at: datetime
    resident_present: bool = False


class Requirements(BaseModel):
    entity: str
    service: str
    required_fields: list[str]
    required_documents: list[str]
    published_fee: str | None = None
    fee_source: str | None = None
    sla: str
    has_api: bool = True
    has_status_feed: bool = True
    notes: str = ""
