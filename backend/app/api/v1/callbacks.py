import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.deps import STAFF, get_container, get_current_user, require_roles
from app.models.life_event_case import LifeEventCase
from app.models.user import User
from app.schemas.callbacks import CallbackOut
from app.services.container import ServiceContainer

router = APIRouter(tags=["callbacks"])


async def _decorate(c: ServiceContainer, rows) -> list[dict[str, Any]]:
    ids = {r.case_id for r in rows}
    refs = {x.id: x.reference for x in (await c.session.scalars(select(LifeEventCase).where(LifeEventCase.id.in_(ids)))).all()} if ids else {}
    return [{**CallbackOut.model_validate(r).model_dump(), "case_reference": refs.get(r.case_id)} for r in rows]


@router.get("/callbacks", summary="Callback center: scheduled, in progress and completed proactive calls")
async def list_callbacks(
    status: str | None = Query(None, description="SCHEDULED | IN_PROGRESS | COMPLETED | FAILED"), case_id: str | None = None,
    limit: int = Query(100, ge=1, le=300), offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container),
) -> list[dict[str, Any]]:
    if case_id:
        ids = [(await c.cases.resolve(case_id, user)).id]
    else:
        ids = await c.cases.case_ids_for_user(user)
    rows = await c.callbacks.list_callbacks(ids, status.upper() if status else None, limit, offset)
    return await _decorate(c, rows)


@router.get("/callbacks/{callback_id}", summary="One callback with its script")
async def get_callback(callback_id: uuid.UUID, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    cb = await c.callbacks.get(callback_id)
    await c.cases.resolve(cb.case_id, user)
    return (await _decorate(c, [cb]))[0]


@router.post("/callbacks/{callback_id}/execute", summary="Place a scheduled callback now")
async def execute_callback(callback_id: uuid.UUID, user: User = Depends(require_roles(*STAFF)), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    cb = await c.callbacks.get(callback_id)
    await c.callbacks.execute(cb)
    await c.commit()
    return (await _decorate(c, [cb]))[0]


@router.post("/callbacks/run-due", summary="Place every callback that is due (also runs on a worker loop)")
async def run_due(user: User = Depends(require_roles(*STAFF)), c: ServiceContainer = Depends(get_container)) -> dict[str, int]:
    done = await c.callbacks.execute_due()
    await c.commit()
    return {"placed": len(done)}
