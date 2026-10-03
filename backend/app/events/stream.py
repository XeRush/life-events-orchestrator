"""In-process pub/sub feeding the Server-Sent-Events streams.

Messages are published only after the database transaction commits, so a client that refetches on a message
always sees the new state. A multi-instance deployment would back this with Redis pub/sub; the API is the same.
"""
import asyncio
from typing import Any


class EventHub:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

    def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=500)
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers.discard(queue)

    def publish(self, message: dict[str, Any]) -> None:
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                pass  # slow consumer: the UI also refetches on reconnect

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)


hub = EventHub()
