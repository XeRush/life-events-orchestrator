"""Outbox consumer: re-dispatches events whose handlers never finished (e.g. after a crash)."""
from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.core.clock import utcnow
from app.core.logging import get_logger
from app.models.event import Event

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

log = get_logger("lifeloop.consumer")


class OutboxConsumer:
    def __init__(self, c: ServiceContainer, min_age_seconds: int = 30) -> None:
        self.c = c
        self.min_age = timedelta(seconds=min_age_seconds)

    async def process_pending(self, limit: int = 50) -> int:
        stale = (await self.c.session.scalars(
            select(Event).where(Event.processed.is_(False), Event.created_at < utcnow() - self.min_age)
            .order_by(Event.created_at).limit(limit)
        )).all()
        for event in stale:
            log.warning("reprocessing_stale_event", event_id=str(event.id), event_type=event.event_type)
            event.error = None
            await self.c.bus.dispatch(event)
        await self.c.bus.drain()
        return len(stale)
