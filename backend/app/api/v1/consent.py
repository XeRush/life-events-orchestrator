from fastapi import APIRouter, Depends

from app.api.deps import get_container, get_current_user
from app.models.enums import ActorType
from app.models.user import User
from app.schemas.cases import ConsentIn, ConsentOut
from app.services.container import ServiceContainer

router = APIRouter(tags=["consent"])


@router.post("/cases/{case_id}/consent", response_model=ConsentOut, status_code=201,
             summary="Record a consent decision",
             description="Granting SERVICE_INITIATION_CONSENT on a PENDING_CONSENT case generates the workflow and starts the first services.")
async def record_consent(case_id: str, body: ConsentIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)):
    case = await c.cases.resolve(case_id, user)
    consent = await c.consents.record(case, body.consent_type, body.granted, source=body.source, scope=body.scope,
                                      actor=f"user:{user.id}", actor_type=ActorType.RESIDENT)
    await c.commit()
    return consent


@router.get("/cases/{case_id}/consents", response_model=list[ConsentOut], summary="Consent history for the case")
async def list_consents(case_id: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)):
    case = await c.cases.resolve(case_id, user)
    return await c.consents.list_for_case(case.id)
