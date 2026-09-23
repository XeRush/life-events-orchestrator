"""Typed helpers for publishing task/case events with a consistent payload shape."""
from __future__ import annotations

from typing import Any

from app.events.bus import EventBus
from app.models.enums import ActorType, DomainEventType
from app.models.event import Event
from app.models.life_event_case import LifeEventCase
from app.models.service_task import ServiceTask


def task_payload(task: ServiceTask, **extra: Any) -> dict[str, Any]:
    cfg = task.config or {}
    return {
        "task_key": task.key,
        "task_name": task.name,
        "is_system": task.is_system,
        "started_label": cfg.get("started_label"),
        "completed_label": cfg.get("completed_label"),
        **extra,
    }


class EventPublisher:
    def __init__(self, bus: EventBus) -> None:
        self.bus = bus

    async def case_event(
        self, event_type: DomainEventType, case: LifeEventCase, *, actor: str = "system",
        actor_type: ActorType = ActorType.SYSTEM, metadata: dict[str, Any] | None = None,
        old_state: str | None = None, new_state: str | None = None, idempotency_key: str | None = None,
        source: str = "lifeloop",
    ) -> Event | None:
        return await self.bus.publish(
            event_type, case_id=case.id, actor=actor, actor_type=actor_type, old_state=old_state,
            new_state=new_state, metadata={"case_reference": case.reference, **(metadata or {})},
            idempotency_key=idempotency_key, source=source,
        )

    async def task_event(
        self, event_type: DomainEventType, case: LifeEventCase, task: ServiceTask, *, actor: str = "system",
        actor_type: ActorType = ActorType.SYSTEM, old_state: str | None = None, new_state: str | None = None,
        metadata: dict[str, Any] | None = None, idempotency_key: str | None = None, source: str = "lifeloop",
    ) -> Event | None:
        return await self.bus.publish(
            event_type, case_id=case.id, task_id=task.id, actor=actor, actor_type=actor_type,
            old_state=old_state, new_state=new_state, idempotency_key=idempotency_key, source=source,
            metadata={"case_reference": case.reference, **task_payload(task), **(metadata or {})},
        )
