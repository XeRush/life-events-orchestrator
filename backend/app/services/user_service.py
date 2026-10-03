"""Account provisioning (admins create officer/admin accounts by invitation) and profile management."""
from __future__ import annotations

import uuid
from datetime import timedelta
from typing import TYPE_CHECKING

from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.i18n import normalise_lang
from app.events.recorder import Actor
from app.integrations.notifications.email import render_invitation, send_rendered
from app.models.enums import AuthTokenPurpose, OrganizationKind, UserRole
from app.models.organization import Organization
from app.models.user import User

if TYPE_CHECKING:
    from app.services.container import ServiceContainer


class UserService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def provision(self, admin: User, *, email: str, full_name: str, role: UserRole, organization_id: uuid.UUID | None,
                        title: str | None, phone: str | None = None, language: str | None = None) -> User:
        email = email.strip().lower()
        if await self.c.users_repo.by_email(email):
            raise Conflict("An account with this email already exists.", code="email_taken")
        org = await self._org(organization_id) if organization_id else None
        if role == UserRole.OFFICER and org is None:
            raise ValidationFailed("Officers must belong to a service centre.", code="organization_required")
        user = User(email=email, full_name=full_name.strip(), role=role, organization_id=org.id if org else None, title=title,
                    phone=phone, preferred_language=normalise_lang(language), hashed_password=None, is_active=True,
                    invited_by_id=admin.id)
        self.c.session.add(user)
        await self.c.session.flush()
        await self.c.events.audit("UserProvisioned", actor=Actor.user(admin),
                                  details={"user_id": str(user.id), "role": role.value, "organization": org.code if org else None})
        await self.send_invitation(admin, user, org)
        return user

    async def send_invitation(self, admin: User, user: User, org: Organization | None = None) -> None:
        if user.hashed_password:
            raise Conflict("This account is already active.", code="already_active")
        org = org or (await self._org(user.organization_id) if user.organization_id else None)
        raw = await self.c.auth._new_email_token(user, AuthTokenPurpose.INVITATION,
                                                 timedelta(hours=self.c.settings.invitation_ttl_hours), created_by=admin)
        settings, backend = self.c.settings, self.c.infra.email
        org_name = org.name if org else "LifeLoop platform"
        self.c.infra.spawn(lambda: send_rendered(backend, user.email, render_invitation(
            settings, user.full_name, raw, user.role.value, org_name, admin.full_name)), name="email:invite")

    async def update(self, admin: User, user_id: uuid.UUID, **changes: object) -> User:
        user = await self.c.users_repo.get(user_id)
        if user is None:
            raise NotFound("User not found")
        if user.id == admin.id and (changes.get("role") not in (None, UserRole.ADMIN) or changes.get("is_active") is False):
            raise Forbidden("You cannot remove your own administrator access.", code="self_demotion")
        applied = {}
        for field in ("role", "is_active", "title", "full_name", "phone"):
            value = changes.get(field)
            if value is not None and getattr(user, field) != value:
                setattr(user, field, value)
                applied[field] = value.value if hasattr(value, "value") else value
        if "organization_id" in changes and changes["organization_id"] is not None:
            org = await self._org(changes["organization_id"])  # type: ignore[arg-type]
            user.organization_id = org.id
            applied["organization"] = org.code
        if user.role == UserRole.OFFICER and user.organization_id is None:
            raise ValidationFailed("Officers must belong to a service centre.", code="organization_required")
        await self.c.events.audit("UserUpdated", actor=Actor.user(admin), details={"user_id": str(user.id), **applied})
        return user

    async def update_profile(self, user: User, *, full_name: str | None, phone: str | None, language: str | None) -> User:
        if full_name:
            user.full_name = full_name.strip()
        if phone is not None:
            user.phone = phone or None
        if language:
            user.preferred_language = normalise_lang(language)
        return user

    async def _org(self, organization_id: uuid.UUID) -> Organization:
        org = await self.c.orgs_repo.get(organization_id)
        if org is None:
            raise NotFound("Organisation not found")
        return org

    async def create_organization(self, admin: User, *, code: str, name: str, emirate: str, kind: OrganizationKind) -> Organization:
        if await self.c.orgs_repo.by_code(code.upper()):
            raise Conflict("An organisation with this code already exists.")
        org = Organization(code=code.upper(), name=name, emirate=emirate.upper(), kind=kind)
        self.c.session.add(org)
        await self.c.session.flush()
        await self.c.events.audit("OrganizationCreated", actor=Actor.user(admin), details={"code": org.code})
        return org
