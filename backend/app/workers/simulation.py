"""Optional autopilot (SIMULATION_AUTOPILOT=true): mock authorities act on their own after a delay.

It only ever acknowledges and completes applications that need nothing from the resident, through the same
entity-event path as the demo control center. Off by default so judges stay in control of the story.
"""
from datetime import timedelta

from sqlalchemy import select

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.logging import get_logger
from app.db.session import session_scope
from app.models.enums import TaskStatus as S
from app.models.service_task import ServiceTask
from app.services.container import ServiceContainer

log = get_logger("lifeloop.workers.simulation")


async def run_simulation_once(settings: Settings) -> int:
    cutoff = utcnow() - timedelta(seconds=settings.simulation_autopilot_seconds)
    acted = 0
    async with session_scope() as session:
        c = ServiceContainer(session, settings=settings)
        tasks = (await session.scalars(
            select(ServiceTask).where(ServiceTask.status.in_([S.SUBMITTED, S.PROCESSING]), ServiceTask.updated_at < cutoff, ServiceTask.is_system.is_(False))
        )).all()
        for task in tasks[:3]:
            await c.demo.simulate(task, "acknowledge" if task.status == S.SUBMITTED else "complete")
            acted += 1
        if acted:
            await c.commit()
            log.info("autopilot_acted", count=acted)
    return acted
