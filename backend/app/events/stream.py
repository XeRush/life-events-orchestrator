"""In-process pub/sub feeding the Server-Sent-Events dashboard stream.

Notifications are only emitted after the database transaction commits, so a client that reacts to an SSE
message and refetches always sees the new state. (Multi-instance deployments would swap this for Redis pub/sub.)
"""
import asyncio
from typing import Any


class EventHub:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=200)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers.discard(queue)

    def publish(self, message: dict[str, Any]) -> None:
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                pass  # slow consumer; the UI also polls as a fallback


hub = EventHub()
