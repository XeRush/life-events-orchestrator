"""Structured application logging: structlog at the call site, Logifyx as the sink.

Call sites use ``get_logger(__name__).info("event_name", case_id=..., status=...)``. structlog merges the
request context (request_id, trace_id, case_id, user_id), redacts PII and secrets, and hands the record to the
stdlib logger tree that Logifyx owns (JSON lines on stdout, with Logifyx's own secret masking as a second net).
"""
from __future__ import annotations

import logging
from typing import Any

import structlog
from logifyx import configure_logging as configure_logifyx
from logifyx import get_logify_logger

from app.core.pii import redact_value

# LogRecord attributes that `extra=` must not overwrite.
_RESERVED = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename", "module", "exc_info", "exc_text",
    "stack_info", "lineno", "funcName", "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "message", "taskName", "asctime",
}
_SERVICE = "lifeloop-backend"


def _add_service(_: Any, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    event_dict.setdefault("service", _SERVICE)
    return event_dict


def _redact(_: Any, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    event = event_dict.pop("event", "")
    cleaned = {k: redact_value(v, k) for k, v in event_dict.items()}
    cleaned["event"] = event
    return cleaned


def _safe_keys(_: Any, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    return {(f"{k}_" if k in _RESERVED else k): v for k, v in event_dict.items()}


def _logifyx_factory(*args: Any) -> logging.Logger:
    """structlog asks for a logger by name; Logifyx owns the handlers (JSON, masking, optional Kafka/remote sinks)."""
    name = args[0] if args and isinstance(args[0], str) else "lifeloop"
    try:
        return get_logify_logger(name)
    except TypeError:  # a plain stdlib logger with this name already exists (created before configuration)
        return get_logify_logger(f"lifeloop.{name}")


_NOISY = ("uvicorn.access", "sqlalchemy", "httpx", "httpcore", "aiokafka", "kafka", "neo4j", "langfuse", "googleapiclient", "aiosqlite",
          "asyncio")


def _is_noisy(name: str) -> bool:
    return any(name == n or name.startswith(f"{n}.") for n in _NOISY)


def configure_logging(level: str = "INFO", output: str = "console", json_logs: bool = True, service: str = _SERVICE) -> None:
    global _SERVICE
    _SERVICE = service
    configure_logifyx(level=level.upper(), output=output, json_mode=json_logs, mask=True, color=not json_logs,
                      log_file="logs/lifeloop.log", reset=True)
    # Library chatter (SQL statements with their parameters, HTTP traffic, Kafka) stays at WARNING. Logifyx gives every
    # logger, including ones created later, the global level and stops propagation, so quietening a parent is not
    # enough: SQLAlchemy creates "sqlalchemy.engine.Engine" only when the engine is built and would log every query.
    # Existing loggers are set here; the logger class Logifyx registered is wrapped so new noisy loggers start quiet.
    for name in [*_NOISY, *list(logging.root.manager.loggerDict)]:
        if _is_noisy(name):
            logging.getLogger(name).setLevel(logging.WARNING)
    base = logging.getLoggerClass()
    if not getattr(base, "_lifeloop_quiet", False):
        class _QuietLibraries(base):  # type: ignore[misc, valid-type]
            _lifeloop_quiet = True

            def __init__(self, name: str, *args: Any, **kwargs: Any) -> None:
                super().__init__(name, *args, **kwargs)
                if _is_noisy(name):
                    self.setLevel(logging.WARNING)

        logging.setLoggerClass(_QuietLibraries)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True, key="ts"),
            _add_service,
            structlog.processors.format_exc_info,
            _redact,
            _safe_keys,
            structlog.stdlib.render_to_log_kwargs,
        ],
        logger_factory=_logifyx_factory,
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=False,
    )


def bind_context(**values: Any) -> None:
    structlog.contextvars.bind_contextvars(**{k: v for k, v in values.items() if v is not None})


def clear_context() -> None:
    structlog.contextvars.clear_contextvars()


def get_logger(name: str = "lifeloop") -> Any:
    return structlog.get_logger(name)
