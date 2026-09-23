from typing import Any

from pydantic import BaseModel, Field


class SimulationIn(BaseModel):
    """Identify the authority-side application either by reference or by (case, service)."""

    application_id: str | None = Field(default=None, description="Authority application reference, e.g. CIA-2026-000001")
    case_id: str | None = Field(default=None, description="Case UUID or reference such as L-49281")
    service_code: str | None = Field(default=None, examples=["IDENTITY_APPLICATION"])
    hours: int = 24
    reason: str | None = None
    retryable: bool = False
    documents: list[dict[str, Any]] | None = None


class SubmitApplicationIn(BaseModel):
    case_reference: str
    service_code: str
    idempotency_key: str = Field(min_length=6, max_length=128)
    applicant: dict[str, Any] = Field(default_factory=dict)
