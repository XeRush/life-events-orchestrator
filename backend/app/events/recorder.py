"""EventRecorder: the single write path for domain events.

One call, one transaction: the outbox row (for Kafka), the timeline entry (for the resident and officer) and the
audit record are written together with the state change that caused them. Nothing is published to the broker
here - the relay does that after commit - so a crash can never publish an event for a state that rolled back.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from sqlalchemy import select

from app.core.clock import utcnow
from app.core.pii import redact_value
from app.events.catalog import spec_for, topic_for
from app.models.audit import AuditLog
from app.models.case_event import CaseEvent
from app.models.enums import ActorType, Source, UserRole
from app.models.outbox import OutboxEvent
from app.observability import metrics
from app.observability.logging import get_logger
from app.observability.tracing import current_trace_id

if TYPE_CHECKING:
    from app.models.user import User
    from app.services.container import ServiceContainer

log = get_logger("lifeloop.events")


@dataclass(frozen=True)
class Actor:
    type: ActorType
    label: str
    id: uuid.UUID | None = None

    @classmethod
    def system(cls, label: str = "LifeLoop orchestrator") -> Actor:
        return cls(ActorType.SYSTEM, label)

    @classmethod
    def agent(cls, label: str = "LifeLoop voice agent") -> Actor:
        return cls(ActorType.AI_AGENT, label)

    @classmethod
    def entity(cls, label: str) -> Actor:
        return cls(ActorType.GOVERNMENT_ENTITY, f"{label} (mock)")

    @classmethod
    def provider(cls, label: str) -> Actor:
        return cls(ActorType.PROVIDER, label)

    @classmethod
    def user(cls, user: User) -> Actor:
        kind = {UserRole.OFFICER: ActorType.OFFICER, UserRole.ADMIN: ActorType.ADMIN}.get(user.role, ActorType.RESIDENT)
        label = f"{user.full_name} ({user.title})" if user.title else user.full_name
        return cls(kind, label, user.id)


class EventRecorder:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def emit(
        self,
        name: str,
        *,
        case_id: uuid.UUID | None = None,
        node_key: str | None = None,
        actor: Actor | None = None,
        source: Source = Source.SYSTEM,
        payload: dict[str, Any] | None = None,
        title: str | None = None,
        description: str = "",
        status: str | None = None,
        resident_present: bool = False,
        idempotency_key: str | None = None,
        timeline: bool | None = None,
        i18n: dict[str, Any] | None = None,
    ) -> OutboxEvent | None:
        """Persist one domain event. Returns None when the idempotency key has been seen before."""
        session = self.c.session
        if idempotency_key and await session.scalar(select(OutboxEvent.id).where(OutboxEvent.idempotency_key == idempotency_key)):
            log.info("event_duplicate_ignored", event_type=name, idempotency_key=idempotency_key)
            return None
        actor = actor or Actor.system()
        now = utcnow()
        trace_id = current_trace_id.get()
        safe_payload = redact_value(payload or {})
        outbox = OutboxEvent(
            event_type=name, category=spec_for(name).category, topic=topic_for(name), case_id=case_id, node_key=node_key,
            actor=actor.label, source=source.value, payload=safe_payload, idempotency_key=idempotency_key,
            available_at=now, trace_id=trace_id, created_at=now,
        )
        session.add(outbox)
        await session.flush()
        if case_id and (timeline if timeline is not None else spec_for(name).timeline):
            session.add(CaseEvent(
                case_id=case_id, node_key=node_key, event_type=name, title=(title or name)[:200], description=description,
                source=source, actor=actor.label, actor_type=actor.type, status=status, resident_present=resident_present,
                metadata_={"i18n": i18n} if i18n else {}, trace_id=trace_id, outbox_event_id=outbox.id, occurred_at=now,
            ))
        session.add(AuditLog(
            occurred_at=now, actor_id=actor.id, actor_type=actor.type, actor_label=actor.label, action=name, case_id=case_id,
            node_key=node_key, source=source, result="SUCCESS", trace_id=trace_id, request_id=self.c.request_id,
            details={k: v for k, v in safe_payload.items() if k not in ("transcript",)},
        ))
        session.info.setdefault("notify", []).append(
            {"event_type": name, "case_id": str(case_id) if case_id else None, "node_key": node_key, "source": source.value}
        )
        session.info["outbox_written"] = True
        metrics.CASE_EVENTS.labels(name).inc()
        log.info("event_recorded", event_type=name, event_id=str(outbox.id), case_id=str(case_id) if case_id else None,
                 node_key=node_key, actor_type=actor.type.value, source=source.value)
        return outbox

    async def audit_detached(self, action: str, *, actor: Actor, case_id: uuid.UUID | None = None, node_key: str | None = None,
                             result: str = "DENIED", details: dict[str, Any] | None = None) -> None:
        """Audit in its own transaction: a denied action must be recorded even though the request is about to fail."""
        async with self.c.infra.sessionmaker() as session:
            session.add(AuditLog(
                occurred_at=utcnow(), actor_id=actor.id, actor_type=actor.type, actor_label=actor.label, action=action, case_id=case_id,
                node_key=node_key, source=Source.SYSTEM, result=result, trace_id=current_trace_id.get(), request_id=self.c.request_id,
                ip_hash=self.c.ip_hash, details=redact_value(details or {}),
            ))
            await session.commit()

    async def audit(self, action: str, *, actor: Actor, case_id: uuid.UUID | None = None, node_key: str | None = None,
                    result: str = "SUCCESS", source: Source = Source.SYSTEM, details: dict[str, Any] | None = None) -> None:
        """Audit-only record (no outbox, no timeline), e.g. a denied action or a read of sensitive data."""
        self.c.session.add(AuditLog(
            occurred_at=utcnow(), actor_id=actor.id, actor_type=actor.type, actor_label=actor.label, action=action,
            case_id=case_id, node_key=node_key, source=source, result=result, trace_id=current_trace_id.get(),
            request_id=self.c.request_id, ip_hash=self.c.ip_hash, details=redact_value(details or {}),
        ))
