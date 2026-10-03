"""Document Center: what each step needs, what is held, what is missing.

Status words are honest: UPLOADED means the resident provided a file; VERIFIED means a LifeLoop officer checked it;
an output 'issued' by a mock authority is labelled as such. Nothing here is ever described as government-verified.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.core.clock import utcnow
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.events.recorder import Actor
from app.models.case import Case
from app.models.document import Document
from app.models.enums import DocumentCategory, DocumentStatus, NodeState, Source
from app.models.graph import LifeEventNode
from app.models.user import User
from app.services.storage import validate_upload
from app.workflows.birth_expat import BY_KEY, DOCUMENTS, TEMPLATE
from app.workflows.step_text import step_text

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

OUTPUTS = {doc: tpl.key for tpl in TEMPLATE for doc in tpl.outputs}
PARENT_HELD = {"FATHER_PASSPORT", "MOTHER_PASSPORT", "FATHER_EMIRATES_ID", "MOTHER_EMIRATES_ID", "SPONSOR_RESIDENCE_VISA", "CHILD_PHOTO"}
OUTSTANDING = {DocumentStatus.MISSING, DocumentStatus.EXPIRED}


class DocumentService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def ensure_for_case(self, case: Case, *, marriage_certificate_attested: bool | None) -> list[Document]:
        created = []
        needed_by: dict[str, str] = {}
        for tpl in TEMPLATE:
            for doc in tpl.required_documents:
                needed_by.setdefault(doc, tpl.key)
        for doc_type, spec in DOCUMENTS.items():
            if await self.c.docs_repo.by_type(case.id, doc_type):
                continue
            is_output = doc_type in OUTPUTS
            status = DocumentStatus.REQUIRED
            declared = doc_type in PARENT_HELD or doc_type == "HOSPITAL_BIRTH_NOTIFICATION"
            notes = None
            if doc_type == "ATTESTED_MARRIAGE_CERTIFICATE":
                if marriage_certificate_attested is False:
                    status, declared = DocumentStatus.MISSING, False
                    notes = "Attest at home, then at the UAE embassy, then MOFA if issued abroad. The birth certificate step waits for this."
                else:
                    declared = True
            if doc_type == "HOSPITAL_BIRTH_NOTIFICATION":
                notes = "Filed by the hospital's medical-records office."
            row = Document(case_id=case.id, node_key=OUTPUTS.get(doc_type) or needed_by.get(doc_type), category=spec.category,
                           doc_type=doc_type, title=spec.title, status=status, required=not is_output, declared_available=declared,
                           source=Source.GOVERNMENT_MOCK if is_output else Source.RESIDENT, notes=notes,
                           issued_by=None)
            self.c.session.add(row)
            created.append(row)
        await self.c.session.flush()
        return created

    async def missing_for_node(self, case: Case, node: LifeEventNode) -> list[Document]:
        docs = {d.doc_type: d for d in await self.c.docs_repo.for_case(case.id)}
        return [docs[d] for d in node.required_documents if d in docs and docs[d].status in OUTSTANDING]

    async def mark_missing(self, case: Case, doc_types: list[str], note: str) -> list[str]:
        titles = []
        for doc_type in doc_types:
            doc = await self.c.docs_repo.by_type(case.id, doc_type)
            spec = DOCUMENTS.get(doc_type)
            if doc is None and spec is not None:
                doc = Document(case_id=case.id, category=spec.category, doc_type=doc_type, title=spec.title, required=True)
                self.c.session.add(doc)
            if doc is None:
                continue
            doc.status, doc.required, doc.declared_available, doc.notes = DocumentStatus.MISSING, True, False, note
            titles.append(doc.title)
        await self.c.session.flush()
        return titles

    async def upload(self, case: Case, user: User, doc_type: str, data: bytes, file_name: str, declared_mime: str | None) -> Document:
        doc = await self.c.docs_repo.by_type(case.id, doc_type)
        if doc is None:
            raise NotFound("This case does not need that document.")
        if doc.doc_type in OUTPUTS and doc.status == DocumentStatus.UPLOADED and doc.source == Source.GOVERNMENT_MOCK:
            raise Conflict("This document is issued by the authority.")
        mime = validate_upload(data, declared_mime, file_name, self.c.settings.max_upload_mb)
        stored = await self.c.infra.storage.save(case.id, file_name, data, mime)
        doc.status, doc.storage_key, doc.file_name, doc.mime_type = DocumentStatus.UPLOADED, stored.key, stored.file_name, mime
        doc.size_bytes, doc.sha256, doc.uploaded_by_id, doc.uploaded_at = stored.size, stored.sha256, user.id, utcnow()
        doc.source, doc.declared_available, doc.verified_at, doc.verified_by_id = Source.RESIDENT, True, None, None
        await self.c.events.emit("DocumentUploaded", case_id=case.id, node_key=doc.node_key, actor=Actor.user(user), source=Source.RESIDENT,
                                 title=f"{doc.title} uploaded", description="Uploaded by the resident; not yet checked by an officer.",
                                 payload={"doc_type": doc_type, "size_bytes": stored.size, "mime_type": mime},
                                 i18n={"key": "timeline.documentUploaded", "params": {"doc": doc_type}})
        await self.resume_after_documents(case)
        return doc

    async def resume_after_documents(self, case: Case) -> None:
        """A node waiting on documents goes back to the officer gate once nothing it needs is missing."""
        for node in await self.c.nodes_repo.for_case(case.id):
            if node.state == NodeState.DOCUMENT_MISSING and not await self.missing_for_node(case, node):
                if node.type.value == "PARENT_REPORTED":
                    await self.c.graph.transition(node, NodeState.WAITING_FOR_PARENT, source=Source.SYSTEM)
                else:
                    await self.c.approvals.request(case, node, note=f"Resubmit {node.title.lower()} with the requested documents.")

    async def verify(self, case: Case, officer: User, doc_type: str) -> Document:
        await self.c.access.officiate(officer, case, "VerifyDocument")
        doc = await self.c.docs_repo.by_type(case.id, doc_type)
        if doc is None:
            raise NotFound("Document not found")
        if doc.status != DocumentStatus.UPLOADED:
            raise ValidationFailed("Only an uploaded document can be checked.")
        doc.status, doc.verified_by_id, doc.verified_at = DocumentStatus.VERIFIED, officer.id, utcnow()
        await self.c.events.emit("DocumentVerified", case_id=case.id, node_key=doc.node_key, actor=Actor.user(officer), source=Source.HUMAN_OFFICER,
                                 title=f"{doc.title} checked by {officer.full_name}",
                                 description="Checked by a LifeLoop officer. The issuing authority makes its own determination.",
                                 payload={"doc_type": doc_type}, i18n={"key": "timeline.documentVerified", "params": {"doc": doc_type}})
        return doc

    async def set_status(self, case: Case, officer: User, doc_type: str, status: DocumentStatus, note: str | None) -> Document:
        await self.c.access.officiate(officer, case, "SetDocumentStatus")
        doc = await self.c.docs_repo.by_type(case.id, doc_type)
        if doc is None:
            raise NotFound("Document not found")
        doc.status, doc.notes = status, note or doc.notes
        if status == DocumentStatus.NOT_APPLICABLE:
            doc.required = False
        await self.c.events.audit("DocumentStatusChanged", actor=Actor.user(officer), case_id=case.id, details={"doc_type": doc_type, "status": status.value})
        if status in (DocumentStatus.NOT_APPLICABLE, DocumentStatus.UPLOADED, DocumentStatus.VERIFIED):
            await self.resume_after_documents(case)
        return doc

    async def register_outputs(self, case: Case, node: LifeEventNode) -> None:
        for doc_type in BY_KEY[node.key].outputs:
            doc = await self.c.docs_repo.by_type(case.id, doc_type)
            if doc is None:
                continue
            doc.status, doc.source, doc.uploaded_at = DocumentStatus.UPLOADED, Source.GOVERNMENT_MOCK, utcnow()
            doc.issued_by = f"{node.entity_label} (mock)"
            doc.notes = "Issued by the authority's mock adapter in this prototype."

    async def view(self, case: Case, lang: str | None = None) -> dict[str, Any]:
        docs = await self.c.docs_repo.for_case(case.id)
        groups: dict[str, list[dict[str, Any]]] = {c.value: [] for c in DocumentCategory}
        for d in docs:
            groups[d.category.value].append({
                "id": str(d.id), "doc_type": d.doc_type, "title": d.title, "status": d.status.value, "required": d.required,
                "declared_available": d.declared_available, "source": d.source.value, "issued_by": d.issued_by, "node_key": d.node_key,
                "file_name": d.file_name, "mime_type": d.mime_type, "size_bytes": d.size_bytes,
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
                "verified_at": d.verified_at.isoformat() if d.verified_at else None, "notes": d.notes,
                "expires_on": d.expires_on.isoformat() if d.expires_on else None,
                "is_output": d.doc_type in OUTPUTS,
            })
        counts: dict[str, int] = {}
        for d in docs:
            counts[d.status.value] = counts.get(d.status.value, 0) + 1
        return {"groups": groups, "counts": counts,
                "disclaimer": step_text("docs_disclaimer", lang)}
