"""Resident-facing digital timeline, derived from persisted domain events."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import func, select

from app.core.clock import utcnow
from app.models.enums import ActorType
from app.models.enums import DomainEventType as E
from app.models.event import Event
from app.models.life_event_case import LifeEventCase
from app.models.timeline import TimelineEvent

if TYPE_CHECKING:
    from app.services.container import ServiceContainer


def describe(event: Event, case: LifeEventCase | None) -> tuple[str, str, str] | None:
    """Map a domain event to (title, description, category); None means 'audit only, not shown to residents'."""
    m = event.event_metadata or {}
    name = m.get("task_name", "Service")
    et = event.event_type
    if et == E.LIFE_EVENT_CREATED:
        return f"{m.get('event_name', 'Life event')} reported", m.get("description", ""), "life_event"
    if et == E.CONSENT_CAPTURED:
        verb = "captured" if m.get("status") == "GRANTED" else "recorded as " + str(m.get("status", "")).lower()
        return f"Consent {verb}", str(m.get("consent_type", "")).replace("_", " ").title(), "consent"
    if et == E.TASK_STARTED:
        return m.get("started_label") or f"{name} initiated", f"Submitted to {m.get('entity_name', 'the authority')}. Reference {m.get('reference', '-')}.", "workflow"
    if et == E.TASK_PROCESSING:
        return f"{name} accepted for processing", f"{m.get('entity_name', 'The authority')} is working on it.", "workflow"
    if et == E.TASK_COMPLETED:
        if m.get("is_system"):
            return None
        return m.get("completed_label") or f"{name} completed", "Confirmed by the responsible authority.", "milestone"
    if et == E.TASK_DELAYED:
        return f"{name} delayed", f"The authority reports a delay of about {m.get('delay_hours', '?')} hours. Dependent services stay on hold.", "exception"
    if et == E.TASK_REJECTED:
        return f"{name} not approved", m.get("reason", "The authority did not approve this step."), "exception"
    if et == E.TASK_FAILED:
        return f"{name} could not be submitted", m.get("reason", ""), "exception"
    if et == E.DOCUMENT_REQUIRED:
        docs = ", ".join(d.get("name", d.get("type", "")) for d in m.get("documents", []))
        return "Additional document required", f"{name}: {docs}", "action"
    if et == E.DOCUMENT_RECEIVED:
        return "Document submitted", m.get("document_name", ""), "action"
    if et == E.TASK_RESUMED:
        return f"{name} resumed", "Review continues with the authority.", "workflow"
    if et == E.DEPENDENCY_RESOLVED:
        return f"{name} unlocked", "Its prerequisites are complete.", "workflow"
    if et == E.WORKFLOW_REPLANNED:
        return "Workflow replanned", m.get("summary", ""), "replan"
    if et == E.CALLBACK_REQUIRED:
        return "Callback scheduled", m.get("reason", ""), "callback"
    if et == E.CALLBACK_COMPLETED:
        return "Resident notified by voice", m.get("reason", ""), "callback"
    if et == E.CASE_PAUSED:
        return "Case paused", m.get("reason", "Paused at the resident's request."), "case"
    if et == E.CASE_RESUMED:
        return "Case resumed", "", "case"
    if et == E.CASE_ESCALATED:
        return "Escalated to a human officer", m.get("reason", ""), "exception"
    if et == E.CASE_COMPLETED:
        return "Case completed", "Every service has been confirmed by its authority.", "milestone"
    if et == E.RESIDENT_DEFERRED:
        return "Resident will provide information later", m.get("note", ""), "action"
    return None


class TimelineService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def record(
        self, case_id: uuid.UUID, event_type: str, title: str, description: str = "", *, category: str = "workflow",
        occurred_at: datetime | None = None, event_id: uuid.UUID | None = None, task_id: uuid.UUID | None = None,
        actor_type: ActorType = ActorType.SYSTEM, details: dict[str, Any] | None = None,
    ) -> TimelineEvent:
        entry = TimelineEvent(
            case_id=case_id, event_id=event_id, task_id=task_id, event_type=event_type, category=category,
            title=title, description=description, actor_type=actor_type, occurred_at=occurred_at or utcnow(),
            details=details or {},
        )
        self.c.session.add(entry)
        await self.c.session.flush()
        return entry

    async def record_from_event(self, event: Event) -> TimelineEvent | None:
        if not event.case_id:
            return None
        described = describe(event, None)
        if not described:
            return None
        title, description, category = described
        return await self.record(
            event.case_id, event.event_type, title, description, category=category, occurred_at=event.created_at,
            event_id=event.id, task_id=event.task_id, actor_type=event.actor_type,
            details={k: v for k, v in (event.event_metadata or {}).items() if k in {"task_key", "entity_name", "reference"}},
        )

    async def list_for_case(self, case_id: uuid.UUID, *, limit: int = 100, offset: int = 0, order: str = "desc") -> tuple[list[TimelineEvent], int]:
        s = self.c.session
        total = await s.scalar(select(func.count()).select_from(TimelineEvent).where(TimelineEvent.case_id == case_id))
        ordering = (TimelineEvent.occurred_at.asc(), TimelineEvent.created_at.asc()) if order == "asc" else (
            TimelineEvent.occurred_at.desc(), TimelineEvent.created_at.desc())
        rows = (await s.scalars(
            select(TimelineEvent).where(TimelineEvent.case_id == case_id).order_by(*ordering).limit(limit).offset(offset)
        )).all()
        return list(rows), total or 0

    async def list_for_cases(self, case_ids: list[uuid.UUID], *, limit: int = 200, offset: int = 0, order: str = "desc") -> tuple[list[TimelineEvent], int]:
        if not case_ids:
            return [], 0
        s = self.c.session
        total = await s.scalar(select(func.count()).select_from(TimelineEvent).where(TimelineEvent.case_id.in_(case_ids)))
        ordering = (TimelineEvent.occurred_at.asc(), TimelineEvent.created_at.asc()) if order == "asc" else (
            TimelineEvent.occurred_at.desc(), TimelineEvent.created_at.desc())
        rows = (await s.scalars(
            select(TimelineEvent).where(TimelineEvent.case_id.in_(case_ids)).order_by(*ordering).limit(limit).offset(offset)
        )).all()
        return list(rows), total or 0
