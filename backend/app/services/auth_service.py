"""Authentication: registration, login (with lockout), token rotation, logout, email verification, password reset,
invitation acceptance and password change."""
from __future__ import annotations

import uuid
from datetime import timedelta
from functools import lru_cache
from typing import TYPE_CHECKING, Any

from sqlalchemy import select

from app.core.clock import utcnow
from app.core.errors import AccountLocked, Conflict, Unauthorized, ValidationFailed
from app.core.i18n import normalise_lang
from app.core.security import (
    create_token,
    decode_token,
    hash_password,
    new_opaque_token,
    sha256_hex,
    validate_password_strength,
    verify_password,
)
from app.events.recorder import Actor
from app.integrations.notifications.email import render_password_reset, render_verify_email, send_rendered
from app.models.enums import AuthTokenPurpose, Source, UserRole
from app.models.user import AuthToken, RevokedToken, User

if TYPE_CHECKING:
    from app.services.container import ServiceContainer


@lru_cache
def _dummy_hash(rounds: int) -> str:
    return hash_password("lifeloop-timing-equaliser", rounds)


class AuthService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c
        self.s = c.settings

    # --- tokens ------------------------------------------------------------------------------------------
    def issue_tokens(self, user: User) -> dict[str, Any]:
        org = str(user.organization_id) if user.organization_id else None
        access, _, access_exp = create_token(self.s, subject=str(user.id), token_type="access", role=user.role.value,
                                             ttl=timedelta(minutes=self.s.access_token_minutes), org=org)
        refresh, _, _ = create_token(self.s, subject=str(user.id), token_type="refresh", role=user.role.value,
                                     ttl=timedelta(days=self.s.refresh_token_days), org=org)
        return {"access_token": access, "refresh_token": refresh, "token_type": "bearer",
                "expires_in": self.s.access_token_minutes * 60, "expires_at": access_exp.isoformat()}

    async def _revoke(self, payload: dict[str, Any]) -> None:
        if not await self.c.session.scalar(select(RevokedToken.id).where(RevokedToken.jti == payload["jti"])):
            self.c.session.add(RevokedToken(jti=payload["jti"], user_id=None, expires_at=utcnow() + timedelta(days=self.s.refresh_token_days)))

    async def _new_email_token(self, user: User, purpose: AuthTokenPurpose, ttl: timedelta, created_by: User | None = None) -> str:
        for old in (await self.c.session.scalars(select(AuthToken).where(
                AuthToken.user_id == user.id, AuthToken.purpose == purpose, AuthToken.used_at.is_(None)))).all():
            old.used_at = utcnow()  # only the newest link works
        raw, digest = new_opaque_token()
        self.c.session.add(AuthToken(user_id=user.id, purpose=purpose, token_hash=digest, expires_at=utcnow() + ttl,
                                     created_by_id=created_by.id if created_by else None))
        return raw

    async def _consume_email_token(self, raw: str, purpose: AuthTokenPurpose) -> User:
        token = await self.c.tokens_repo.by_hash(sha256_hex(raw or ""))
        if token is None or token.purpose != purpose or token.used_at is not None or token.expires_at < utcnow():
            raise ValidationFailed("This link is invalid or has expired. Request a new one.", code="invalid_token")
        token.used_at = utcnow()
        user = await self.c.users_repo.get(token.user_id)
        if user is None:
            raise ValidationFailed("This link is invalid or has expired.", code="invalid_token")
        return user

    def _send_later(self, to: str, rendered_factory: Any, name: str) -> None:
        backend = self.c.infra.email
        self.c.infra.spawn(lambda: send_rendered(backend, to, rendered_factory()), name=name)

    # --- flows ---------------------------------------------------------------------------------------------
    async def register(self, *, email: str, password: str, full_name: str, phone: str | None, language: str | None) -> User:
        email = email.strip().lower()
        validate_password_strength(password)
        if await self.c.users_repo.by_email(email):
            raise Conflict("An account with this email already exists. Sign in or reset your password.", code="email_taken")
        user = User(email=email, hashed_password=hash_password(password, self.s.bcrypt_rounds), full_name=full_name.strip(),
                    role=UserRole.RESIDENT, phone=phone, preferred_language=normalise_lang(language), password_changed_at=utcnow())
        self.c.session.add(user)
        await self.c.session.flush()
        await self.c.events.audit("UserRegistered", actor=Actor.user(user), source=Source.RESIDENT)
        await self.send_verification(user)
        return user

    async def send_verification(self, user: User) -> None:
        if user.email_verified:
            return
        raw = await self._new_email_token(user, AuthTokenPurpose.EMAIL_VERIFICATION, timedelta(hours=self.s.email_verification_ttl_hours))
        self._send_later(user.email, lambda: render_verify_email(self.s, user.full_name, raw), "email:verify")

    async def verify_email(self, raw: str) -> User:
        user = await self._consume_email_token(raw, AuthTokenPurpose.EMAIL_VERIFICATION)
        user.email_verified_at = user.email_verified_at or utcnow()
        await self.c.events.audit("EmailVerified", actor=Actor.user(user))
        return user

    async def login(self, email: str, password: str) -> tuple[User, dict[str, Any]]:
        user = await self.c.users_repo.by_email(email)
        generic = Unauthorized("Email or password is incorrect.", code="invalid_credentials")
        if user is None:
            verify_password(password, _dummy_hash(self.s.bcrypt_rounds))  # equalise timing: no account enumeration
            raise generic
        if user.locked_until and user.locked_until > utcnow():
            raise AccountLocked("Too many failed attempts. Try again in a few minutes or reset your password.")
        if not user.is_active or not verify_password(password, user.hashed_password):
            user.failed_login_count += 1
            if user.failed_login_count >= self.s.max_failed_logins:
                user.locked_until = utcnow() + timedelta(minutes=self.s.lockout_minutes)
                user.failed_login_count = 0
                await self.c.events.audit("AccountLocked", actor=Actor.user(user), result="DENIED")
            await self.c.events.audit("LoginFailed", actor=Actor.user(user), result="DENIED")
            await self.c.commit()
            raise generic
        user.failed_login_count = 0
        user.locked_until = None
        user.last_login_at = utcnow()
        await self.c.events.audit("LoginSucceeded", actor=Actor.user(user))
        return user, self.issue_tokens(user)

    async def refresh(self, refresh_token: str) -> tuple[User, dict[str, Any]]:
        payload = decode_token(self.s, refresh_token, "refresh")
        if await self.c.session.scalar(select(RevokedToken.id).where(RevokedToken.jti == payload["jti"])):
            raise Unauthorized("Session has ended. Please sign in again.")
        user = await self.c.users_repo.get(uuid.UUID(payload["sub"]))
        if user is None or not user.is_active:
            raise Unauthorized("Session has ended. Please sign in again.")
        if user.password_changed_at and payload["iat"] < int(user.password_changed_at.timestamp()):
            raise Unauthorized("Password changed. Please sign in again.")
        await self._revoke(payload)  # rotation: a refresh token works once
        return user, self.issue_tokens(user)

    async def logout(self, access_payload: dict[str, Any], refresh_token: str | None) -> None:
        await self._revoke(access_payload)
        if refresh_token:
            try:
                await self._revoke(decode_token(self.s, refresh_token, "refresh"))
            except Unauthorized:
                pass

    async def forgot_password(self, email: str) -> None:
        """Always succeeds from the caller's point of view (no account enumeration)."""
        user = await self.c.users_repo.by_email(email)
        if user is None or not user.is_active:
            return
        raw = await self._new_email_token(user, AuthTokenPurpose.PASSWORD_RESET, timedelta(minutes=self.s.password_reset_ttl_minutes))
        await self.c.events.audit("PasswordResetRequested", actor=Actor.user(user))
        self._send_later(user.email, lambda: render_password_reset(self.s, user.full_name, raw), "email:reset")

    async def reset_password(self, raw: str, new_password: str) -> User:
        validate_password_strength(new_password)
        user = await self._consume_email_token(raw, AuthTokenPurpose.PASSWORD_RESET)
        self._set_password(user, new_password)
        user.email_verified_at = user.email_verified_at or utcnow()  # they proved control of the mailbox
        await self.c.events.audit("PasswordReset", actor=Actor.user(user))
        return user

    async def accept_invitation(self, raw: str, password: str, full_name: str | None) -> User:
        validate_password_strength(password)
        user = await self._consume_email_token(raw, AuthTokenPurpose.INVITATION)
        self._set_password(user, password)
        if full_name:
            user.full_name = full_name.strip()
        user.email_verified_at = user.email_verified_at or utcnow()
        user.is_active = True
        await self.c.events.audit("InvitationAccepted", actor=Actor.user(user))
        return user

    async def change_password(self, user: User, current: str, new: str) -> None:
        if not verify_password(current, user.hashed_password):
            raise ValidationFailed("Current password is incorrect.", code="invalid_credentials")
        validate_password_strength(new)
        self._set_password(user, new)
        await self.c.events.audit("PasswordChanged", actor=Actor.user(user))

    def _set_password(self, user: User, password: str) -> None:
        user.hashed_password = hash_password(password, self.s.bcrypt_rounds)
        user.password_changed_at = utcnow()
        user.failed_login_count = 0
        user.locked_until = None
