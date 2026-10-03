"""Consumer registry and dispatcher.

Each handler is a named consumer of a topic. Delivery is at-least-once (Kafka or the in-memory fallback); the
`consumer_receipts` table turns that into an exactly-once *effect*: a redelivered event finds its receipt and is
acknowledged without running the handler again. A handler that keeps failing is dead-lettered (outbox status
FAILED, audited) instead of blocking the stream.
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from sqlalchemy import select, update

from app.core.clock import utcnow
from app.models.enums import OutboxStatus
from app.models.outbox import ConsumerReceipt, OutboxEvent
from app.observability import metrics
from app.observability.logging import bind_context, get_logger
from app.observability.tracing import current_trace_id

if TYPE_CHECKING:
    from app.services.container import ServiceContainer
    from app.services.infra import Infra

log = get_logger("lifeloop.consumers")


@dataclass
class Message:
    id: uuid.UUID
    event_type: str
    category: str
    topic: str
    case_id: uuid.UUID | None
    node_key: str | None
    payload: dict[str, Any] = field(default_factory=dict)
    actor: str = ""
    source: str = "SYSTEM"
    trace_id: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Message:
        return cls(
            id=uuid.UUID(data["id"]), event_type=data["event_type"], category=data.get("category", ""), topic=data["topic"],
            case_id=uuid.UUID(data["case_id"]) if data.get("case_id") else None, node_key=data.get("node_key"),
            payload=data.get("payload") or {}, actor=data.get("actor", ""), source=data.get("source", "SYSTEM"),
            trace_id=data.get("trace_id"),
        )


Handler = Callable[["ServiceContainer", Message], Awaitable[None]]


@dataclass(frozen=True)
class Registration:
    name: str
    topic: str
    handler: Handler
    events: frozenset[str] | None
    categories: frozenset[str] | None


_REGISTRY: list[Registration] = []


def consumer(name: str, topic: str, *, events: tuple[str, ...] | None = None, categories: tuple[str, ...] | None = None):
    def decorator(fn: Handler) -> Handler:
        _REGISTRY.append(Registration(name, topic, fn, frozenset(events) if events else None,
                                      frozenset(categories) if categories else None))
        return fn

    return decorator


def registrations_for(message: Message) -> list[Registration]:
    out = []
    for reg in _REGISTRY:
        if reg.topic != message.topic:
            continue
        if reg.events is not None and message.event_type not in reg.events:
            continue
        if reg.categories is not None and message.category not in reg.categories:
            continue
        out.append(reg)
    return out


async def dispatch(infra: Infra, raw: dict[str, Any]) -> None:
    from app.events import handlers as _handlers  # noqa: F401  (registers consumers)

    message = Message.from_dict(raw)
    regs = registrations_for(message)
    failed = False
    for reg in regs:
        ok = await _run(infra, reg, message)
        failed = failed or not ok
    if raw.get("audit_copy"):
        metrics.CONSUMED.labels(message.topic, "audited").inc()
        return
    async with infra.sessionmaker() as session:
        await session.execute(
            update(OutboxEvent).where(OutboxEvent.id == message.id, OutboxEvent.status == OutboxStatus.PUBLISHED)
            .values(status=OutboxStatus.FAILED if failed else OutboxStatus.PROCESSED, processed_at=utcnow())
        )
        await session.commit()


async def _run(infra: Infra, reg: Registration, message: Message) -> bool:
    from app.services.container import ServiceContainer

    attempts = infra.settings.consumer_max_attempts
    for attempt in range(1, attempts + 1):
        token = current_trace_id.set(message.trace_id)
        bind_context(trace_id=message.trace_id, case_id=str(message.case_id) if message.case_id else None, consumer=reg.name)
        try:
            async with infra.sessionmaker() as session:
                done = await session.scalar(select(ConsumerReceipt.id).where(
                    ConsumerReceipt.consumer == reg.name, ConsumerReceipt.event_id == message.id))
                if done:
                    metrics.CONSUMED.labels(message.topic, "duplicate").inc()
                    return True
                c = ServiceContainer(session, infra=infra)
                await reg.handler(c, message)
                session.add(ConsumerReceipt(consumer=reg.name, event_id=message.id))
                await c.commit()
            metrics.CONSUMED.labels(message.topic, "ok").inc()
            return True
        except Exception as exc:
            log.error("consumer_failed", consumer=reg.name, event_type=message.event_type, event_id=str(message.id),
                      attempt=attempt, error=f"{type(exc).__name__}: {exc}")
            if attempt < attempts:
                await asyncio.sleep(0.2 * attempt)
                continue
            metrics.CONSUMED.labels(message.topic, "dead_letter").inc()
            async with infra.sessionmaker() as session:
                ev = await session.get(OutboxEvent, message.id)
                if ev:
                    ev.error = f"{reg.name}: {type(exc).__name__}: {exc}"[:1000]
                await session.commit()
            return False
        finally:
            current_trace_id.reset(token)
    return False
