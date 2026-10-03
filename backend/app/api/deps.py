"""FastAPI dependencies: DI container, authentication, RBAC, rate limiting, tool authentication."""
from __future__ import annotations

import hashlib
import uuid
from collections.abc import AsyncIterator, Callable

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Forbidden, RateLimited, Unauthorized
from app.core.security import constant_time_equals, decode_token
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import RevokedToken, User
from app.observability.logging import bind_context
from app.services.container import ServiceContainer
from app.services.infra import get_infra

bearer = HTTPBearer(auto_error=False, description="JWT access token from POST /api/v1/auth/login")
STAFF = (UserRole.OFFICER, UserRole.ADMIN)


def _ip_hash(request: Request) -> str | None:
    host = request.client.host if request.client else None
    return hashlib.sha256(host.encode()).hexdigest()[:16] if host else None


async def get_container(request: Request, session: AsyncSession = Depends(get_db)) -> AsyncIterator[ServiceContainer]:
    yield ServiceContainer(session, infra=get_infra(), request_id=getattr(request.state, "request_id", None), ip_hash=_ip_hash(request))


async def user_from_token(c: ServiceContainer, token: str) -> tuple[User, dict]:
    payload = decode_token(c.settings, token, "access")
    if await c.session.scalar(select(RevokedToken.id).where(RevokedToken.jti == payload["jti"])):
        raise Unauthorized("Session has ended. Please sign in again.")
    user = await c.session.get(User, uuid.UUID(payload["sub"]))
    if not user or not user.is_active:
        raise Unauthorized("Account not found or deactivated.")
    if user.password_changed_at and payload["iat"] < int(user.password_changed_at.timestamp()):
        raise Unauthorized("Password changed. Please sign in again.")
    bind_context(user_id=str(user.id), role=user.role.value)
    return user, payload


async def current_session(credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
                          c: ServiceContainer = Depends(get_container)) -> tuple[User, dict]:
    if not credentials:
        raise Unauthorized("Authentication required")
    return await user_from_token(c, credentials.credentials)


async def get_current_user(session: tuple[User, dict] = Depends(current_session)) -> User:
    return session[0]


def require_roles(*roles: UserRole) -> Callable[..., User]:
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise Forbidden(f"This action requires one of the roles: {', '.join(r.value for r in roles)}", code="role_required")
        return user

    return checker


def rate_limit(kind: str = "default") -> Callable[..., object]:
    async def checker(request: Request) -> None:
        infra = get_infra()
        cap = infra.settings.auth_rate_limit_per_minute if kind == "auth" else infra.settings.rate_limit_per_minute
        if not await infra.cache.allow(f"{kind}:{_ip_hash(request)}", cap):
            raise RateLimited("Too many requests. Please wait a moment and try again.")

    return checker


async def require_tool_secret(x_lifeloop_tool_secret: str | None = Header(default=None)) -> None:
    """ElevenLabs server tools authenticate with a shared secret configured in the tool's request headers."""
    if not constant_time_equals(x_lifeloop_tool_secret, get_infra().settings.voice_tool_secret):
        raise Unauthorized("Invalid tool credentials", code="invalid_tool_secret")
