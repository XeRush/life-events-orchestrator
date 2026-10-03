"""Message broker port with a Kafka adapter and an in-process development fallback.

* `KafkaBroker` (aiokafka): used whenever KAFKA_BOOTSTRAP_SERVERS is set and reachable. Messages are keyed by case
  id so one case's events stay ordered within a partition.
* `InMemoryBroker`: an asyncio queue with the same contract. Selected when Kafka is not configured or not reachable
  at start-up, so the whole product still runs offline (demo mode).
* `simulate_failure`: the demo control "Simulate Kafka failure" makes publishing fail. Events then stay PENDING in
  the PostgreSQL outbox and are relayed, in order, once the broker is back - the outbox pattern made visible.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator
from typing import Any

from app.core.config import Settings
from app.events.catalog import ALL_TOPICS
from app.observability import metrics
from app.observability.logging import get_logger

log = get_logger("lifeloop.broker")


class BrokerUnavailable(Exception):
    pass


class InMemoryBroker:
    name = "in-memory"

    def __init__(self) -> None:
        self.queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def start(self) -> None:
        return None

    async def stop(self) -> None:
        return None

    async def publish(self, topic: str, key: str | None, message: dict[str, Any]) -> None:
        await self.queue.put({**message, "topic": topic})

    async def consume(self) -> AsyncIterator[dict[str, Any]]:
        while True:
            yield await self.queue.get()

    def drain_nowait(self) -> list[dict[str, Any]]:
        items = []
        while not self.queue.empty():
            items.append(self.queue.get_nowait())
        return items


class KafkaBroker:
    name = "kafka"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._producer: Any = None
        self._consumer: Any = None

    async def start(self) -> None:
        from aiokafka import AIOKafkaProducer
        from aiokafka.admin import AIOKafkaAdminClient, NewTopic

        servers = self.settings.kafka_bootstrap_servers
        admin = AIOKafkaAdminClient(bootstrap_servers=servers, client_id=f"{self.settings.kafka_client_id}-admin")
        await asyncio.wait_for(admin.start(), timeout=10)
        try:
            existing = set(await admin.list_topics())
            missing = [NewTopic(t, num_partitions=3, replication_factor=1) for t in ALL_TOPICS if t not in existing]
            if missing:
                with contextlib.suppress(Exception):
                    await admin.create_topics(missing)
        finally:
            await admin.close()
        self._producer = AIOKafkaProducer(bootstrap_servers=servers, client_id=self.settings.kafka_client_id, acks="all",
                                          enable_idempotence=True, request_timeout_ms=5000)
        await asyncio.wait_for(self._producer.start(), timeout=10)

    async def stop(self) -> None:
        for client in (self._consumer, self._producer):
            if client is not None:
                with contextlib.suppress(Exception):
                    await client.stop()

    async def publish(self, topic: str, key: str | None, message: dict[str, Any]) -> None:
        if self._producer is None:
            raise BrokerUnavailable("Kafka producer not started")
        try:
            await asyncio.wait_for(
                self._producer.send_and_wait(topic, json.dumps(message, default=str).encode(), key=key.encode() if key else None),
                timeout=8,
            )
        except Exception as exc:
            raise BrokerUnavailable(f"Kafka publish failed: {type(exc).__name__}") from exc

    async def consume(self) -> AsyncIterator[dict[str, Any]]:
        from aiokafka import AIOKafkaConsumer

        self._consumer = AIOKafkaConsumer(
            *ALL_TOPICS, bootstrap_servers=self.settings.kafka_bootstrap_servers, group_id=self.settings.kafka_consumer_group,
            enable_auto_commit=False, auto_offset_reset="earliest", client_id=f"{self.settings.kafka_client_id}-consumer",
        )
        await self._consumer.start()
        try:
            async for record in self._consumer:
                message = json.loads(record.value)
                message["topic"] = record.topic
                yield message
                await self._consumer.commit()
        finally:
            with contextlib.suppress(Exception):
                await self._consumer.stop()


class BrokerManager:
    """Owns the active broker, the fallback decision and the demo failure switch."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.broker: InMemoryBroker | KafkaBroker = InMemoryBroker()
        self.mode = "in-memory"
        self.simulate_failure = False
        self.last_error: str | None = None
        self.wakeup = asyncio.Event()

    async def start(self) -> None:
        if not self.settings.kafka_bootstrap_servers:
            self.mode = "in-memory"
            metrics.DEPENDENCY_UP.labels("kafka").set(0)
            log.info("broker_selected", mode=self.mode, reason="KAFKA_BOOTSTRAP_SERVERS not set")
            return
        kafka = KafkaBroker(self.settings)
        try:
            await kafka.start()
        except Exception as exc:
            self.mode = "in-memory-fallback"
            self.last_error = f"{type(exc).__name__}: {exc}"[:300]
            metrics.DEPENDENCY_UP.labels("kafka").set(0)
            log.warning("kafka_unavailable_using_in_memory_fallback", error=self.last_error)
            await kafka.stop()
            return
        self.broker = kafka
        self.mode = "kafka"
        metrics.DEPENDENCY_UP.labels("kafka").set(1)
        log.info("broker_selected", mode=self.mode)

    async def stop(self) -> None:
        await self.broker.stop()

    async def publish(self, topic: str, key: str | None, message: dict[str, Any]) -> None:
        if self.simulate_failure:
            raise BrokerUnavailable("Kafka unavailable (simulated by the demo control panel)")
        await self.broker.publish(topic, key, message)

    def status(self) -> dict[str, Any]:
        healthy = not self.simulate_failure and self.mode == "kafka"
        return {
            "mode": self.mode, "healthy": healthy, "simulated_failure": self.simulate_failure,
            "fallback": self.mode != "kafka", "last_error": self.last_error,
        }
