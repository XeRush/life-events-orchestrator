"""Notifications: in-app (immediate), SMS and email (queued through the outbox, sent by the notifications consumer).
Mock channels are labelled `is_mock=True` and shown as such in the UI."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from app.core.clock import utcnow
from app.core.errors import NotFound
from app.integrations.notifications.email import render_case_update, send_rendered
from app.integrations.notifications.sms import SmsError
from app.models.case import Case
from app.models.enums import NotificationChannel, NotificationStatus, Source
from app.models.notification import Notification
from app.models.user import User

if TYPE_CHECKING:
    from app.services.container import ServiceContainer


class NotificationService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def notify(self, user_id: uuid.UUID, case_id: uuid.UUID | None, channel: NotificationChannel, title: str, body: str,
                     link: str | None = None) -> Notification:
        row = Notification(user_id=user_id, case_id=case_id, channel=channel, title=title[:200], body=body, link=link)
        if channel == NotificationChannel.IN_APP:
            row.status, row.provider, row.sent_at = NotificationStatus.SENT, "IN_APP", utcnow()
        self.c.session.add(row)
        await self.c.session.flush()
        if channel != NotificationChannel.IN_APP:
            await self.c.events.emit("NotificationRequested", case_id=case_id, source=Source.SYSTEM, timeline=False,
                                     payload={"notification_id": str(row.id), "channel": channel.value})
        return row

    async def notify_officer(self, case: Case, title: str, body: str, officer: User | None = None) -> None:
        target = officer or (await self.c.users_repo.get(case.assigned_officer_id) if case.assigned_officer_id else None)
        if target is not None:
            await self.notify(target.id, case.id, NotificationChannel.IN_APP, title, body, link=f"/officer/cases/{case.reference}")

    async def deliver(self, notification_id: uuid.UUID) -> None:
        """Consumer side: send one queued SMS / email. Idempotent - a SENT row is never re-sent."""
        row = await self.c.notifications_repo.get(notification_id)
        if row is None or row.status != NotificationStatus.QUEUED:
            return
        user = await self.c.users_repo.get(row.user_id)
        if user is None:
            row.status, row.error = NotificationStatus.FAILED, "User not found"
            return
        if row.channel == NotificationChannel.SMS:
            sms = self.c.infra.sms
            try:
                result = await sms.send(user.phone, row.body)
                row.status, row.provider, row.is_mock, row.sent_at = NotificationStatus.SENT, result.provider, result.is_mock, utcnow()
            except SmsError as exc:
                row.status, row.error, row.provider = NotificationStatus.FAILED, str(exc), sms.name
        elif row.channel == NotificationChannel.EMAIL:
            case = await self.c.cases_repo.get(row.case_id) if row.case_id else None
            rendered = render_case_update(self.c.settings, user.full_name, row.title, row.body, case.reference if case else "LifeLoop", row.link)
            ok = await send_rendered(self.c.infra.email, user.email, rendered)
            row.provider, row.is_mock = self.c.infra.email.name.upper(), self.c.infra.email.name == "console"
            row.status = NotificationStatus.SENT if ok else NotificationStatus.FAILED
            row.sent_at = utcnow() if ok else None

    async def mark_read(self, user: User, notification_id: uuid.UUID) -> Notification:
        row = await self.c.notifications_repo.get(notification_id)
        if row is None or row.user_id != user.id:
            raise NotFound("Notification not found")
        row.read_at = row.read_at or utcnow()
        if row.channel == NotificationChannel.IN_APP:
            row.status = NotificationStatus.READ
        return row

    @staticmethod
    def view(n: Notification) -> dict[str, Any]:
        return {"id": str(n.id), "case_id": str(n.case_id) if n.case_id else None, "channel": n.channel.value, "title": n.title,
                "body": n.body, "link": n.link, "status": n.status.value, "provider": n.provider, "is_mock": n.is_mock,
                "created_at": n.created_at.isoformat(), "sent_at": n.sent_at.isoformat() if n.sent_at else None,
                "read_at": n.read_at.isoformat() if n.read_at else None}
