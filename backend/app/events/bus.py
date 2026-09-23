"""Event bus abstraction + PostgreSQL-backed implementation.

`EventBus` is the port the domain depends on. `PostgresEventBus` persists every event (which doubles as the
audit log and the outbox) and dispatches to in-process handlers. A Kafka/Redis implementation can replace it
without touching services: publish() and drain() are the only contract.
"""
from __future__ import annotations

import time
import uuid
from abc import ABC, abstractmethod
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.core.logging import get_logger
from app.models.enums import ActorType, DomainEventType
from app.models.event import Event

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

log = get_logger("lifeloop.events")
Handler = Callable[["ServiceContainer", Event], Awaitable[None]]

_REGISTRY: dict[str, list[Handler]] = {}


def subscribe(*event_types: DomainEventType) -> Callable[[Handler], Handler]:
    """Register a handler for one or more domain event types (execution order = registration order)."""

    def decorator(fn: Handler) -> Handler:
        for et in event_types:
            _REGISTRY.setdefault(et.value, []).append(fn)
        return fn

    return decorator


def handlers_for(event_type: str) -> list[Handler]:
    return _REGISTRY.get(event_type, [])


class EventBus(ABC):
    @abstractmethod
    async def publish(self, event_type: DomainEventType, **kwargs: Any) -> Event | None: ...

    @abstractmethod
    async def drain(self) -> int: ...


class PostgresEventBus(EventBus):
    MAX_DEPTH = 500  # guard against handler feedback loops

    def __init__(self, session: AsyncSession, container: ServiceContainer) -> None:
        self.session = session
        self.container = container
        self._queue: list[Event] = []

    async def publish(
        self,
        event_type: DomainEventType,
        *,
        case_id: uuid.UUID | None = None,
        task_id: uuid.UUID | None = None,
        actor: str = "system",
        actor_type: ActorType = ActorType.SYSTEM,
        old_state: str | None = None,
        new_state: str | None = None,
        metadata: dict[str, Any] | None = None,
        source: str = "lifeloop",
        idempotency_key: str | None = None,
        occurred_at=None,
    ) -> Event | None:
        """Persist an event; returns None if an event with the same idempotency key already exists."""
        if idempotency_key:
            existing = await self.session.scalar(select(Event.id).where(Event.idempotency_key == idempotency_key))
            if existing:
                log.info("event_duplicate_ignored", event_type=event_type.value, idempotency_key=idempotency_key)
                return None
        event = Event(
            event_type=event_type.value,
            case_id=case_id,
            task_id=task_id,
            actor=actor,
            actor_type=actor_type,
            old_state=old_state,
            new_state=new_state,
            event_metadata=metadata or {},
            source=source,
            idempotency_key=idempotency_key,
            created_at=occurred_at or utcnow(),
        )
        self.session.add(event)
        await self.session.flush()
        self._queue.append(event)
        self.session.info.setdefault("notify", []).append(
            {"event_type": event.event_type, "case_id": str(case_id) if case_id else None, "task_id": str(task_id) if task_id else None}
        )
        log.info(
            "event_published", event_id=str(event.id), event_type=event.event_type,
            case_id=str(case_id) if case_id else None, task_id=str(task_id) if task_id else None,
            actor=actor, actor_type=actor_type.value,
        )
        return event

    async def drain(self) -> int:
        """Dispatch queued events (and any events handlers publish) until the queue is empty."""
        processed = 0
        while self._queue:
            if processed >= self.MAX_DEPTH:
                raise RuntimeError("Event handler feedback loop detected")
            event = self._queue.pop(0)
            await self.dispatch(event)
            processed += 1
        return processed

    async def dispatch(self, event: Event) -> None:
        started = time.perf_counter()
        try:
            for handler in handlers_for(event.event_type):
                await handler(self.container, event)
        except Exception as exc:
            event.error = f"{type(exc).__name__}: {exc}"[:1000]
            log.error("event_handler_failed", event_id=str(event.id), event_type=event.event_type, error=str(exc))
            raise
        event.processed = True
        event.processed_at = utcnow()
        log.info(
            "event_processed", event_id=str(event.id), event_type=event.event_type,
            case_id=str(event.case_id) if event.case_id else None,
            duration_ms=round((time.perf_counter() - started) * 1000, 2), status="ok",
        )
