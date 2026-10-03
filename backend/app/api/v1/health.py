"""Liveness, readiness (every dependency, with its fallback state) and Prometheus metrics."""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select, text

from app.api.deps import get_container
from app.models.enums import OutboxStatus
from app.models.outbox import OutboxEvent
from app.observability import metrics
from app.services.container import ServiceContainer

router = APIRouter(tags=["health"])
STARTED = time.time()


@router.get("/health", summary="Liveness")
async def health() -> dict[str, Any]:
    return {"status": "ok", "service": "lifeloop-backend", "uptime_seconds": round(time.time() - STARTED)}


@router.get("/ready", summary="Readiness: PostgreSQL is required; every other dependency reports live or fallback")
async def ready(response: Response, c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    infra = c.infra
    db_ok = True
    try:
        await c.session.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    metrics.DEPENDENCY_UP.labels("postgres").set(1 if db_ok else 0)
    pending = await c.session.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.status == OutboxStatus.PENDING)) if db_ok else None
    voice = infra.voice_status()
    metrics.DEPENDENCY_UP.labels("elevenlabs").set(1 if voice["healthy"] else 0)
    workers = getattr(infra, "workers", None)
    body = {
        "status": "ready" if db_ok else "unavailable",
        "environment": c.settings.environment, "demo_mode": c.settings.demo_mode,
        "dependencies": {
            "postgres": {"healthy": db_ok, "mode": "primary"},
            "kafka": {**infra.broker.status(), "outbox_pending": pending},
            "redis": await infra.cache.status(),
            "neo4j": infra.neo4j.status(),
            "elevenlabs": voice,
            "langfuse": infra.tracer.status(),
            "government": infra.adapters.status(),
            "email": {"mode": infra.email.name, "healthy": infra.email.name == "gmail", "fallback": infra.email.name != "gmail"},
            "sms": {"mode": infra.sms.name, "mock": infra.sms.is_mock},
            "telephony": {"mode": infra.telephony.name},
        },
        "workers": workers.status() if workers else {"running": False},
    }
    if not db_ok:
        response.status_code = 503
    return body


@router.get("/metrics", summary="Prometheus metrics", response_class=Response)
async def prometheus() -> Response:
    return Response(content=metrics.render(), media_type="text/plain; version=0.0.4")
