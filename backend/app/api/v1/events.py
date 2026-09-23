import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.api.deps import ENTITY_SIDE, get_container, get_current_user, require_roles, user_from_token
from app.db.session import get_sessionmaker
from app.events.stream import hub
from app.integrations.government.base import EntityWebhook
from app.models.enums import UserRole
from app.models.event import Event
from app.models.life_event_case import LifeEventCase
from app.models.user import User
from app.schemas.events import EntityEventIn, EventPage, IngestOut
from app.services.container import ServiceContainer

router = APIRouter(tags=["events"])
STAFF = {UserRole.ADMIN, UserRole.OPERATOR}


@router.get("/events", response_model=EventPage, summary="Audit log / domain events (paginated, newest first)",
            description="Residents see events for their own cases; operators and admins see everything. Filter by case, type or task.")
async def list_events(
    case_id: str | None = None, event_type: str | None = None, task_id: uuid.UUID | None = None,
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container),
):
    q = select(Event)
    if case_id:
        case = await c.cases.resolve(case_id, user)
        q = q.where(Event.case_id == case.id)
    elif user.role not in STAFF:
        q = q.where(Event.case_id.in_(await c.cases.case_ids_for_user(user)))
    if event_type:
        q = q.where(Event.event_type == event_type.upper())
    if task_id:
        q = q.where(Event.task_id == task_id)
    total = await c.session.scalar(select(func.count()).select_from(q.subquery()))
    rows = (await c.session.scalars(q.order_by(Event.created_at.desc()).limit(limit).offset(offset))).all()
    return {"items": rows, "total": total or 0, "limit": limit, "offset": offset}


@router.post("/events", response_model=IngestOut, summary="Ingest an authority (entity) webhook event",
             description="The endpoint a real authority would call when an application changes state. Idempotent on `idempotency_key`: "
                         "duplicates are acknowledged without creating duplicate tasks or callbacks.")
async def ingest_entity_event(body: EntityEventIn, user: User = Depends(require_roles(*ENTITY_SIDE)), c: ServiceContainer = Depends(get_container)):
    result = await c.orchestration.ingest_entity_event(EntityWebhook(
        entity_code=body.entity_code.upper(), reference=body.reference, kind=body.kind.upper(),
        idempotency_key=body.idempotency_key, payload=body.payload,
    ))
    await c.commit()
    return {"applied": result.applied, "duplicate": result.duplicate, "task_id": result.task_id, "event_type": result.event_type, "message": result.message}


@router.get("/events/stream", summary="Server-Sent Events: live domain events for dashboards",
            description="EventSource cannot set headers, so pass the JWT as `?access_token=`. Messages are emitted only after the "
                        "transaction commits, so refetching on a message always sees the new state.")
async def stream(request: Request, access_token: str):
    async with get_sessionmaker()() as session:  # short-lived: do not hold a DB connection for the whole stream
        c = ServiceContainer(session)
        user = await user_from_token(c, access_token)
        allowed: set[str] | None = None if user.role in STAFF else {str(i) for i in await c.cases.case_ids_for_user(user)}
    queue = hub.subscribe()

    async def gen():
        nonlocal allowed
        try:
            yield "event: ready\ndata: {}\n\n"
            while not await request.is_disconnected():
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=15)
                except TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                cid = message.get("case_id")
                if allowed is not None:
                    if cid and cid not in allowed:
                        async with get_sessionmaker()() as s2:
                            case = await s2.get(LifeEventCase, uuid.UUID(cid))
                            if case and case.user_id == user.id:
                                allowed.add(cid)
                    if not cid or cid not in allowed:
                        continue
                yield f"event: domain\ndata: {json.dumps(message)}\n\n"
        finally:
            hub.unsubscribe(queue)

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
