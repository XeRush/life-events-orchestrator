from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    case_id: UUID
    task_id: UUID | None
    doc_type: str
    name: str
    status: str
    verification_status: str
    content_type: str | None
    size_bytes: int | None
    source: str
    requested_at: datetime | None
    uploaded_at: datetime | None


class RecordDocumentIn(BaseModel):
    doc_type: str = Field(examples=["PROOF_OF_ADDRESS"])
    name: str | None = None
    task_id: UUID | None = None
