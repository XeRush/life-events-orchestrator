"""Overridable clock. The override is a ContextVar, so seeding a backdated demo history inside one task never
changes the time seen by concurrent requests or background workers."""
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime

_override: ContextVar[Callable[[], datetime] | None] = ContextVar("clock_override", default=None)


def utcnow() -> datetime:
    fn = _override.get()
    return fn() if fn else datetime.now(UTC)


@contextmanager
def use_clock(fn: Callable[[], datetime]) -> Iterator[None]:
    token = _override.set(fn)
    try:
        yield
    finally:
        _override.reset(token)
