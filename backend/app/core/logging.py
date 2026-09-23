"""Structured logging with request-scoped context and sensitive-field redaction."""
import logging
import sys
from typing import Any

import structlog

SENSITIVE_MARKERS = ("password", "token", "secret", "api_key", "apikey", "authorization", "signature")


def redact_sensitive(_: Any, __: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    for key in list(event_dict):
        if any(marker in key.lower() for marker in SENSITIVE_MARKERS):
            event_dict[key] = "[REDACTED]"
    return event_dict


def configure_logging(debug: bool = False, json_logs: bool = True) -> None:
    level = logging.DEBUG if debug else logging.INFO
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    renderer = structlog.processors.JSONRenderer() if json_logs else structlog.dev.ConsoleRenderer()
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            redact_sensitive,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=False,
    )


def get_logger(name: str = "lifeloop") -> Any:
    return structlog.get_logger(name)
