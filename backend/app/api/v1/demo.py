"""Demo control panel (DEMO_MODE + officer/admin). Visually separate from the officer interface in the UI."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.api.deps import STAFF, get_container, require_roles
from app.core.errors import Forbidden
from app.models.enums import OutboxStatus
from app.models.outbox import OutboxEvent
from app.models.user import User
from app.services.container import ServiceContainer

router = APIRouter(prefix="/demo", tags=["demo"])


async def demo_staff(user: User = Depends(require_roles(*STAFF)), c: ServiceContainer = Depends(get_container)) -> User:
    if not c.settings.demo_mode:
        raise Forbidden("Demo controls are disabled (DEMO_MODE=false).", code="demo_disabled")
    return user


class FailureIn(BaseModel):
    component: str = Field(pattern="^(government|kafka|elevenlabs)$")
    enabled: bool
    entity: str | None = Field(default=None, max_length=20)
    mode: str = Field(default="unavailable", pattern="^(unavailable|timeout|malformed)$")


class EscalationIn(BaseModel):
    reason: str = Field(default="SLA_STALL", pattern="^(SLA_STALL|CONSULATE_STALL|DISTRESS|APPROVAL_QUESTION|DISPUTED_RECORD|RESIDENT_REQUEST)$")


@router.get("", summary="Demo controls, failure switches and the outbox/broker state")
async def status(_: User = Depends(demo_staff), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    recent, _ = await c.outbox_repo.page(c.outbox_repo.recent(), limit=15)
    return {**c.demo.status(), "outbox": await c.outbox_repo.counts(), "broker": c.infra.broker.status(),
            "recent_events": [{"event_type": e.event_type, "topic": e.topic, "status": e.status.value, "created_at": e.created_at.isoformat(),
                               "attempts": e.attempts, "error": e.error} for e in recent],
            "mock_sms": list(getattr(c.infra.sms, "outbox", []))[:10]}


@router.post("/cases/{ref}/nodes/{node_key}/{action}", summary="Drive a node through the real pipeline")
async def act(ref: str, node_key: str, action: str, user: User = Depends(demo_staff), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await c.access.case_for(user, ref)
    result = await c.demo.act(case, node_key.upper(), action, user)
    await c.commit()
    return result


@router.post("/cases/{ref}/callback", summary="Trigger a callback now (consent and opt-out still enforced)")
async def callback(ref: str, user: User = Depends(demo_staff), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await c.access.case_for(user, ref)
    result = await c.demo.trigger_callback(case, user)
    await c.commit()
    return result


@router.post("/cases/{ref}/escalate", summary="Trigger an escalation")
async def escalate(ref: str, body: EscalationIn, user: User = Depends(demo_staff), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await c.access.case_for(user, ref)
    result = await c.demo.trigger_escalation(case, user, body.reason)
    await c.commit()
    return result


@router.post("/cases/{ref}/webhook", summary="Send an ElevenLabs-format post-call webhook through the real verification path")
async def webhook(ref: str, user: User = Depends(demo_staff), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await c.access.case_for(user, ref)
    result = await c.demo.simulate_webhook(case)
    await c.commit()
    return result


@router.post("/failures", summary="Simulate a government API, Kafka or ElevenLabs failure")
async def failures(body: FailureIn, _: User = Depends(demo_staff), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    result = await c.demo.set_failure(body.component, body.enabled, body.entity, body.mode)
    await c.commit()
    return result


@router.post("/reset", summary="Rebuild LL-DEMO-001 from scratch (runs the real pipeline on a backdated clock)")
async def reset(user: User = Depends(demo_staff), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return await c.demo.reset(user)


@router.get("/outbox", summary="Outbox rows (event inspector)")
async def outbox(status: str | None = Query(None, pattern="^(PENDING|PUBLISHED|PROCESSED|FAILED)$"), limit: int = Query(50, ge=1, le=200),
                 _: User = Depends(demo_staff), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    query = c.outbox_repo.recent()
    if status:
        query = query.where(OutboxEvent.status == OutboxStatus(status))
    items, _ = await c.outbox_repo.page(query, limit=limit)
    return [{"id": str(e.id), "event_type": e.event_type, "topic": e.topic, "status": e.status.value, "case_id": str(e.case_id) if e.case_id else None,
             "node_key": e.node_key, "attempts": e.attempts, "error": e.error, "created_at": e.created_at.isoformat(),
             "published_at": e.published_at.isoformat() if e.published_at else None} for e in items]
