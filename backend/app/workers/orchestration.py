"""Orchestration worker: outbox recovery + retry of deferred submissions."""
from app.core.config import Settings
from app.core.logging import get_logger
from app.db.session import session_scope
from app.events.consumers import OutboxConsumer
from app.services.container import ServiceContainer

log = get_logger("lifeloop.workers.orchestration")


async def run_orchestration_once(settings: Settings) -> dict[str, int]:
    async with session_scope() as session:
        c = ServiceContainer(session, settings=settings)
        reprocessed = await OutboxConsumer(c).process_pending()
        resubmitted = await c.orchestration.retry_deferred_submissions()
        if reprocessed or resubmitted:
            await c.commit()
            log.info("orchestration_worker", reprocessed=reprocessed, resubmitted=resubmitted)
        return {"reprocessed": reprocessed, "resubmitted": resubmitted}
