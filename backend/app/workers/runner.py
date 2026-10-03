"""Background workers started with the API process (RUN_WORKERS=true).

    relay      outbox -> Kafka (or the in-memory fallback), woken immediately after each commit
    consumer   Kafka consumer group -> idempotent handlers (orchestrator, callbacks, entities, post-call, notifier)
    callbacks  dial due callbacks (consent + opt-out re-checked), SMS fallback for unanswered calls
    entities   poll open requests at the (mock) authorities
    sla        SLA / consulate-silence watchdog -> STALLED + escalation

Each loop is thin and isolated, so the same functions can run as separate worker processes later.

`paused()` holds every loop at its next iteration (after in-flight work finishes). The demo reset uses it so that
only its scripted replay, on its own backdated clock, processes the events it writes.
"""
from __future__ import annotations

import asyncio
import contextlib
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import TYPE_CHECKING, Any

from app.events.consumers import dispatch
from app.events.relay import relay_once
from app.observability import metrics
from app.observability.logging import get_logger
from app.workers.jobs import dial_callbacks, poll_entities, sla_watchdog

if TYPE_CHECKING:
    from app.services.infra import Infra

log = get_logger("lifeloop.workers")


class WorkerRunner:
    def __init__(self, infra: Infra) -> None:
        self.infra = infra
        self._tasks: list[asyncio.Task[Any]] = []
        self.heartbeats: dict[str, float] = {}
        self._gate = asyncio.Event()
        self._gate.set()
        self._pauses = 0
        self._busy = 0
        self._idle = asyncio.Event()
        self._idle.set()

    @contextlib.asynccontextmanager
    async def _working(self) -> AsyncIterator[None]:
        """Wait while paused, then count this iteration as in flight."""
        await self._gate.wait()
        self._busy += 1
        self._idle.clear()
        try:
            yield
        finally:
            self._busy -= 1
            if not self._busy:
                self._idle.set()

    @contextlib.asynccontextmanager
    async def paused(self, timeout: float = 15.0) -> AsyncIterator[None]:
        """Stop every loop at its next iteration and wait for in-flight iterations to finish."""
        self._pauses += 1
        self._gate.clear()
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(self._idle.wait(), timeout)
        try:
            yield
        finally:
            self._pauses -= 1
            if self._pauses == 0:
                self._gate.set()
                self.infra.broker.wakeup.set()  # pick up anything written meanwhile

    def _beat(self, name: str) -> None:
        self.heartbeats[name] = time.time()
        metrics.WORKER_HEARTBEAT.labels(name).set(self.heartbeats[name])

    async def _loop(self, name: str, fn: Callable[[Infra], Awaitable[Any]], interval: float) -> None:
        while True:
            try:
                async with self._working():
                    await fn(self.infra)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # a worker must never die silently
                log.error("worker_iteration_failed", worker=name, error=f"{type(exc).__name__}: {exc}")
            self._beat(name)
            await asyncio.sleep(interval)

    async def _relay(self) -> None:
        broker = self.infra.broker
        while True:
            try:
                await asyncio.wait_for(broker.wakeup.wait(), timeout=self.infra.settings.worker_poll_seconds)
            except TimeoutError:
                pass
            broker.wakeup.clear()
            try:
                async with self._working():
                    while await relay_once(self.infra) >= 100:
                        pass
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.error("relay_failed", error=f"{type(exc).__name__}: {exc}")
            self._beat("relay")

    async def _consume(self) -> None:
        while True:
            try:
                async for message in self.infra.broker.broker.consume():
                    async with self._working():
                        await dispatch(self.infra, message)
                    self._beat("consumer")
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.error("consumer_loop_failed", error=f"{type(exc).__name__}: {exc}")
                await asyncio.sleep(2)

    async def start(self) -> None:
        s = self.infra.settings
        self._tasks = [
            asyncio.create_task(self._relay(), name="relay"),
            asyncio.create_task(self._consume(), name="consumer"),
            asyncio.create_task(self._loop("callbacks", dial_callbacks, 1.0), name="callbacks"),
            asyncio.create_task(self._loop("entities", poll_entities, s.entity_poll_seconds), name="entities"),
            asyncio.create_task(self._loop("sla", sla_watchdog, s.sla_check_seconds), name="sla"),
        ]
        log.info("workers_started", count=len(self._tasks), broker=self.infra.broker.mode)

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task

    def status(self) -> dict[str, Any]:
        now = time.time()
        return {"running": bool(self._tasks), "paused": self._pauses > 0, "workers": {name: {"last_beat_seconds_ago": round(now - ts, 1)} for name, ts in self.heartbeats.items()}}
