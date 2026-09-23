"""Dependency evaluation: which tasks may run, which stay blocked."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.models.enums import DomainEventType, TaskStatus
from app.models.life_event_case import LifeEventCase
from app.models.service_task import ServiceTask, TaskDependency
from app.services.state_machine import validate_transition

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

WAITING = {TaskStatus.PENDING, TaskStatus.BLOCKED}


class DependencyService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def graph(self, case_id: uuid.UUID) -> tuple[dict[uuid.UUID, ServiceTask], dict[uuid.UUID, set[uuid.UUID]]]:
        s = self.c.session
        tasks = {t.id: t for t in (await s.scalars(select(ServiceTask).where(ServiceTask.case_id == case_id))).all()}
        deps: dict[uuid.UUID, set[uuid.UUID]] = {tid: set() for tid in tasks}
        for d in (await s.scalars(select(TaskDependency).where(TaskDependency.case_id == case_id))).all():
            deps[d.task_id].add(d.depends_on_id)
        return tasks, deps

    async def resolve(self, case: LifeEventCase) -> list[ServiceTask]:
        """Move PENDING/BLOCKED tasks to READY when every prerequisite is COMPLETED; otherwise BLOCKED.

        Returns the tasks that just became READY. Emits DEPENDENCY_RESOLVED for tasks that were waiting on others.
        """
        tasks, deps = await self.graph(case.id)
        unlocked: list[ServiceTask] = []
        for task in sorted(tasks.values(), key=lambda t: t.sort_order):
            if task.status not in WAITING:
                continue
            satisfied = all(tasks[d].status == TaskStatus.COMPLETED for d in deps[task.id])
            if satisfied:
                old = task.status
                validate_transition(old, TaskStatus.READY)
                task.status = TaskStatus.READY
                unlocked.append(task)
                if deps[task.id]:
                    await self.c.publisher.task_event(
                        DomainEventType.DEPENDENCY_RESOLVED, case, task, old_state=old.value, new_state=TaskStatus.READY.value,
                        metadata={"unblocked_by": [tasks[d].key for d in deps[task.id]]},
                    )
            elif task.status == TaskStatus.PENDING:
                task.status = TaskStatus.BLOCKED
        await self.c.session.flush()
        return unlocked

    async def downstream(self, case_id: uuid.UUID, task: ServiceTask) -> list[ServiceTask]:
        """All tasks (transitively) waiting on `task`."""
        tasks, deps = await self.graph(case_id)
        found: set[uuid.UUID] = set()
        frontier = {task.id}
        while frontier:
            nxt = {tid for tid, ds in deps.items() if ds & frontier and tid not in found}
            found |= nxt
            frontier = nxt
        return sorted((tasks[t] for t in found), key=lambda t: t.sort_order)

    async def all_complete(self, case_id: uuid.UUID) -> bool:
        tasks, _ = await self.graph(case_id)
        active = [t for t in tasks.values() if t.status != TaskStatus.CANCELLED]
        return bool(active) and all(t.status == TaskStatus.COMPLETED for t in active)
