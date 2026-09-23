"""Dependency-aware replanning for delays, rejections, missing documents and failures."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import select, update

from app.agents.exception_agent import ExceptionAction, ExceptionAgent
from app.core.logging import get_logger
from app.models.enums import ActorType, CaseStatus
from app.models.enums import DomainEventType as E
from app.models.enums import TaskStatus as S
from app.models.event import Event
from app.models.life_event_case import LifeEventCase
from app.models.service_task import ServiceTask, TaskDependency

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

log = get_logger("lifeloop.replanning")


class ReplanningService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c
        self.agent = ExceptionAgent(c.settings.default_max_task_attempts)

    async def _replanned(self, case: LifeEventCase, task: ServiceTask, decision: str, summary: str, *, notify: bool, **extra: Any) -> None:
        task.replanned = True
        await self.c.publisher.task_event(
            E.WORKFLOW_REPLANNED, case, task, actor="ai:exception-agent", actor_type=ActorType.AI_AGENT,
            metadata={"decision": decision, "summary": summary, "notify_resident": notify, **extra},
        )

    async def on_delayed(self, case: LifeEventCase, task: ServiceTask, event: Event) -> None:
        """A delay never bothers the resident by itself: dependants simply stay blocked until the authority acts."""
        held = await self.c.dependencies.downstream(case.id, task)
        held = [t for t in held if t.status in {S.BLOCKED, S.PENDING}]
        if held:
            await self.c.publisher.task_event(
                E.DEPENDENCY_BLOCKED, case, task,
                metadata={"held": [t.name for t in held], "reason": f"{task.name} is delayed"},
            )

    async def on_document_required(self, case: LifeEventCase, task: ServiceTask, event: Event) -> None:
        await self.c.documents.request_for_task(case, task, (event.event_metadata or {}).get("documents", []))

    async def on_rejected(self, case: LifeEventCase, task: ServiceTask, event: Event) -> None:
        payload = event.event_metadata or {}
        alt = (task.config or {}).get("alternative")
        alternative_used = bool(await self.c.session.scalar(
            select(ServiceTask.id).where(ServiceTask.case_id == case.id, ServiceTask.key == (alt or {}).get("key", "-"))
        ))
        decision = self.agent.decide_rejection(
            attempts=task.attempts, node_config=task.config or {}, payload=payload, alternative_used=alternative_used
        )
        log.info("rejection_decision", case_id=str(case.id), task_id=str(task.id), action=decision.action.value)
        if decision.action == ExceptionAction.RETRY:
            task.idempotency_key = f"{task.idempotency_key.split(':retry')[0]}:retry{task.attempts}"
            task.external_ref = None
            await self.c.orchestration.transition(
                task, S.READY, E.WORKFLOW_REPLANNED, actor="ai:exception-agent", actor_type=ActorType.AI_AGENT,
                metadata={"decision": "RETRY", "summary": f"{task.name}: resubmitting after a retryable rejection.", "notify_resident": False},
            )
            task.replanned = True
            await self.c.orchestration.submit_ready_tasks(case)
        elif decision.action == ExceptionAction.REQUEST_INFO:
            docs = payload.get("documents", [])
            task.required_documents = docs
            task.resident_action = "Provide " + ", ".join(d.get("name", "a document") for d in docs) if docs else "Provide the requested information"
            await self.c.orchestration.transition(
                task, S.WAITING_FOR_RESIDENT, E.DOCUMENT_REQUIRED, actor="ai:exception-agent", actor_type=ActorType.AI_AGENT,
                metadata={"documents": docs}, reason=decision.reason,
            )
        elif decision.action == ExceptionAction.ALTERNATIVE:
            await self._apply_alternative(case, task, alt)
        elif decision.action == ExceptionAction.WAIT:
            await self.c.orchestration.transition(
                task, S.WAITING_FOR_ENTITY, E.WORKFLOW_REPLANNED, actor="ai:exception-agent", actor_type=ActorType.AI_AGENT,
                metadata={"decision": "WAIT", "summary": f"{task.name}: waiting on the authority.", "notify_resident": False},
                reason=decision.reason,
            )
        else:
            await self.c.cases.escalate(case, reason=f"{task.name}: {decision.reason}", actor="ai:exception-agent", actor_type=ActorType.AI_AGENT)

    async def _apply_alternative(self, case: LifeEventCase, old: ServiceTask, alt: dict[str, Any]) -> None:
        """Swap a rejected task for the configured alternative path and rewire its dependants."""
        s = self.c.session
        new = ServiceTask(
            case_id=case.id, node_id=old.node_id, entity_id=old.entity_id, key=alt["key"], name=alt["name"],
            description=alt.get("description", ""), service_code=alt["service_code"], status=S.PENDING,
            sort_order=old.sort_order, replanned=True,
            config={"alternative_of": old.key, "started_label": f"{alt['name']} initiated", "completed_label": f"{alt['name']} completed"},
            idempotency_key=f"{case.reference}:{alt['key']}:1",
        )
        s.add(new)
        await s.flush()
        prereqs = (await s.scalars(select(TaskDependency.depends_on_id).where(TaskDependency.task_id == old.id))).all()
        for dep_id in prereqs:
            s.add(TaskDependency(case_id=case.id, task_id=new.id, depends_on_id=dep_id))
        await s.execute(update(TaskDependency).where(TaskDependency.depends_on_id == old.id).values(depends_on_id=new.id))
        await s.flush()
        await self.c.orchestration.transition(
            old, S.CANCELLED, E.TASK_CANCELLED, actor="ai:exception-agent", actor_type=ActorType.AI_AGENT,
            metadata={"replaced_by": new.key}, reason="Replaced by the configured alternative path",
        )
        old.replanned = True
        await self.c.publisher.task_event(
            E.TASK_CREATED, case, new, actor="ai:exception-agent", actor_type=ActorType.AI_AGENT, new_state=S.PENDING.value
        )
        await self._replanned(
            case, new, "ALTERNATIVE",
            f"{old.name} was not approved. Continuing through the permitted alternative: {new.name}.", notify=True,
            replaced=old.key,
        )
        await self.c.dependencies.resolve(case)
        await self.c.orchestration.submit_ready_tasks(case)

    async def on_failed(self, case: LifeEventCase, task: ServiceTask, event: Event) -> None:
        await self.c.cases.escalate(
            case, reason=f"{task.name} could not be submitted: {(event.event_metadata or {}).get('reason', 'unknown error')}",
            actor="ai:exception-agent", actor_type=ActorType.AI_AGENT,
        )

    async def replan_case(self, case: LifeEventCase, *, actor: str = "system", actor_type: ActorType = ActorType.SYSTEM) -> dict[str, int]:
        """Re-evaluate the whole graph: requeue failed tasks, unlock what is unblocked, start what is ready."""
        requeued = 0
        failed = (await self.c.session.scalars(
            select(ServiceTask).where(ServiceTask.case_id == case.id, ServiceTask.status == S.FAILED))).all()
        for task in failed:
            task.idempotency_key = f"{task.idempotency_key.split(':retry')[0]}:retry{task.attempts + 1}"
            await self.c.orchestration.transition(
                task, S.READY, E.WORKFLOW_REPLANNED, actor=actor, actor_type=actor_type,
                metadata={"decision": "REQUEUE", "summary": f"{task.name} re-queued.", "notify_resident": False},
            )
            requeued += 1
        if requeued and case.status == CaseStatus.ESCALATED:
            case.status = CaseStatus.IN_PROGRESS
            await self.c.publisher.case_event(
                E.CASE_RESUMED, case, actor=actor, actor_type=actor_type, old_state="ESCALATED", new_state="IN_PROGRESS")
        unlocked = await self.c.dependencies.resolve(case)
        started = await self.c.orchestration.submit_ready_tasks(case)
        summary = f"Dependencies re-evaluated: {requeued} re-queued, {len(unlocked)} unlocked, {started} started."
        await self.c.publisher.case_event(
            E.WORKFLOW_REPLANNED, case, actor=actor, actor_type=actor_type,
            metadata={"decision": "REEVALUATE", "summary": summary, "notify_resident": False},
        )
        return {"requeued": requeued, "unlocked": len(unlocked), "started": started}
