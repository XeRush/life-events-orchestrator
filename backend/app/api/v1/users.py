"""Account provisioning and organisations (admin), plus the officer directory (staff)."""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.api.deps import STAFF, get_container, require_roles
from app.api.v1.common import page, user_out
from app.models.enums import OrganizationKind, UserRole
from app.models.user import User
from app.schemas.auth import OrganizationIn, ProvisionIn, UserUpdateIn
from app.services.container import ServiceContainer

router = APIRouter(tags=["users"])
ADMIN = require_roles(UserRole.ADMIN)


@router.get("/users", summary="List accounts (admin)")
async def list_users(role: UserRole | None = None, q: str | None = Query(default=None, max_length=80), organization_id: uuid.UUID | None = None,
                     limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), _: User = Depends(ADMIN),
                     c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    items, total = await c.users_repo.page(c.users_repo.search(role=role, organization_id=organization_id, q=q), limit=limit, offset=offset)
    return page([await user_out(c, u) for u in items], total, limit, offset)


@router.post("/users", status_code=201, summary="Provision an account and email an invitation (admin)")
async def provision(body: ProvisionIn, admin: User = Depends(ADMIN), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    user = await c.users.provision(admin, email=body.email, full_name=body.full_name, role=UserRole(body.role),
                                   organization_id=uuid.UUID(body.organization_id) if body.organization_id else None, title=body.title,
                                   phone=body.phone, language=body.preferred_language)
    await c.commit()
    return await user_out(c, user)


@router.patch("/users/{user_id}", summary="Change role, organisation, title or active state (admin)")
async def update_user(user_id: uuid.UUID, body: UserUpdateIn, admin: User = Depends(ADMIN), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    user = await c.users.update(admin, user_id, role=UserRole(body.role) if body.role else None, is_active=body.is_active, title=body.title,
                                full_name=body.full_name, organization_id=uuid.UUID(body.organization_id) if body.organization_id else None)
    await c.commit()
    return await user_out(c, user)


@router.post("/users/{user_id}/invitation", summary="Resend an invitation (admin)")
async def resend_invitation(user_id: uuid.UUID, admin: User = Depends(ADMIN), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    user = await c.users_repo.get(user_id)
    if user is None:
        from app.core.errors import NotFound

        raise NotFound("User not found")
    await c.users.send_invitation(admin, user)
    await c.commit()
    return {"sent": True}


@router.get("/officers", summary="Active officers (for transfers)")
async def officers(user: User = Depends(require_roles(*STAFF)), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    return [await user_out(c, o) for o in await c.users_repo.officers(None)]


@router.get("/organizations", summary="Organisations")
async def organizations(_: User = Depends(require_roles(*STAFF)), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    return [{"id": str(o.id), "code": o.code, "name": o.name, "kind": o.kind.value, "emirate": o.emirate, "is_active": o.is_active}
            for o in await c.orgs_repo.all()]


@router.post("/organizations", status_code=201, summary="Create an organisation (admin)")
async def create_org(body: OrganizationIn, admin: User = Depends(ADMIN), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    org = await c.users.create_organization(admin, code=body.code, name=body.name, emirate=body.emirate, kind=OrganizationKind(body.kind))
    await c.commit()
    return {"id": str(org.id), "code": org.code, "name": org.name, "kind": org.kind.value, "emirate": org.emirate}
