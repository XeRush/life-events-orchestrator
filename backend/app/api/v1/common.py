"""Shared helpers for routers (serialisation, pagination)."""
from __future__ import annotations

from typing import Any

from app.models.user import User
from app.services.container import ServiceContainer


async def user_out(c: ServiceContainer, user: User) -> dict[str, Any]:
    org = await c.orgs_repo.get(user.organization_id) if user.organization_id else None
    return {
        "id": str(user.id), "email": user.email, "full_name": user.full_name, "title": user.title, "role": user.role.value,
        "organization_id": str(user.organization_id) if user.organization_id else None, "organization_name": org.name if org else None,
        "phone": user.phone, "preferred_language": user.preferred_language, "is_active": user.is_active,
        "email_verified": user.email_verified, "invitation_pending": user.hashed_password is None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None, "created_at": user.created_at.isoformat(),
    }


def page(items: list[Any], total: int, limit: int, offset: int) -> dict[str, Any]:
    return {"items": items, "total": total, "limit": limit, "offset": offset}
