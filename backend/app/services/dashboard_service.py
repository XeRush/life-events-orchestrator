"""Aggregations for the dashboard and entity operations views."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import func, select

from app.models.callback import Callback
from app.models.enums import CallbackStatus, CaseStatus
from app.models.enums import DomainEventType as E
from app.models.enums import TaskStatus as S
from app.models.event import Event
from app.models.government_entity import GovernmentEntity
from app.models.service_task import ServiceTask
from app.models.user import User

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

ENTITY_EVENT_TYPES = [E.TASK_STARTED, E.TASK_PROCESSING, E.TASK_COMPLETED, E.TASK_DELAYED, E.TASK_REJECTED, E.DOCUMENT_REQUIRED, E.TASK_RESUMED]


class DashboardService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def waiting_on(self, snap: dict[str, Any]) -> str:
        if snap["status"] == "COMPLETED":
            return "none"
        if snap["waiting_on_resident"] or snap["status"] == "PENDING_CONSENT":
            return "resident"
        if snap["with_authority"]:
            return "authority"
        return "none"

    async def stats(self, user: User) -> dict[str, Any]:
        s = self.c.session
        case_ids = await self.c.cases.case_ids_for_user(user)
        cases, _ = await self.c.cases.list_for_user(user, limit=200)
        snaps = [(case, await self.c.cases.snapshot(case)) for case in cases]
        active = [(cs, sn) for cs, sn in snaps if cs.status != CaseStatus.COMPLETED and cs.status != CaseStatus.CANCELLED]
        tasks = list((await s.scalars(select(ServiceTask).where(ServiceTask.case_id.in_(case_ids)))).all()) if case_ids else []
        entity_tasks = [t for t in tasks if not t.is_system]
        cb_counts = dict((await s.execute(
            select(Callback.status, func.count()).where(Callback.case_id.in_(case_ids)).group_by(Callback.status))).all()) if case_ids else {}
        timeline, _ = await self.c.timeline.list_for_cases(case_ids, limit=10)
        callbacks = await self.c.callbacks.list_callbacks(case_ids, limit=6)
        refs = {cs.id: cs.reference for cs, _ in snaps}
        upcoming = [
            {"case_reference": sn["reference"], "case_id": sn["case_id"], **a} for _, sn in active for a in sn["pending_actions"]
        ]
        percent = [sn["progress"]["percent"] for _, sn in snaps]
        return {
            "counts": {
                "active_cases": len(active),
                "completed_cases": sum(1 for cs, _ in snaps if cs.status == CaseStatus.COMPLETED),
                "waiting_for_resident": sum(1 for _, sn in active if sn["waiting_on_resident"] or sn["status"] == "PENDING_CONSENT"),
                "in_progress": sum(1 for cs, _ in snaps if cs.status == CaseStatus.IN_PROGRESS),
                "entity_processing": sum(1 for t in entity_tasks if t.status in {S.SUBMITTED, S.PROCESSING, S.WAITING_FOR_ENTITY}),
                "callbacks_scheduled": cb_counts.get(CallbackStatus.SCHEDULED, 0),
                "callbacks_completed": cb_counts.get(CallbackStatus.COMPLETED, 0),
                "escalated": sum(1 for cs, _ in snaps if cs.status == CaseStatus.ESCALATED),
            },
            "service_completion_percent": round(sum(percent) / len(percent)) if percent else 0,
            "services": {"completed": sum(1 for t in entity_tasks if t.status == S.COMPLETED), "total": len(entity_tasks)},
            "active_cases": [
                {"id": sn["case_id"], "reference": sn["reference"], "title": sn["title"], "event_type": sn["event_type"], "status": sn["status"],
                 "progress": sn["progress"], "current_stage": sn["current_stage"], "waiting_on": await self.waiting_on(sn),
                 "resident_action_required": sn["resident_action_required"], "summary": sn["summary"]}
                for _, sn in active
            ],
            "recent_timeline": [
                {"id": str(t.id), "case_id": str(t.case_id), "case_reference": refs.get(t.case_id), "title": t.title,
                 "description": t.description, "category": t.category, "occurred_at": t.occurred_at}
                for t in timeline
            ],
            "upcoming_actions": upcoming,
            "recent_callbacks": [
                {"id": str(cb.id), "case_reference": refs.get(cb.case_id), "status": cb.status.value, "reason": cb.reason,
                 "scheduled_for": cb.scheduled_for, "duration_seconds": cb.duration_seconds}
                for cb in callbacks
            ],
        }

    async def entity_stats(self) -> list[dict[str, Any]]:
        s = self.c.session
        entities = list((await s.scalars(select(GovernmentEntity).order_by(GovernmentEntity.name))).all())
        recent = list((await s.scalars(
            select(Event).where(Event.event_type.in_([e.value for e in ENTITY_EVENT_TYPES])).order_by(Event.created_at.desc()).limit(400)
        )).all())
        out = []
        for ent in entities:
            tasks = list((await s.scalars(select(ServiceTask).where(ServiceTask.entity_id == ent.id))).all())
            def by(*states: S, tasks: list[ServiceTask] = tasks) -> int:
                return sum(1 for t in tasks if t.status in states)

            durations = [(t.completed_at - t.submitted_at).total_seconds() / 3600 for t in tasks if t.completed_at and t.submitted_at]
            rejected_events = sum(1 for e in recent if e.event_type == E.TASK_REJECTED and (e.event_metadata or {}).get("entity_code") == ent.code)
            events = [e for e in recent if (e.event_metadata or {}).get("entity_code") == ent.code][:8]
            out.append({
                "id": str(ent.id), "code": ent.code, "slug": ent.slug, "name": ent.name, "description": ent.description,
                "incoming": by(S.SUBMITTED), "processing": by(S.PROCESSING), "completed": by(S.COMPLETED),
                "delayed": by(S.WAITING_FOR_ENTITY), "waiting_for_resident": by(S.WAITING_FOR_RESIDENT),
                "rejected": max(by(S.REJECTED), rejected_events),
                "total": len(tasks),
                "avg_processing_hours": round(sum(durations) / len(durations), 1) if durations else None,
                "configured_avg_hours": ent.avg_processing_hours,
                "services": [{"code": svc.code, "name": svc.name, "description": svc.description, "typical_days": svc.typical_days}
                             for svc in self.c.adapters.get(ent.code).catalog],
                "recent_events": [
                    {"id": str(e.id), "event_type": e.event_type, "task_name": (e.event_metadata or {}).get("task_name"),
                     "new_state": e.new_state, "at": e.created_at, "case_reference": (e.event_metadata or {}).get("case_reference")}
                    for e in events
                ],
            })
        return out
