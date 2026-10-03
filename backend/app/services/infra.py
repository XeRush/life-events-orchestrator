"""Process-wide infrastructure: one instance per process, each piece with a graceful fallback.

| Piece      | Live                        | Fallback (no credentials / unreachable)        |
|------------|-----------------------------|------------------------------------------------|
| Broker     | Kafka (aiokafka)            | in-memory queue                                |
| Cache      | Redis                       | in-process memory                              |
| Graph      | Neo4j projection            | PostgreSQL queries                             |
| Tracing    | Langfuse                    | structured logs + in-memory span buffer        |
| Voice      | ElevenLabs                  | backend dialog engine (simulated voice)        |
| Telephony  | ElevenLabs + Twilio         | rings in the resident's web console            |
| SMS        | Twilio                      | mock SMS (recorded, clearly labelled)          |
| Email      | Gmail API                   | console (+ dev mailbox in development)         |
| Government | -                           | mock adapters only (always - prototype)        |
"""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.events.broker import BrokerManager
from app.graph.neo4j_projection import Neo4jProjection
from app.integrations.cache.cache import CacheManager
from app.integrations.elevenlabs.client import ElevenLabsClient
from app.integrations.government import AdapterRegistry
from app.integrations.notifications.email import ConsoleEmailBackend, GmailEmailBackend, build_email_backend
from app.integrations.notifications.sms import MockSms, TwilioSms, build_sms
from app.integrations.telephony.providers import ElevenLabsTwilioTelephony, SimulatedTelephony, build_telephony
from app.observability.logging import get_logger
from app.observability.tracing import Tracer, init_tracer
from app.services.storage import LocalFileStorage

log = get_logger("lifeloop.infra")


@dataclass
class Infra:
    settings: Settings
    sessionmaker: async_sessionmaker[AsyncSession]
    broker: BrokerManager
    cache: CacheManager
    neo4j: Neo4jProjection
    tracer: Tracer
    adapters: AdapterRegistry
    email: GmailEmailBackend | ConsoleEmailBackend
    sms: MockSms | TwilioSms
    elevenlabs: ElevenLabsClient | None
    telephony: SimulatedTelephony | ElevenLabsTwilioTelephony
    storage: LocalFileStorage
    background: set[asyncio.Task[Any]] = field(default_factory=set)
    voice_down: bool = False  # demo control: "simulate ElevenLabs unavailable"
    workers: Any = None

    async def start(self) -> None:
        await self.cache.start()
        await self.broker.start()
        await self.neo4j.start()

    async def stop(self) -> None:
        await self.drain_background(timeout=5)
        await self.broker.stop()
        await self.cache.stop()
        await self.neo4j.stop()
        self.tracer.flush()

    def spawn(self, factory: Callable[[], Awaitable[Any]], name: str) -> None:
        """Fire-and-forget work that must not block a request (e.g. sending an email after commit)."""

        async def runner() -> None:
            try:
                await factory()
            except Exception as exc:
                log.error("background_task_failed", task=name, error=f"{type(exc).__name__}: {exc}")

        task = asyncio.create_task(runner(), name=name)
        self.background.add(task)
        task.add_done_callback(self.background.discard)

    async def drain_background(self, timeout: float = 10) -> None:
        if self.background:
            await asyncio.wait(set(self.background), timeout=timeout)

    def voice_status(self) -> dict[str, Any]:
        s = self.settings
        simulated_down = self.voice_down or bool(self.elevenlabs and self.elevenlabs.simulate_unavailable)
        live = s.elevenlabs_configured and not simulated_down
        return {
            "provider": "elevenlabs" if live else "simulated", "configured": s.elevenlabs_configured, "healthy": live,
            "simulated_failure": simulated_down, "telephony": self.telephony.name,
            "tts_model": s.elevenlabs_tts_model, "stt_model": s.elevenlabs_stt_model,
            "fallback": not live, "note": None if live else "Simulated dialog engine: same tools, same guardrails, no audio provider.",
        }


def build_infra(settings: Settings, sessionmaker: async_sessionmaker[AsyncSession]) -> Infra:
    cache = CacheManager(settings)
    eleven = ElevenLabsClient.from_settings(settings) if settings.elevenlabs_api_key else None
    return Infra(
        settings=settings, sessionmaker=sessionmaker, broker=BrokerManager(settings), cache=cache,
        neo4j=Neo4jProjection(settings), tracer=init_tracer(settings), adapters=AdapterRegistry(cache),
        email=build_email_backend(settings), sms=build_sms(settings), elevenlabs=eleven,
        telephony=build_telephony(settings, eleven), storage=LocalFileStorage(settings.storage_dir),
    )


_infra: Infra | None = None


def set_infra(infra: Infra | None) -> None:
    global _infra
    _infra = infra


def get_infra() -> Infra:
    global _infra
    if _infra is None:
        from app.core.config import get_settings
        from app.db.session import get_sessionmaker

        _infra = build_infra(get_settings(), get_sessionmaker())
    return _infra
