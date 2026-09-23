"""Workflow engine: instantiates tasks, submits executable ones, applies entity events, unlocks dependents.

The engine coordinates - it never decides. Approvals, rejections and document requirements only enter the
system as events from a government entity (or the entity's simulator).
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from sqlalchemy import select

from app.core.clock import utcnow
from app.core.errors import NotFound, ValidationFailed
from app.core.logging import get_logger
from app.integrations.government.base import AdapterError, EntityWebhook, SubmissionRequest
from app.models.enums import ActorType, CaseStatus
from app.models.enums import DomainEventType as E
from app.models.enums import TaskStatus as S
from app.models.event import Event
from app.models.government_entity import GovernmentEntity
from app.models.life_event_case import LifeEventCase
from app.models.service_task import ServiceTask, TaskDependency
from app.services.state_machine import validate_transition

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

log = get_logger("lifeloop.orchestration")
MAX_SUBMISSION_DEFERRALS = 5


@dataclass
class IngestResult:
    applied: bool
    duplicate: bool
    task_id: uuid.UUID | None = None
    event_type: str | None = None
    message: str = ""


class OrchestrationService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    # ---- lookups -------------------------------------------------------------------------------
    async def get_case(self, case_id: uuid.UUID) -> LifeEventCase:
        case = await self.c.session.get(LifeEventCase, case_id)
        if not case:
            raise NotFound("Case not found")
        return case

    async def get_task(self, task_id: uuid.UUID) -> ServiceTask:
        task = await self.c.session.get(ServiceTask, task_id)
        if not task:
            raise NotFound("Task not found")
        return task

    async def entity_of(self, task: ServiceTask) -> GovernmentEntity | None:
        return await self.c.session.get(GovernmentEntity, task.entity_id) if task.entity_id else None

    # ---- activation ----------------------------------------------------------------------------
    async def activate_case(self, case: LifeEventCase, *, actor: str = "system", actor_type: ActorType = ActorType.SYSTEM) -> None:
        """Instantiate the workflow as tasks + dependencies, then start whatever is executable."""
        if case.status != CaseStatus.PENDING_CONSENT:
            return
        case.status = CaseStatus.IN_PROGRESS
        nodes, edges = await self.c.workflows.definition(case.workflow_id)
        node_task: dict[uuid.UUID, ServiceTask] = {}
        for node in nodes:
            task = ServiceTask(
                case_id=case.id, node_id=node.id, entity_id=node.entity_id, key=node.key, name=node.name,
                description=node.description, service_code=node.service_code, status=S.PENDING,
                is_system=node.is_system, sort_order=node.sort_order, config=dict(node.config or {}),
                idempotency_key=f"{case.reference}:{node.key}:1",
            )
            self.c.session.add(task)
            node_task[node.id] = task
        await self.c.session.flush()
        for edge in edges:
            self.c.session.add(TaskDependency(
                case_id=case.id, task_id=node_task[edge.to_node_id].id, depends_on_id=node_task[edge.from_node_id].id,
            ))
        await self.c.session.flush()
        for task in node_task.values():
            await self.c.publisher.task_event(
                E.TASK_CREATED, case, task, actor=actor, actor_type=actor_type, new_state=S.PENDING.value
            )
        await self.c.dependencies.resolve(case)
        await self.submit_ready_tasks(case)

    # ---- state changes -------------------------------------------------------------------------
    async def transition(
        self, task: ServiceTask, new: S, event_type: E, *, actor: str = "system", actor_type: ActorType = ActorType.SYSTEM,
        source: str = "lifeloop", metadata: dict[str, Any] | None = None, idempotency_key: str | None = None,
        reason: str | None = None,
    ) -> Event | None:
        """The single place a task changes state: validates, stamps, and publishes the domain event."""
        old = task.status
        validate_transition(old, new)
        now = utcnow()
        task.status = new
        task.status_reason = reason
        if new == S.SUBMITTED and task.submitted_at is None:
            task.submitted_at = now
        if new == S.PROCESSING and task.started_at is None:
            task.started_at = now
        if new == S.COMPLETED:
            task.completed_at = now
        if new != S.WAITING_FOR_RESIDENT:
            task.resident_action = None
        case = await self.get_case(task.case_id)
        entity = await self.entity_of(task)
        meta = {"entity_name": entity.name if entity else None, "entity_code": entity.code if entity else None, **(metadata or {})}
        if reason:
            meta.setdefault("reason", reason)
        await self.c.session.flush()
        return await self.c.publisher.task_event(
            event_type, case, task, actor=actor, actor_type=actor_type, old_state=old.value, new_state=new.value,
            metadata=meta, idempotency_key=idempotency_key, source=source,
        )

    async def submit_ready_tasks(self, case: LifeEventCase) -> int:
        """Submit every READY task. System nodes complete instantly; entity nodes go to their authority."""
        if case.status != CaseStatus.IN_PROGRESS:
            return 0
        tasks = (await self.c.session.scalars(
            select(ServiceTask).where(ServiceTask.case_id == case.id, ServiceTask.status == S.READY)
            .order_by(ServiceTask.sort_order)
        )).all()
        submitted = 0
        for task in tasks:
            if task.is_system:
                await self.transition(task, S.COMPLETED, E.TASK_COMPLETED)
                submitted += 1
            elif await self._submit(case, task):
                submitted += 1
        return submitted

    async def _submit(self, case: LifeEventCase, task: ServiceTask) -> bool:
        entity = await self.entity_of(task)
        if entity is None or not task.service_code:
            await self.transition(task, S.FAILED, E.TASK_FAILED, reason="Task has no responsible entity configured")
            return False
        adapter = self.c.adapters.get(entity.code)
        request = SubmissionRequest(
            idempotency_key=task.idempotency_key, case_reference=case.reference, service_code=task.service_code,
            applicant={
                "resident_ref": str(case.user_id), "event_type": case.event_type,
                "event_date": case.event_date.isoformat() if case.event_date else None,
                "participants": [p.get("role") for p in case.participants or []],
            },
        )
        try:
            result = await self._submit_with_resilience(adapter, request)
        except AdapterError as exc:
            return await self._handle_submission_error(case, task, entity, exc)
        task.external_ref = result.reference
        task.attempts += 1
        await self.transition(
            task, S.SUBMITTED, E.TASK_STARTED, actor=f"ai:{self.c.settings.app_name.lower()}", actor_type=ActorType.AI_AGENT,
            metadata={"reference": result.reference, "duplicate_submission": result.duplicate},
        )
        return True

    async def _submit_with_resilience(self, adapter, request: SubmissionRequest):
        """Retry transient failures (timeout, rate limit, unavailable) with backoff; permanent ones propagate."""
        attempts = self.c.settings.adapter_max_attempts
        for i in range(attempts):
            try:
                return await adapter.submit(self.c.session, request)
            except AdapterError as exc:
                if not exc.transient or i == attempts - 1:
                    raise
                log.warning("adapter_transient_error", entity=adapter.entity_code, error=type(exc).__name__, attempt=i + 1)
                await asyncio.sleep(self.c.settings.adapter_backoff_seconds * (2**i))
        raise RuntimeError("unreachable")

    async def _handle_submission_error(self, case: LifeEventCase, task: ServiceTask, entity: GovernmentEntity, exc: AdapterError) -> bool:
        deferrals = int((task.config or {}).get("deferrals", 0)) + 1
        message = f"{type(exc).__name__}: {exc}"
        log.error("submission_failed", case_id=str(case.id), task_id=str(task.id), entity=entity.code, error=message, transient=exc.transient)
        if exc.transient and deferrals < MAX_SUBMISSION_DEFERRALS:
            task.config = {**(task.config or {}), "deferrals": deferrals}
            task.status_reason = f"Submission to {entity.name} deferred: {exc}"
            if deferrals == 1:  # no silent failures: the resident-facing timeline records it once
                await self.c.timeline.record(
                    case.id, "SUBMISSION_DEFERRED", f"{task.name}: {entity.name} unavailable",
                    "The request will be retried automatically.", category="exception", task_id=task.id,
                )
            return False
        await self.transition(task, S.FAILED, E.TASK_FAILED, reason=f"Submission to {entity.name} failed: {exc}")
        return False

    async def retry_deferred_submissions(self) -> int:
        """Worker entry point: re-attempt READY entity tasks whose submission was deferred."""
        rows = (await self.c.session.scalars(
            select(ServiceTask).where(ServiceTask.status == S.READY, ServiceTask.is_system.is_(False))
        )).all()
        count = 0
        for task in rows:
            case = await self.get_case(task.case_id)
            if case.status == CaseStatus.IN_PROGRESS and await self._submit(case, task):
                count += 1
        return count

    # ---- entity events -------------------------------------------------------------------------
    async def ingest_entity_event(self, webhook: EntityWebhook) -> IngestResult:
        """Apply an authority's event to the matching task. Idempotent: duplicates are acknowledged, not re-applied."""
        s = self.c.session
        task = await s.scalar(select(ServiceTask).where(ServiceTask.external_ref == webhook.reference))
        if not task:
            raise NotFound(f"No task is linked to application {webhook.reference}")
        entity = await self.entity_of(task)
        if entity and entity.code != webhook.entity_code:
            raise ValidationFailed("Application does not belong to the reporting entity")
        if await s.scalar(select(Event.id).where(Event.idempotency_key == webhook.idempotency_key)):
            return IngestResult(False, True, task.id, message="Duplicate event ignored")
        case = await self.get_case(task.case_id)
        if case.status in {CaseStatus.COMPLETED, CaseStatus.CANCELLED}:
            return IngestResult(False, False, task.id, message=f"Case is {case.status.value}; event recorded as ignored")

        common = dict(actor=f"entity:{webhook.entity_code}", actor_type=ActorType.GOVERNMENT_ENTITY, source="entity-webhook",
                      idempotency_key=webhook.idempotency_key)
        kind, payload = webhook.kind, webhook.payload
        event: Event | None
        if kind == "ACKNOWLEDGED":
            if task.status not in {S.SUBMITTED, S.WAITING_FOR_ENTITY}:
                return IngestResult(False, True, task.id, message="Already past acknowledgement")
            event = await self.transition(task, S.PROCESSING, E.TASK_PROCESSING, metadata={"reference": webhook.reference}, **common)
        elif kind == "COMPLETED":
            if task.status == S.COMPLETED:
                return IngestResult(False, True, task.id, message="Already completed")
            event = await self.transition(task, S.COMPLETED, E.TASK_COMPLETED, metadata={"reference": webhook.reference, **payload}, **common)
        elif kind == "DELAYED":
            if task.status == S.WAITING_FOR_ENTITY:
                return IngestResult(False, True, task.id, message="Already delayed")
            event = await self.transition(
                task, S.WAITING_FOR_ENTITY, E.TASK_DELAYED, metadata=payload, reason=payload.get("reason"), **common
            )
        elif kind == "REJECTED":
            event = await self.transition(
                task, S.REJECTED, E.TASK_REJECTED, metadata=payload, reason=payload.get("reason"), **common
            )
        elif kind == "DOCUMENT_REQUIRED":
            if task.status == S.WAITING_FOR_RESIDENT:
                return IngestResult(False, True, task.id, message="Already waiting for the resident")
            docs = payload.get("documents", [])
            task.required_documents = docs
            task.resident_action = "Provide " + ", ".join(d.get("name", d.get("type", "a document")) for d in docs) if docs else "Provide the requested information"
            event = await self.transition(
                task, S.WAITING_FOR_RESIDENT, E.DOCUMENT_REQUIRED, metadata={"documents": docs},
                reason="Additional information required by the authority", **common,
            )
        else:
            raise ValidationFailed(f"Unsupported entity event kind '{kind}'")
        return IngestResult(True, False, task.id, event.event_type if event else None)

    async def resume_after_documents(self, task: ServiceTask) -> None:
        """All requested documents are in: pass them to the authority and continue the task."""
        if task.status != S.WAITING_FOR_RESIDENT:
            return
        entity = await self.entity_of(task)
        if entity and task.external_ref:
            docs = [{"type": d.get("type")} for d in task.required_documents or []]
            await self.c.adapters.get(entity.code).forward_documents(self.c.session, task.external_ref, docs)
        await self.transition(
            task, S.PROCESSING, E.TASK_RESUMED, actor="ai:lifeloop", actor_type=ActorType.AI_AGENT,
            metadata={"reference": task.external_ref},
        )

    # ---- completion ----------------------------------------------------------------------------
    async def check_case_completion(self, case: LifeEventCase) -> bool:
        if case.status in {CaseStatus.COMPLETED, CaseStatus.CANCELLED, CaseStatus.PENDING_CONSENT}:
            return False
        if not await self.c.dependencies.all_complete(case.id):
            return False
        case.status = CaseStatus.COMPLETED
        case.completed_at = utcnow()
        await self.c.publisher.case_event(
            E.CASE_COMPLETED, case, old_state=CaseStatus.IN_PROGRESS.value, new_state=CaseStatus.COMPLETED.value,
            idempotency_key=f"case-completed:{case.id}",
        )
        return True
