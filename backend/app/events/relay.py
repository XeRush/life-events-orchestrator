"""Outbox relay: moves committed outbox rows to the broker, in order, with retry backoff."""
from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING, Any

from sqlalchemy import func, select

from app.core.clock import utcnow
from app.events.broker import BrokerUnavailable
from app.events.catalog import TOPIC_AUDIT
from app.models.enums import OutboxStatus
from app.models.outbox import OutboxEvent
from app.observability import metrics
from app.observability.logging import get_logger

if TYPE_CHECKING:
    from app.services.infra import Infra

log = get_logger("lifeloop.relay")


def to_message(ev: OutboxEvent) -> dict[str, Any]:
    return {
        "id": str(ev.id), "event_type": ev.event_type, "category": ev.category, "topic": ev.topic,
        "case_id": str(ev.case_id) if ev.case_id else None, "node_key": ev.node_key, "payload": ev.payload or {},
        "actor": ev.actor, "source": ev.source, "trace_id": ev.trace_id, "created_at": ev.created_at.isoformat(),
    }


async def relay_once(infra: Infra, limit: int = 100) -> int:
    """Publish up to `limit` pending events. Stops at the first failure so ordering is preserved."""
    published = 0
    async with infra.sessionmaker() as session:
        query = (select(OutboxEvent)
                 .where(OutboxEvent.status == OutboxStatus.PENDING, OutboxEvent.available_at <= utcnow())
                 .order_by(OutboxEvent.created_at, OutboxEvent.id).limit(limit))
        if session.bind.dialect.name == "postgresql":
            query = query.with_for_update(skip_locked=True)
        events = list((await session.scalars(query)).all())
        for ev in events:
            message = to_message(ev)
            try:
                await infra.broker.publish(ev.topic, message["case_id"], message)
                await infra.broker.publish(TOPIC_AUDIT, message["case_id"], {**message, "audit_copy": True})
            except BrokerUnavailable as exc:
                ev.attempts += 1
                ev.error = str(exc)[:500]
                ev.available_at = utcnow() + timedelta(seconds=min(30, 0.5 * 2 ** min(ev.attempts, 6)))
                infra.broker.last_error = str(exc)[:300]
                log.warning("outbox_publish_failed", event_id=str(ev.id), event_type=ev.event_type, attempts=ev.attempts, error=str(exc))
                break
            ev.status = OutboxStatus.PUBLISHED
            ev.published_at = utcnow()
            ev.error = None
            published += 1
        pending = await session.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.status == OutboxStatus.PENDING))
        metrics.OUTBOX_PENDING.set(pending or 0)
        await session.commit()
    if published:
        log.info("outbox_relayed", count=published, broker=infra.broker.mode)
    return published
