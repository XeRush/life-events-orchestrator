"""Callback worker: places every callback whose scheduled time has arrived."""
from app.core.config import Settings
from app.core.logging import get_logger
from app.db.session import session_scope
from app.services.container import ServiceContainer

log = get_logger("lifeloop.workers.callbacks")


async def run_callbacks_once(settings: Settings) -> int:
    async with session_scope() as session:
        c = ServiceContainer(session, settings=settings)
        done = await c.callbacks.execute_due()
        if done:
            await c.commit()
            log.info("callbacks_placed", count=len(done))
        return len(done)
