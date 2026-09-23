"""In-process background workers started with the FastAPI lifespan.

They are deliberately thin loops over service methods, so the same code can move to a separate worker process,
Celery/RQ (Redis) or a Kafka consumer group without touching the domain layer.
"""
import asyncio
import contextlib

from app.core.config import Settings
from app.core.logging import get_logger
from app.workers.callbacks import run_callbacks_once
from app.workers.orchestration import run_orchestration_once
from app.workers.simulation import run_simulation_once

log = get_logger("lifeloop.workers")


class WorkerRunner:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._tasks: list[asyncio.Task] = []

    async def _loop(self, name: str, fn, interval: float) -> None:
        while True:
            try:
                await fn(self.settings)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # a worker must never die silently
                log.error("worker_iteration_failed", worker=name, error=str(exc))
            await asyncio.sleep(interval)

    async def start(self) -> None:
        s = self.settings
        self._tasks = [
            asyncio.create_task(self._loop("callbacks", run_callbacks_once, s.callback_worker_interval)),
            asyncio.create_task(self._loop("orchestration", run_orchestration_once, 15)),
        ]
        if s.simulation_autopilot:
            self._tasks.append(asyncio.create_task(self._loop("simulation", run_simulation_once, 5)))
        log.info("workers_started", count=len(self._tasks))

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task
