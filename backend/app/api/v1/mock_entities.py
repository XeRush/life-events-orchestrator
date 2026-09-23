"""Mock government-entity APIs. In production these would be the authorities' own systems.

Every simulate-* endpoint changes the authority's state in its own store and then delivers the resulting webhook
to LIFELOOP through the normal `ingest_entity_event` path, which emits the same domain events a real integration would.
"""
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import ENTITY_SIDE, STAFF, get_container, require_roles
from app.core.errors import NotFound, ValidationFailed
from app.integrations.government.base import AdapterError, ApplicationNotFound, SubmissionRequest
from app.models.service_task import ServiceTask
from app.models.user import User
from app.schemas.tasks import SimulationIn, SubmitApplicationIn
from app.services.container import ServiceContainer
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/mock/entities", tags=["mock-entities"])
ops_router = APIRouter(tags=["entities"])


def _adapter(c: ServiceContainer, slug: str):
    adapter = c.adapters.by_slug(slug)
    if not adapter:
        raise NotFound(f"Unknown entity '{slug}'. Valid: {', '.join(a.slug for a in c.adapters.all())}")
    return adapter


async def _task_for(c: ServiceContainer, adapter, body: SimulationIn) -> ServiceTask:
    if body.application_id:
        task = await c.session.scalar(select(ServiceTask).where(ServiceTask.external_ref == body.application_id))
    elif body.case_id and body.service_code:
        case = await c.cases.resolve(body.case_id)
        task = await c.session.scalar(select(ServiceTask).where(
            ServiceTask.case_id == case.id, ServiceTask.service_code == body.service_code.upper(), ServiceTask.external_ref.is_not(None)
        ).order_by(ServiceTask.created_at.desc()))
    else:
        raise ValidationFailed("Provide application_id, or case_id together with service_code")
    if not task:
        raise NotFound("No submitted LIFELOOP task matches this application")
    entity = await c.orchestration.entity_of(task)
    if not entity or entity.code != adapter.entity_code:
        raise ValidationFailed(f"That application does not belong to {adapter.name}")
    return task


async def _simulate(c: ServiceContainer, slug: str, body: SimulationIn, op: str, **params: Any) -> dict[str, Any]:
    adapter = _adapter(c, slug)
    task = await _task_for(c, adapter, body)
    result = await c.demo.simulate(task, op, **params)
    await c.commit()
    return {"entity": adapter.name, "application_id": task.external_ref, "operation": op, "applied": result.applied,
            "duplicate": result.duplicate, "event_type": result.event_type, "message": result.message}


@router.get("", summary="List mock authorities and their service catalogs")
async def list_entities(_: User = Depends(require_roles(*ENTITY_SIDE)), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    return [{"code": a.entity_code, "slug": a.slug, "name": a.name, "description": a.description, "catalog": [asdict(s) for s in a.catalog]} for a in c.adapters.all()]


@router.post("/{slug}/applications", status_code=201, summary="Entity intake: submit an application (idempotent on idempotency_key)")
async def submit_application(slug: str, body: SubmitApplicationIn, _: User = Depends(require_roles(*ENTITY_SIDE)), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    adapter = _adapter(c, slug)
    try:
        result = await adapter.submit(c.session, SubmissionRequest(
            idempotency_key=body.idempotency_key, case_reference=body.case_reference, service_code=body.service_code.upper(), applicant=body.applicant))
    except AdapterError as exc:
        raise ValidationFailed(str(exc), code="submission_rejected") from exc
    await c.commit()
    return {"reference": result.reference, "status": result.status, "duplicate": result.duplicate}


@router.get("/{slug}/applications/{reference}", summary="Entity status API: current state of an application")
async def get_application(slug: str, reference: str, _: User = Depends(require_roles(*ENTITY_SIDE)), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    try:
        status = await _adapter(c, slug).get_status(c.session, reference)
    except ApplicationNotFound as exc:
        raise NotFound(str(exc)) from exc
    return asdict(status)


@router.post("/{slug}/simulate-start", summary="Authority accepts the application for processing")
async def simulate_start(slug: str, body: SimulationIn, _: User = Depends(require_roles(*ENTITY_SIDE)), c: ServiceContainer = Depends(get_container)):
    return await _simulate(c, slug, body, "acknowledge")


@router.post("/{slug}/simulate-complete", summary="Authority approves / completes the application")
async def simulate_complete(slug: str, body: SimulationIn, _: User = Depends(require_roles(*ENTITY_SIDE)), c: ServiceContainer = Depends(get_container)):
    return await _simulate(c, slug, body, "complete")


@router.post("/{slug}/simulate-delay", summary="Authority reports a processing delay")
async def simulate_delay(slug: str, body: SimulationIn, _: User = Depends(require_roles(*ENTITY_SIDE)), c: ServiceContainer = Depends(get_container)):
    return await _simulate(c, slug, body, "delay", hours=body.hours, reason=body.reason or "Queue backlog")


@router.post("/{slug}/simulate-rejection", summary="Authority rejects the application")
async def simulate_rejection(slug: str, body: SimulationIn, _: User = Depends(require_roles(*ENTITY_SIDE)), c: ServiceContainer = Depends(get_container)):
    return await _simulate(c, slug, body, "reject", reason=body.reason or "Rejected by authority", retryable=body.retryable)


@router.post("/{slug}/simulate-document-required", summary="Authority asks for an additional document")
async def simulate_document_required(slug: str, body: SimulationIn, _: User = Depends(require_roles(*ENTITY_SIDE)), c: ServiceContainer = Depends(get_container)):
    return await _simulate(c, slug, body, "require_documents", documents=body.documents)


@ops_router.get("/entities", summary="Entity operations: incoming / processing / completed / delayed / rejected + avg processing time")
async def entity_operations(_: User = Depends(require_roles(*STAFF)), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    return await DashboardService(c).entity_stats()
