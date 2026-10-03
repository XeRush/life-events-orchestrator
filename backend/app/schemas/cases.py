"""Case, intake, document, consent and officer request schemas."""
from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.core.config import LANGUAGES
from app.workflows.birth_expat import EMIRATES

Emirate = Literal["DUBAI", "ABU_DHABI", "SHARJAH", "AJMAN", "UMM_AL_QUWAIN", "RAS_AL_KHAIMAH", "FUJAIRAH"]
NodeKey = Literal["BIRTH_CERTIFICATE", "MOFA_ATTESTATION", "CONSULATE_PASSPORT", "RESIDENCE_VISA", "EMIRATES_ID", "INSURANCE"]


class IntakeIn(BaseModel):
    """Everything captured once, on call one (or in the web intake). Emirates IDs are hashed on arrival."""

    language: str = Field(default="en", description="en | ar | hi | ur | ml | tl")
    emirate: str = Field(default="DUBAI", description="Emirate of birth: decides DHA / MOHAP / DOH and GDRFA / ICP")
    child_full_name_en: str = Field(min_length=2, max_length=160)
    child_full_name_ar: str | None = Field(default=None, max_length=160)
    child_date_of_birth: date
    child_sex: Literal["F", "M"] | None = None
    place_of_birth: str = Field(min_length=2, max_length=160, description="Hospital of birth")
    child_nationality: str = Field(min_length=2, max_length=60)
    birth_notification_ref: str | None = Field(default=None, max_length=40)
    father_full_name: str | None = Field(default=None, max_length=160)
    father_nationality: str | None = Field(default=None, max_length=60)
    father_emirates_id: str | None = Field(default=None, max_length=24)
    mother_full_name: str | None = Field(default=None, max_length=160)
    mother_nationality: str | None = Field(default=None, max_length=60)
    mother_emirates_id: str | None = Field(default=None, max_length=24)
    marriage_certificate_attested: bool | None = None
    phone: str | None = Field(default=None, max_length=32)
    consent_data_processing: bool = False
    consent_service_filing: bool = False
    consent_callback: bool = False

    @field_validator("language")
    @classmethod
    def _lang(cls, v: str) -> str:
        v = (v or "en").lower()[:2]
        if v not in LANGUAGES:
            raise ValueError(f"language must be one of {', '.join(LANGUAGES)}")
        return v

    @field_validator("emirate")
    @classmethod
    def _emirate(cls, v: str) -> str:
        v = v.upper().replace(" ", "_")
        if v not in EMIRATES:
            raise ValueError("unknown emirate")
        return v

    @field_validator("child_date_of_birth")
    @classmethod
    def _dob(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("date of birth cannot be in the future")
        if (date.today() - v).days > 365:
            raise ValueError("LifeLoop's birth journey covers children born in the last year")
        return v


class ConsulateReportIn(BaseModel):
    milestone: Literal["APPOINTMENT_BOOKED", "APPLICATION_SUBMITTED", "PASSPORT_ISSUED", "DELAYED"]
    passport_number_present: bool = False
    appointment_date: date | None = None
    notes: str | None = Field(default=None, max_length=500)


class ConsentIn(BaseModel):
    consent_type: Literal["CALLBACK", "DATA_PROCESSING", "SERVICE_FILING"]
    granted: bool = True


class VerifyIn(BaseModel):
    method: Literal["UAE_PASS", "KNOWLEDGE_FACTS"]
    date_of_birth: str | None = Field(default=None, max_length=60)
    hospital: str | None = Field(default=None, max_length=160)
    call_id: str | None = None


class OfficerDecisionIn(BaseModel):
    note: str = Field(default="", max_length=1000)


class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class RequestDocumentsIn(BaseModel):
    node_key: NodeKey
    documents: list[str] = Field(min_length=1, max_length=8)
    note: str = Field(default="", max_length=1000)


class EscalateIn(BaseModel):
    reason: Literal["OFFICER_REFERRAL", "DISPUTED_RECORD", "SLA_STALL", "CONSULATE_STALL"] = "OFFICER_REFERRAL"
    node_key: NodeKey | None = None
    note: str = Field(default="", max_length=1000)


class TransferIn(BaseModel):
    to_officer_id: str
    note: str = Field(default="", max_length=1000)


class ResolveIn(BaseModel):
    resolution: str = Field(min_length=3, max_length=1000)


class NoteIn(BaseModel):
    note: str = Field(min_length=1, max_length=2000)
    node_key: NodeKey | None = None


class DocumentStatusIn(BaseModel):
    status: Literal["REQUIRED", "MISSING", "EXPIRED", "NOT_APPLICABLE"]
    note: str | None = Field(default=None, max_length=500)
