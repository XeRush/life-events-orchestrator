from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.deps import get_container, get_current_user
from app.models.life_event_case import LifeEventCase
from app.models.user import User
from app.schemas.cases import TimelinePage
from app.services.container import ServiceContainer

router = APIRouter(tags=["timeline"])


@router.get("/cases/{case_id}/timeline", response_model=TimelinePage, summary="Persisted timeline of one case (paginated)")
async def case_timeline(
    case_id: str, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0), order: str = Query("desc", pattern="^(asc|desc)$"),
    user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container),
):
    case = await c.cases.resolve(case_id, user)
    items, total = await c.timeline.list_for_case(case.id, limit=limit, offset=offset, order=order)
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/timeline", summary="Digital life timeline across all of the resident's life events")
async def life_timeline(
    limit: int = Query(200, ge=1, le=500), offset: int = Query(0, ge=0), order: str = Query("asc", pattern="^(asc|desc)$"),
    user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    ids = await c.cases.case_ids_for_user(user)
    items, total = await c.timeline.list_for_cases(ids, limit=limit, offset=offset, order=order)
    cases = {x.id: x for x in (await c.session.scalars(select(LifeEventCase).where(LifeEventCase.id.in_(ids)))).all()} if ids else {}
    return {
        "items": [
            {"id": str(t.id), "case_id": str(t.case_id), "case_reference": cases[t.case_id].reference, "life_event": cases[t.case_id].event_type,
             "case_title": cases[t.case_id].title, "event_type": t.event_type, "category": t.category, "title": t.title,
             "description": t.description, "occurred_at": t.occurred_at}
            for t in items
        ],
        "total": total, "limit": limit, "offset": offset,
    }
