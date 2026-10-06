"""Privacy-safe tracing for agent runs, LangGraph nodes, tool calls and integrations.

`Tracer.span()` is the only API the rest of the code uses. With Langfuse credentials it records observations in
Langfuse (inputs/outputs pass through `redact_value` and Langfuse's own `mask` hook, so Emirates IDs, passport
numbers, phone numbers and secrets never leave the process). Without credentials, or if Langfuse is down, the
same spans become structured log lines and a small in-memory ring buffer shown on the observability panel.
"""
from __future__ import annotations

import contextlib
import time
import uuid
from collections import deque
from collections.abc import Iterator
from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Any

from app.core.config import Settings
from app.core.pii import redact_value
from app.observability.logging import get_logger

log = get_logger("lifeloop.tracing")
current_trace_id: ContextVar[str | None] = ContextVar("current_trace_id", default=None)


@dataclass
class SpanRecord:
    name: str
    kind: str
    trace_id: str
    started_at: float
    duration_ms: float | None = None
    status: str = "ok"
    metadata: dict[str, Any] = field(default_factory=dict)


class SpanHandle:
    def __init__(self, record: SpanRecord, native: Any = None) -> None:
        self.record = record
        self._native = native
        self._output: Any = None

    def update(self, *, output: Any = None, metadata: dict[str, Any] | None = None, error: str | None = None,
               usage: dict[str, int] | None = None) -> None:
        if output is not None:
            self._output = redact_value(output)
        if metadata:
            self.record.metadata.update(redact_value(metadata))
        if error:
            self.record.status = "error"
            self.record.metadata["error"] = redact_value(error)
        if self._native is not None:
            try:
                kwargs: dict[str, Any] = {}
                if output is not None:
                    kwargs["output"] = self._output
                if metadata:
                    kwargs["metadata"] = redact_value(metadata)
                if error:
                    kwargs.update(level="ERROR", status_message=str(redact_value(error))[:500])
                if usage:
                    kwargs["usage_details"] = usage
                if kwargs:
                    self._native.update(**kwargs)
            except Exception as exc:  # observability must never break the request
                log.warning("langfuse_update_failed", error=str(exc))


class Tracer:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.recent: deque[SpanRecord] = deque(maxlen=200)
        self._client: Any = None
        self.backend = "local"
        if settings.langfuse_configured:
            try:
                from langfuse import Langfuse

                self._client = Langfuse(
                    public_key=settings.langfuse_public_key, secret_key=settings.langfuse_secret_key,
                    host=settings.langfuse_host, environment=settings.environment, release="0.2.0",
                    mask=lambda *, data, **_: redact_value(data),
                )
                self.backend = "langfuse"
            except Exception as exc:
                log.warning("langfuse_unavailable_using_local_tracing", error=str(exc))

    def status(self) -> dict[str, Any]:
        return {"backend": self.backend, "configured": self.settings.langfuse_configured, "recent_spans": len(self.recent)}

    @contextlib.contextmanager
    def span(self, name: str, *, kind: str = "span", input: Any = None, metadata: dict[str, Any] | None = None,
             case_id: str | None = None, session_id: str | None = None) -> Iterator[SpanHandle]:
        trace_id = current_trace_id.get() or uuid.uuid4().hex
        token = current_trace_id.set(trace_id)
        meta = redact_value({**(metadata or {}), **({"case_id": case_id} if case_id else {})})
        record = SpanRecord(name=name, kind=kind, trace_id=trace_id, started_at=time.time(), metadata=meta)
        started = time.perf_counter()
        native_cm = None
        handle: SpanHandle
        if self._client is not None:
            try:
                native_cm = self._client.start_as_current_observation(
                    name=name, as_type=kind if kind in {"span", "agent", "tool", "chain", "guardrail", "generation"} else "span",
                    input=redact_value(input), metadata={**meta, **({"session_id": session_id} if session_id else {})},
                )
                handle = SpanHandle(record, native_cm.__enter__())
            except Exception as exc:
                log.warning("langfuse_span_failed", span=name, error=str(exc))
                native_cm = None
                handle = SpanHandle(record)
        else:
            handle = SpanHandle(record)
        try:
            yield handle
        except Exception as exc:
            handle.update(error=f"{type(exc).__name__}: {exc}")
            raise
        finally:
            record.duration_ms = round((time.perf_counter() - started) * 1000, 2)
            if native_cm is not None:
                with contextlib.suppress(Exception):
                    native_cm.__exit__(None, None, None)
            self.recent.appendleft(record)
            emit = log.warning if record.status == "error" else log.debug
            emit("span", span=name, kind=kind, trace_id=trace_id, duration_ms=record.duration_ms,
                 status=record.status, **{k: v for k, v in record.metadata.items() if k in ("case_id", "tool", "node", "error")})
            current_trace_id.reset(token)

    def flush(self) -> None:
        if self._client is not None:
            with contextlib.suppress(Exception):
                self._client.flush()


_tracer: Tracer | None = None


def init_tracer(settings: Settings) -> Tracer:
    global _tracer
    _tracer = Tracer(settings)
    return _tracer


def get_tracer() -> Tracer:
    global _tracer
    if _tracer is None:
        from app.core.config import get_settings

        _tracer = Tracer(get_settings())
    return _tracer
