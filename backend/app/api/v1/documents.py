from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.deps import get_container, get_current_user
from app.core.errors import ValidationFailed
from app.models.user import User
from app.schemas.documents import DocumentOut, RecordDocumentIn
from app.services.container import ServiceContainer

router = APIRouter(tags=["documents"])
MAX_UPLOAD_BYTES = 5 * 1024 * 1024


@router.get("/cases/{case_id}/documents", response_model=list[DocumentOut], summary="Document metadata for a case")
async def list_documents(case_id: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)):
    case = await c.cases.resolve(case_id, user)
    return await c.documents.list_for_case(case.id)


@router.post("/cases/{case_id}/documents/record", response_model=DocumentOut, status_code=201,
             summary="Record a document by metadata only",
             description="Matches an outstanding request from an authority when there is one; when the last requested document arrives the task resumes.")
async def record_document(case_id: str, body: RecordDocumentIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)):
    case = await c.cases.resolve(case_id, user)
    doc = await c.documents.record(case, doc_type=body.doc_type.upper(), name=body.name, task_id=body.task_id, source="dashboard", actor=f"user:{user.id}")
    await c.commit()
    return doc


@router.post("/cases/{case_id}/documents", response_model=DocumentOut, status_code=201, summary="Upload a document file")
async def upload_document(
    case_id: str, doc_type: str = Form(...), file: UploadFile = File(...),
    user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container),
):
    case = await c.cases.resolve(case_id, user)
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValidationFailed("File is larger than 5 MB")
    doc = await c.documents.record(
        case, doc_type=doc_type.upper(), name=file.filename, source="dashboard", content=content, content_type=file.content_type,
        actor=f"user:{user.id}",
    )
    await c.commit()
    return doc
