"""Domain-event handlers: the reactive core of the platform.

Registration order is execution order. Timeline first, then state propagation, then the callback decision.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.events.bus import subscribe
from app.models.enums import CaseStatus, ConsentStatus, ConsentType, TaskStatus
from app.models.enums import DomainEventType as E
from app.models.event import Event
from app.models.life_event_case import LifeEventCase
from app.models.service_task import ServiceTask

if TYPE_CHECKING:
    from app.services.container import ServiceContainer


async def _case_task(c: ServiceContainer, event: Event) -> tuple[LifeEventCase | None, ServiceTask | None]:
    case = await c.session.get(LifeEventCase, event.case_id) if event.case_id else None
    task = await c.session.get(ServiceTask, event.task_id) if event.task_id else None
    return case, task


@subscribe(*list(E))
async def write_timeline(c: ServiceContainer, event: Event) -> None:
    await c.timeline.record_from_event(event)


@subscribe(E.CONSENT_CAPTURED)
async def start_workflow_on_consent(c: ServiceContainer, event: Event) -> None:
    meta = event.event_metadata or {}
    if meta.get("consent_type") != ConsentType.SERVICE_INITIATION_CONSENT.value or meta.get("status") != ConsentStatus.GRANTED.value:
        return
    case, _ = await _case_task(c, event)
    if case and case.status == CaseStatus.PENDING_CONSENT:
        await c.orchestration.activate_case(case)


@subscribe(E.TASK_COMPLETED)
async def propagate_completion(c: ServiceContainer, event: Event) -> None:
    """Completed task -> verify its documents, unlock dependants, start them, close the case when all are done."""
    case, task = await _case_task(c, event)
    if not case or not task:
        return
    await c.documents.verify_for_task(task)
    await c.dependencies.resolve(case)
    await c.orchestration.submit_ready_tasks(case)
    await c.orchestration.check_case_completion(case)


@subscribe(E.TASK_DELAYED)
async def hold_dependants(c: ServiceContainer, event: Event) -> None:
    case, task = await _case_task(c, event)
    if case and task:
        await c.replanning.on_delayed(case, task, event)


@subscribe(E.TASK_REJECTED)
async def replan_rejection(c: ServiceContainer, event: Event) -> None:
    case, task = await _case_task(c, event)
    if case and task:
        await c.replanning.on_rejected(case, task, event)


@subscribe(E.TASK_FAILED)
async def escalate_failure(c: ServiceContainer, event: Event) -> None:
    case, task = await _case_task(c, event)
    if case and task:
        await c.replanning.on_failed(case, task, event)


@subscribe(E.DOCUMENT_REQUIRED)
async def register_document_request(c: ServiceContainer, event: Event) -> None:
    case, task = await _case_task(c, event)
    if case and task:
        await c.replanning.on_document_required(case, task, event)


@subscribe(E.DOCUMENT_RECEIVED)
async def resume_after_document(c: ServiceContainer, event: Event) -> None:
    """When the last requested document arrives, hand it to the authority and resume the task."""
    case, task = await _case_task(c, event)
    if case and task and task.status == TaskStatus.WAITING_FOR_RESIDENT and not await c.documents.outstanding(task.id):
        await c.orchestration.resume_after_documents(task)


@subscribe(E.TASK_COMPLETED, E.DOCUMENT_REQUIRED, E.TASK_DELAYED, E.WORKFLOW_REPLANNED, E.CASE_ESCALATED, E.CASE_COMPLETED)
async def decide_callback(c: ServiceContainer, event: Event) -> None:
    await c.callbacks.on_event(event)
