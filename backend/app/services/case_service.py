"""Life Event Case lifecycle, access control, snapshots and the zero-repetition passport."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import TYPE_CHECKING, Any

from sqlalchemy import Integer, cast, func, select

from app.core.errors import Conflict, Forbidden, NotFound, UnsupportedEventType
from app.models.conversation import Conversation
from app.models.enums import (
    ACTIVE_CASE_STATES,
    AUTHORITY_ACTIVE_STATES,
    ActorType,
    CaseStatus,
    ConsentType,
    UserRole,
)
from app.models.enums import (
    DomainEventType as E,
)
from app.models.enums import (
    TaskStatus as S,
)
from app.models.life_event_case import LifeEventCase
from app.models.service_task import ServiceTask
from app.models.user import User
from app.services.summary import case_summary_text

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

FIRST_REFERENCE_NUMBER = 49281
STAFF_ROLES = {UserRole.ADMIN, UserRole.OPERATOR}


@dataclass
class CreateCaseInput:
    event_type: str
    event_date: date | None = None
    participants: list[dict[str, Any]] = field(default_factory=list)
    preferences: dict[str, Any] = field(default_factory=dict)
    memory: dict[str, Any] = field(default_factory=dict)
    consents: dict[ConsentType, bool] = field(default_factory=dict)
    source: str = "voice"
    idempotency_key: str | None = None
    reference: str | None = None


class CaseService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    # ---- access --------------------------------------------------------------------------------
    async def resolve(self, identifier: str | uuid.UUID, user: User | None = None) -> LifeEventCase:
        """Accepts a UUID or a human reference like L-49281; enforces resident ownership."""
        s = self.c.session
        case = None
        if isinstance(identifier, uuid.UUID):
            case = await s.get(LifeEventCase, identifier)
        else:
            try:
                case = await s.get(LifeEventCase, uuid.UUID(str(identifier)))
            except ValueError:
                case = await s.scalar(select(LifeEventCase).where(LifeEventCase.reference == str(identifier).upper()))
        if not case:
            raise NotFound(f"Case '{identifier}' not found")
        if user and user.role not in STAFF_ROLES and case.user_id != user.id:
            raise Forbidden("This case belongs to another resident")
        return case

    async def list_for_user(self, user: User, *, status: CaseStatus | None = None, limit: int = 50, offset: int = 0) -> tuple[list[LifeEventCase], int]:
        base = select(LifeEventCase)
        if user.role not in STAFF_ROLES:
            base = base.where(LifeEventCase.user_id == user.id)
        if status:
            base = base.where(LifeEventCase.status == status)
        total = await self.c.session.scalar(select(func.count()).select_from(base.subquery()))
        rows = (await self.c.session.scalars(base.order_by(LifeEventCase.created_at.desc()).limit(limit).offset(offset))).all()
        return list(rows), total or 0

    async def case_ids_for_user(self, user: User) -> list[uuid.UUID]:
        q = select(LifeEventCase.id)
        if user.role not in STAFF_ROLES:
            q = q.where(LifeEventCase.user_id == user.id)
        return list((await self.c.session.scalars(q)).all())

    async def latest_active(self, user_id: uuid.UUID, event_type: str | None = None) -> LifeEventCase | None:
        q = select(LifeEventCase).where(LifeEventCase.user_id == user_id, LifeEventCase.status.in_(ACTIVE_CASE_STATES))
        if event_type:
            q = q.where(LifeEventCase.event_type == event_type)
        return await self.c.session.scalar(q.order_by(LifeEventCase.created_at.desc()))

    async def latest_case(self, user_id: uuid.UUID) -> LifeEventCase | None:
        return await self.c.session.scalar(
            select(LifeEventCase).where(LifeEventCase.user_id == user_id).order_by(LifeEventCase.created_at.desc()))

    async def _next_reference(self) -> str:
        current = await self.c.session.scalar(
            select(func.max(cast(func.substr(LifeEventCase.reference, 3), Integer))).where(LifeEventCase.reference.like("L-%"))
        )
        return f"L-{max(current + 1, FIRST_REFERENCE_NUMBER) if current else FIRST_REFERENCE_NUMBER}"

    # ---- lifecycle -----------------------------------------------------------------------------
    async def create_case(self, user: User, data: CreateCaseInput, *, actor: str | None = None, actor_type: ActorType = ActorType.RESIDENT) -> tuple[LifeEventCase, bool]:
        """Create a case. Returns (case, created). With service-initiation consent the workflow starts immediately."""
        s = self.c.session
        if data.idempotency_key:
            existing = await s.scalar(select(LifeEventCase).where(LifeEventCase.idempotency_key == data.idempotency_key))
            if existing:
                return existing, False
        event = await self.c.workflows.get_life_event(data.event_type)
        if not event.is_configured:
            raise UnsupportedEventType(
                f"{event.name} is a workflow definition only in this prototype; government-authorized integrations are required to run it."
            )
        workflow = await self.c.workflows.get_active_workflow(event.id)
        prefs = {"language": user.preferred_language, "channel": "voice", "callback_time": "any", **data.preferences}
        case = LifeEventCase(
            reference=data.reference or await self._next_reference(), user_id=user.id, life_event_id=event.id,
            workflow_id=workflow.id, status=CaseStatus.PENDING_CONSENT, title=event.case_title, event_type=event.code,
            event_date=data.event_date, participants=data.participants, preferences=prefs, memory=data.memory,
            source=data.source, idempotency_key=data.idempotency_key,
        )
        s.add(case)
        await s.flush()
        who = actor or f"resident:{user.id}"
        participants = ", ".join(p.get("name") or p.get("role", "") for p in data.participants)
        await self.c.publisher.case_event(
            E.LIFE_EVENT_CREATED, case, actor=who, actor_type=actor_type,
            metadata={"event_name": f"{event.name} event", "event_type": event.code, "description": f"Participants: {participants}" if participants else "",
                      "event_date": data.event_date.isoformat() if data.event_date else None},
        )
        # Order matters: service-initiation consent last, because it triggers activation.
        for ctype in (ConsentType.DATA_PROCESSING_CONSENT, ConsentType.CALLBACK_CONSENT, ConsentType.SERVICE_INITIATION_CONSENT):
            if ctype in data.consents:
                await self.c.consents.record(case, ctype, data.consents[ctype], source=data.source, actor=who, actor_type=actor_type)
        return case, True

    async def pause(self, case: LifeEventCase, *, reason: str = "Paused at the resident's request.", actor: str = "resident", actor_type: ActorType = ActorType.RESIDENT) -> LifeEventCase:
        if case.status != CaseStatus.IN_PROGRESS:
            raise Conflict(f"Only an in-progress case can be paused (currently {case.status.value})")
        case.status = CaseStatus.PAUSED
        await self.c.publisher.case_event(E.CASE_PAUSED, case, actor=actor, actor_type=actor_type, old_state="IN_PROGRESS", new_state="PAUSED", metadata={"reason": reason})
        return case

    async def resume(self, case: LifeEventCase, *, actor: str = "resident", actor_type: ActorType = ActorType.RESIDENT) -> LifeEventCase:
        if case.status not in {CaseStatus.PAUSED, CaseStatus.ESCALATED}:
            raise Conflict(f"Only a paused or escalated case can be resumed (currently {case.status.value})")
        old = case.status
        case.status = CaseStatus.IN_PROGRESS
        await self.c.publisher.case_event(E.CASE_RESUMED, case, actor=actor, actor_type=actor_type, old_state=old.value, new_state="IN_PROGRESS")
        await self.c.dependencies.resolve(case)
        await self.c.orchestration.submit_ready_tasks(case)
        return case

    async def escalate(self, case: LifeEventCase, *, reason: str, actor: str = "resident", actor_type: ActorType = ActorType.RESIDENT) -> LifeEventCase:
        if case.status in {CaseStatus.COMPLETED, CaseStatus.CANCELLED}:
            raise Conflict("A closed case cannot be escalated")
        if case.status == CaseStatus.ESCALATED:
            return case
        old = case.status
        case.status = CaseStatus.ESCALATED
        case.status_reason = reason
        await self.c.publisher.case_event(E.CASE_ESCALATED, case, actor=actor, actor_type=actor_type, old_state=old.value, new_state="ESCALATED", metadata={"reason": reason})
        return case

    async def try_complete(self, case: LifeEventCase) -> bool:
        """Close the case only when the backend confirms every service is complete - the agent cannot force it."""
        return await self.c.orchestration.check_case_completion(case)

    # ---- read models ---------------------------------------------------------------------------
    async def tasks(self, case_id: uuid.UUID) -> list[ServiceTask]:
        return list((await self.c.session.scalars(
            select(ServiceTask).where(ServiceTask.case_id == case_id).order_by(ServiceTask.sort_order))).all())

    async def snapshot(self, case: LifeEventCase) -> dict[str, Any]:
        """Backend-verified facts about a case. Voice tools, callbacks and the API all read from here."""
        tasks = await self.tasks(case.id)
        entities = await self.c.workflows.entity_map()
        stages = [t for t in tasks if not t.is_system and t.status != S.CANCELLED]
        done = [t for t in stages if t.status == S.COMPLETED]

        def stage(t: ServiceTask) -> dict[str, Any]:
            ent = entities.get(t.entity_id) if t.entity_id else None
            return {"key": t.key, "name": t.name, "status": t.status.value, "entity": ent.name if ent else None,
                    "resident_action": t.resident_action, "required_documents": t.required_documents or []}

        with_authority = [stage(t) for t in stages if t.status in AUTHORITY_ACTIVE_STATES]
        waiting_resident = [stage(t) for t in stages if t.status == S.WAITING_FOR_RESIDENT]
        upcoming = [t for t in stages if t.status in {S.PENDING, S.BLOCKED, S.READY}]
        pending_actions = [
            {"task_key": t["key"], "task": t["name"], "action": t["resident_action"] or "Provide the requested information",
             "documents": t["required_documents"]}
            for t in waiting_resident
        ]
        if case.status == CaseStatus.PENDING_CONSENT:
            pending_actions.append({"task_key": None, "task": "Consent", "action": "Confirm consent so services can start", "documents": []})
        current = next((t for t in stages if t.status not in {S.COMPLETED}), None)
        percent = round(100 * len(done) / len(stages)) if stages else 0
        snap = {
            "case_id": str(case.id), "reference": case.reference, "title": case.title, "event_type": case.event_type,
            "status": case.status.value, "event_date": case.event_date.isoformat() if case.event_date else None,
            "progress": {"completed": len(done), "total": len(stages), "percent": 100 if case.status == CaseStatus.COMPLETED else percent},
            "stages": [stage(t) for t in stages],
            "current_stage": current.name if current else None,
            "with_authority": with_authority,
            "waiting_on_resident": waiting_resident,
            "upcoming_count": len(upcoming),
            "pending_actions": pending_actions,
            "resident_action_required": bool(pending_actions),
        }
        snap["summary"] = case_summary_text(snap, case.preferences.get("language", "en"))
        return snap

    async def passport(self, case: LifeEventCase) -> dict[str, Any]:
        """The zero-repetition Life Event Passport: everything the resident should never have to say twice."""
        s = self.c.session
        user = await s.get(User, case.user_id)
        snap = await self.snapshot(case)
        consents = await self.c.consents.list_for_case(case.id)
        docs = await self.c.documents.list_for_case(case.id)
        timeline, _ = await self.c.timeline.list_for_case(case.id, limit=10)
        convs = (await s.scalars(
            select(Conversation).where(Conversation.case_id == case.id).order_by(Conversation.started_at.desc()).limit(10))).all()
        latest: dict[str, Any] = {}
        for c in consents:
            latest[c.consent_type.value] = c
        return {
            "identity": {"resident_reference": f"R-{str(user.id)[:8].upper()}", "name": user.full_name, "email": user.email},
            "event": {"type": case.event_type, "title": case.title, "event_date": case.event_date, "reference": case.reference},
            "participants": case.participants,
            "consents": [
                {"consent_type": k, "status": v.status.value, "version": v.version, "scope": v.scope, "source": v.source, "captured_at": v.captured_at}
                for k, v in latest.items()
            ],
            "preferences": case.preferences,
            "memory": case.memory,
            "documents": [
                {"id": str(d.id), "doc_type": d.doc_type, "name": d.name, "status": d.status.value,
                 "verification_status": d.verification_status.value, "uploaded_at": d.uploaded_at, "task_id": str(d.task_id) if d.task_id else None}
                for d in docs
            ],
            "services": snap["stages"],
            "state": {"status": snap["status"], "progress": snap["progress"], "summary": snap["summary"], "current_stage": snap["current_stage"]},
            "recent_timeline": [
                {"title": t.title, "description": t.description, "occurred_at": t.occurred_at, "category": t.category} for t in timeline
            ],
            "conversations": [
                {"id": str(c.id), "channel": c.channel.value, "provider": c.provider, "started_at": c.started_at,
                 "duration_seconds": c.duration_seconds, "turns": len(c.transcript or [])}
                for c in convs
            ],
        }
