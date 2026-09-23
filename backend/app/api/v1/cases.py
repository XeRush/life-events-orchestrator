from typing import Any

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import get_container, get_current_user, limit
from app.models.enums import ActorType, CaseStatus, ConsentType
from app.models.life_event_case import LifeEventCase
from app.models.user import User
from app.schemas.callbacks import CallbackOut
from app.schemas.cases import CallbackRequestIn, CaseOut, CreateCaseIn, TaskOut
from app.services.case_service import CreateCaseInput
from app.services.container import ServiceContainer
from app.services.dashboard_service import DashboardService

router = APIRouter(tags=["cases"], dependencies=[Depends(limit())])


async def case_out(c: ServiceContainer, case: LifeEventCase) -> dict[str, Any]:
    snap = await c.cases.snapshot(case)
    return {
        "id": case.id, "reference": case.reference, "title": case.title, "event_type": case.event_type, "status": case.status.value,
        "event_date": case.event_date, "created_at": case.created_at, "updated_at": case.updated_at,
        "participants": case.participants, "preferences": case.preferences, "progress": snap["progress"],
        "current_stage": snap["current_stage"], "resident_action_required": snap["resident_action_required"],
        "waiting_on": await DashboardService(c).waiting_on(snap), "summary": snap["summary"],
    }


@router.get("/life-events", summary="Life-event templates (BIRTH is fully implemented)")
async def life_events(_: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    return await c.workflows.templates()


@router.get("/life-events/{code}/graph", summary="Workflow definition graph for a life-event template")
async def template_graph(code: str, _: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return await c.workflows.template_graph(code)


@router.post("/cases", response_model=CaseOut, status_code=201, summary="Create a life-event case",
             description="Creates the persistent case. With `consent_service_initiation=true` the workflow is generated and the first "
                         "services are submitted immediately; otherwise the case waits in PENDING_CONSENT.")
async def create_case(body: CreateCaseIn, response: Response, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    consents = {}
    if body.consent_data_processing:
        consents[ConsentType.DATA_PROCESSING_CONSENT] = True
    if body.consent_callback:
        consents[ConsentType.CALLBACK_CONSENT] = True
    if body.consent_service_initiation:
        consents[ConsentType.SERVICE_INITIATION_CONSENT] = True
    data = CreateCaseInput(
        event_type=body.event_type, event_date=body.event_date, participants=body.participants, preferences=body.preferences,
        consents=consents, source=body.source, idempotency_key=body.idempotency_key,
    )
    case, created = await c.cases.create_case(user, data, actor=f"user:{user.id}", actor_type=ActorType.RESIDENT)
    await c.commit()
    if not created:
        response.status_code = 200
    return await case_out(c, case)


@router.get("/cases", summary="List cases visible to the caller")
async def list_cases(
    status: CaseStatus | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container),
) -> dict[str, Any]:
    cases, total = await c.cases.list_for_user(user, status=status, limit=limit, offset=offset)
    return {"items": [await case_out(c, x) for x in cases], "total": total, "limit": limit, "offset": offset}


@router.get("/cases/{case_id}", response_model=CaseOut, summary="Case detail (references like L-49281 are accepted)")
async def get_case(case_id: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return await case_out(c, await c.cases.resolve(case_id, user))


@router.get("/cases/{case_id}/snapshot", summary="Backend-verified facts the voice agent reads")
async def get_snapshot(case_id: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return await c.cases.snapshot(await c.cases.resolve(case_id, user))


@router.get("/cases/{case_id}/tasks", response_model=list[TaskOut], summary="Service tasks of the case")
async def case_tasks(case_id: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)):
    case = await c.cases.resolve(case_id, user)
    return await c.cases.tasks(case.id)


@router.get("/cases/{case_id}/graph", summary="Life-event dependency graph built from persisted tasks and dependencies")
async def case_graph(case_id: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return await c.workflows.case_graph(await c.cases.resolve(case_id, user))


@router.get("/cases/{case_id}/passport", summary="Zero-repetition Life Event Passport")
async def case_passport(case_id: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return await c.cases.passport(await c.cases.resolve(case_id, user))


@router.post("/cases/{case_id}/pause", response_model=CaseOut, summary="Pause the case (no new services start while paused)")
async def pause_case(case_id: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await c.cases.resolve(case_id, user)
    await c.cases.pause(case, actor=f"user:{user.id}")
    await c.commit()
    return await case_out(c, case)


@router.post("/cases/{case_id}/resume", response_model=CaseOut, summary="Resume a paused or escalated case")
async def resume_case(case_id: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await c.cases.resolve(case_id, user)
    await c.cases.resume(case, actor=f"user:{user.id}")
    await c.commit()
    return await case_out(c, case)


@router.post("/cases/{case_id}/escalate", response_model=CaseOut, summary="Hand the case to a human officer")
async def escalate_case(case_id: str, reason: str = Query("Resident asked for a human officer", max_length=500), user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await c.cases.resolve(case_id, user)
    await c.cases.escalate(case, reason=reason, actor=f"user:{user.id}")
    await c.commit()
    return await case_out(c, case)


@router.post("/cases/{case_id}/callback", response_model=CallbackOut, status_code=201, summary="Request a callback for this case")
async def request_callback(case_id: str, body: CallbackRequestIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)):
    from app.agents.tools import parse_when

    case = await c.cases.resolve(case_id, user)
    cb = await c.callbacks.schedule_for_resident(case, reason=body.reason, when=parse_when(body.when))
    await c.commit()
    return cb
