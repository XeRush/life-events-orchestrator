"""Document metadata, requests raised by authorities, and receipt from the resident."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.core.clock import utcnow
from app.core.errors import ValidationFailed
from app.models.document import Document
from app.models.enums import ActorType, DocumentStatus, DomainEventType, TaskStatus, VerificationStatus
from app.models.life_event_case import LifeEventCase
from app.models.service_task import ServiceTask

if TYPE_CHECKING:
    from app.services.container import ServiceContainer


class DocumentService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def list_for_case(self, case_id: uuid.UUID) -> list[Document]:
        return list((await self.c.session.scalars(
            select(Document).where(Document.case_id == case_id).order_by(Document.created_at)
        )).all())

    async def outstanding(self, task_id: uuid.UUID) -> list[Document]:
        return list((await self.c.session.scalars(
            select(Document).where(Document.task_id == task_id, Document.status == DocumentStatus.REQUESTED)
        )).all())

    async def request_for_task(self, case: LifeEventCase, task: ServiceTask, docs: list[dict]) -> list[Document]:
        created = []
        for d in docs:
            exists = await self.c.session.scalar(select(Document).where(
                Document.task_id == task.id, Document.doc_type == d.get("type"), Document.status == DocumentStatus.REQUESTED))
            if exists:
                continue
            doc = Document(
                case_id=case.id, task_id=task.id, doc_type=d.get("type", "OTHER"), name=d.get("name", d.get("type", "Document")),
                status=DocumentStatus.REQUESTED, verification_status=VerificationStatus.NOT_APPLICABLE,
                source="entity", requested_at=utcnow(),
            )
            self.c.session.add(doc)
            created.append(doc)
        await self.c.session.flush()
        return created

    async def record(
        self, case: LifeEventCase, *, doc_type: str, name: str | None = None, task_id: uuid.UUID | None = None,
        source: str = "resident", content: bytes | None = None, content_type: str | None = None,
        actor: str = "resident", actor_type: ActorType = ActorType.RESIDENT,
    ) -> Document:
        """Record a document from the resident. Matches an outstanding request when there is one."""
        if not doc_type:
            raise ValidationFailed("doc_type is required")
        s = self.c.session
        query = select(Document).where(
            Document.case_id == case.id, Document.doc_type == doc_type, Document.status == DocumentStatus.REQUESTED)
        if task_id:
            query = query.where(Document.task_id == task_id)
        doc = await s.scalar(query.order_by(Document.created_at))
        if doc is None:
            doc = Document(case_id=case.id, task_id=task_id, doc_type=doc_type, name=name or doc_type.replace("_", " ").title())
            s.add(doc)
        doc.status = DocumentStatus.RECEIVED
        doc.verification_status = VerificationStatus.PENDING
        doc.uploaded_at = utcnow()
        doc.source = source
        doc.content_type = content_type
        if name:
            doc.name = name
        await s.flush()
        if content is not None:
            doc.storage_key = self.c.storage.save(f"{case.reference}/{doc.id}", content)
            doc.size_bytes = len(content)
        await self.c.publisher.bus.publish(
            DomainEventType.DOCUMENT_RECEIVED, case_id=case.id, task_id=doc.task_id, actor=actor, actor_type=actor_type,
            metadata={"case_reference": case.reference, "document_id": str(doc.id), "document_name": doc.name, "document_type": doc.doc_type},
        )
        return doc

    async def verify_for_task(self, task: ServiceTask) -> None:
        for doc in (await self.c.session.scalars(select(Document).where(
                Document.task_id == task.id, Document.status == DocumentStatus.RECEIVED))).all():
            doc.status = DocumentStatus.ACCEPTED
            doc.verification_status = VerificationStatus.VERIFIED

    async def task_waiting_for(self, case_id: uuid.UUID, doc_type: str) -> ServiceTask | None:
        return await self.c.session.scalar(
            select(ServiceTask).join(Document, Document.task_id == ServiceTask.id).where(
                ServiceTask.case_id == case_id, ServiceTask.status == TaskStatus.WAITING_FOR_RESIDENT,
                Document.doc_type == doc_type, Document.status == DocumentStatus.REQUESTED)
        )
