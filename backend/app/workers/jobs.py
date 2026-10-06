"""One iteration of each background job. Each runs in its own session / transaction (unit of work)."""
from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING

from app.core.clock import utcnow
from app.events.recorder import Actor
from app.models.enums import EscalationReason, NodeState, Source
from app.observability.logging import get_logger

if TYPE_CHECKING:
    from app.services.infra import Infra

log = get_logger("lifeloop.jobs")


async def dial_callbacks(infra: Infra) -> int:
    from app.services.container import ServiceContainer

    async with infra.sessionmaker() as session:
        c = ServiceContainer(session, infra=infra)
        placed = await c.callbacks.dial_due()
        swept = await c.callbacks.sweep_unanswered()
        await c.commit()
    return placed + swept


async def poll_entities(infra: Infra) -> int:
    """Ask each (mock) authority for the status of open requests - the 'poll status' arrows in canvas box L."""
    from app.services.container import ServiceContainer

    changed = 0
    async with infra.sessionmaker() as session:
        c = ServiceContainer(session, infra=infra)
        for request in await c.requests_repo.pollable(utcnow() - timedelta(seconds=infra.settings.entity_poll_seconds)):
            if await c.entities.poll(request):
                changed += 1
        await c.commit()
    return changed


async def sla_watchdog(infra: Infra) -> int:
    """A node past its SLA is marked STALLED ('not cleared yet') and escalated; a silent consulate is escalated."""
    from app.services.container import ServiceContainer

    flagged = 0
    now = utcnow()
    async with infra.sessionmaker() as session:
        c = ServiceContainer(session, infra=infra)
        for node in await c.nodes_repo.in_states({NodeState.SUBMITTED, NodeState.PROCESSING}):
            if node.sla_due_at and node.sla_due_at < now:
                await c.graph.transition(node, NodeState.STALLED, source=Source.SYSTEM, actor=Actor.system("SLA watchdog"),
                                         reason=f"Past the expected {node.sla_hours} hours - not cleared yet", payload={"stall_kind": "SLA"})
                flagged += 1
        for node in await c.nodes_repo.in_states({NodeState.WAITING_FOR_PARENT, NodeState.PROCESSING}):
            if node.key != "CONSULATE_PASSPORT":
                continue
            last = (node.parent_report or {}).get("reported_at")
            since = node.updated_at if not last else None
            if since and (now - since) > timedelta(days=infra.settings.consulate_stall_days):
                case = await c.cases_repo.get(node.case_id)
                await c.escalations.open(case, EscalationReason.CONSULATE_STALL, node_key=node.key, actor=Actor.system("SLA watchdog"),
                                         summary=f"No consulate milestone reported in {infra.settings.consulate_stall_days} days.")
                flagged += 1
        await c.commit()
    return flagged
