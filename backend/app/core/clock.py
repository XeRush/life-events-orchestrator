"""Overridable clock so seed data and tests can produce realistic historical timestamps."""
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime

_override: Callable[[], datetime] | None = None


def utcnow() -> datetime:
    return _override() if _override else datetime.now(UTC)


@contextmanager
def use_clock(fn: Callable[[], datetime]) -> Iterator[None]:
    global _override
    previous, _override = _override, fn
    try:
        yield
    finally:
        _override = previous
