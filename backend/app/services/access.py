"""Case-level authorisation: role + organisation + ownership. Every case read or write goes through here."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from app.core.errors import Forbidden, NotFound
from app.events.recorder import Actor
from app.models.case import Case
from app.models.enums import UserRole
from app.models.user import User

if TYPE_CHECKING:
    from app.services.container import ServiceContainer


class AccessPolicy:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    def can_view(self, user: User, case: Case) -> bool:
        if user.role == UserRole.ADMIN:
            return True
        if user.role == UserRole.RESIDENT:
            return case.resident_id == user.id
        return case.assigned_officer_id == user.id or (user.organization_id is not None and case.organization_id == user.organization_id)

    def can_officiate(self, user: User, case: Case) -> bool:
        """Approve, reject, request documents, escalate, transfer. Never residents, never the agent."""
        return user.role in (UserRole.OFFICER, UserRole.ADMIN) and self.can_view(user, case)

    async def case_for(self, user: User, ref_or_id: str) -> Case:
        case = None
        try:
            case = await self.c.cases_repo.get(uuid.UUID(str(ref_or_id)))
        except ValueError:
            case = await self.c.cases_repo.by_reference(str(ref_or_id))
        if case is None:
            raise NotFound("Case not found")
        if not self.can_view(user, case):
            await self.c.events.audit_detached("CaseAccessDenied", actor=Actor.user(user), case_id=case.id)
            raise NotFound("Case not found")  # do not reveal that the case exists
        return case

    async def officiate(self, user: User, case: Case, action: str) -> None:
        if not self.can_officiate(user, case):
            await self.c.events.audit_detached(f"{action}Denied", actor=Actor.user(user), case_id=case.id,
                                               details={"role": user.role.value})
            raise Forbidden("Only an officer of the case's service centre can do this.", code="officer_required")
