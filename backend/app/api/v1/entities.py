"""Authority catalogue and requests (DEMO / MOCK INTEGRATION)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.deps import STAFF, get_container, get_current_user, require_roles
from app.core.errors import NotFound
from app.models.case import Case
from app.models.entity import EntityRequest
from app.models.enums import Entity, UserRole
from app.models.user import User
from app.services.container import ServiceContainer
from app.workflows.birth_expat import ENTITY_LABELS

router = APIRouter(prefix="/entities", tags=["entities"])


@router.get("", summary="Authorities LifeLoop coordinates, with their (mock) integration contracts")
async def catalogue(_: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    registry = c.infra.adapters
    out = []
    for name, adapter in registry.all.items():
        req = await adapter.get_requirements()
        out.append({"adapter": name, "entity": adapter.entity.value, "label": ENTITY_LABELS[adapter.entity], "service": adapter.service,
                    "request_type": adapter.request_type, "is_mock": True, "has_api": req.has_api, "has_status_feed": req.has_status_feed,
                    "required_fields": req.required_fields, "required_documents": req.required_documents, "sla": req.sla,
                    "published_fee": req.published_fee, "fee_source": req.fee_source, "notes": req.notes,
                    "failure_mode": registry.failures.get(adapter.entity.value) or registry.failures.get("*")})
    return {"label": "DEMO / MOCK INTEGRATION - no real UAE government system is connected", "entities": out}


@router.get("/{entity}/requests", summary="Requests filed with one authority (staff)")
async def entity_requests(entity: str, limit: int = Query(50, ge=1, le=200), user: User = Depends(require_roles(*STAFF)),
                          c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    try:
        ent = Entity(entity.upper())
    except ValueError as exc:
        raise NotFound("Unknown entity") from exc
    query = select(EntityRequest, Case.reference).join(Case, Case.id == EntityRequest.case_id).where(EntityRequest.entity == ent)
    if user.role != UserRole.ADMIN:
        query = query.where(Case.organization_id == user.organization_id)
    rows = (await c.session.execute(query.order_by(EntityRequest.created_at.desc()).limit(limit))).all()
    return [{"id": str(r.id), "case_reference": ref, "request_type": r.request_type, "state": r.state, "external_ref": r.external_ref,
             "fields_sent": r.fields_sent, "released_at": r.released_at.isoformat() if r.released_at else None,
             "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None, "attempts": r.attempts, "error": r.error, "is_mock": True}
            for r, ref in rows]
