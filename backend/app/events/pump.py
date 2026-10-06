"""Synchronous event pump: relay + consume until quiescent.

Used by tests (deterministic end-to-end flows) and by demo endpoints that want the graph settled before they
respond. Production traffic uses the background relay and consumer workers instead; the code path per event
(relay -> broker -> dispatch -> handler) is identical.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.events.broker import InMemoryBroker
from app.events.consumers import dispatch
from app.events.relay import relay_once

if TYPE_CHECKING:
    from app.services.infra import Infra


async def pump(infra: Infra, max_rounds: int = 60) -> int:
    """Only valid with the in-memory broker (with Kafka, the consumer worker owns delivery)."""
    broker = infra.broker.broker
    if not isinstance(broker, InMemoryBroker):
        return 0
    total = 0
    for _ in range(max_rounds):
        published = await relay_once(infra)
        messages = broker.drain_nowait()
        for message in messages:
            await dispatch(infra, message)
        total += len(messages)
        if not published and not messages:
            break
    return total
