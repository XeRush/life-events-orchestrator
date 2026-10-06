"""Notifications, knowledge base, and the development mailbox."""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import update

from app.api.deps import get_container, get_current_user
from app.core.clock import utcnow
from app.core.errors import NotFound
from app.models.enums import NotificationStatus
from app.models.notification import Notification
from app.models.user import User
from app.services.container import ServiceContainer
from app.services.notification_service import NotificationService

router = APIRouter(tags=["notifications", "knowledge"])


@router.get("/notifications", summary="My notifications (in-app, SMS, email; mock channels labelled)")
async def notifications(unread: bool = False, limit: int = Query(30, ge=1, le=100), user: User = Depends(get_current_user),
                        c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    items, total = await c.notifications_repo.page(c.notifications_repo.for_user(user.id, unread), limit=limit)
    unread_count = await c.notifications_repo.count(c.notifications_repo.for_user(user.id, True))
    return {"items": [NotificationService.view(n) for n in items], "total": total, "unread": unread_count}


@router.post("/notifications/{notification_id}/read", summary="Mark one notification read")
async def read(notification_id: uuid.UUID, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    n = await c.notifications.mark_read(user, notification_id)
    await c.commit()
    return NotificationService.view(n)


@router.post("/notifications/read-all", summary="Mark all notifications read")
async def read_all(user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    await c.session.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
                            .values(read_at=utcnow(), status=NotificationStatus.READ))
    await c.commit()
    return {"ok": True}


@router.get("/knowledge", summary="Read-only knowledge base (the agent's RAG source)")
async def knowledge(_: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    return await c.knowledge.documents()


@router.get("/knowledge/search", summary="Search the knowledge base")
async def knowledge_search(q: str = Query(min_length=2, max_length=200), _: User = Depends(get_current_user),
                           c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return {"documents": await c.knowledge.search(q), "fee": await c.knowledge.fee_for(q)}


@router.get("/dev/mailbox", summary="Development only: emails captured by the console transport", include_in_schema=False)
async def dev_mailbox(email: str = Query(min_length=3, max_length=255), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    backend = c.infra.email
    if not c.settings.is_development or backend.name != "console":
        raise NotFound("Not found")
    target = email.strip().lower()
    return [m for m in getattr(backend, "mailbox", []) if m["to"].lower() == target][:10]
