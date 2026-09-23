"""FastAPI dependencies: DI container, authentication, RBAC, rate limiting."""
import uuid
from collections.abc import AsyncIterator, Callable

from fastapi import Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.errors import Forbidden, RateLimited, Unauthorized
from app.core.security import decode_token, rate_limiter
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.user import RevokedToken, User
from app.services.container import ServiceContainer

bearer = HTTPBearer(auto_error=False, description="JWT access token from POST /api/v1/auth/login")
STAFF = (UserRole.ADMIN, UserRole.OPERATOR)
ENTITY_SIDE = (UserRole.ADMIN, UserRole.OPERATOR, UserRole.GOVERNMENT_ENTITY)


async def get_container(session: AsyncSession = Depends(get_db)) -> AsyncIterator[ServiceContainer]:
    yield ServiceContainer(session, settings=get_settings())


async def user_from_token(c: ServiceContainer, token: str) -> User:
    payload = decode_token(c.settings, token, "access")
    if await c.session.scalar(select(RevokedToken.id).where(RevokedToken.jti == payload["jti"])):
        raise Unauthorized("Token has been revoked")
    user = await c.session.get(User, uuid.UUID(payload["sub"]))
    if not user or not user.is_active:
        raise Unauthorized("User not found or inactive")
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer), c: ServiceContainer = Depends(get_container)
) -> User:
    if not credentials:
        raise Unauthorized("Authentication required")
    return await user_from_token(c, credentials.credentials)


def require_roles(*roles: UserRole) -> Callable[..., User]:
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise Forbidden(f"This action requires one of the roles: {', '.join(r.value for r in roles)}")
        return user

    return checker


def limit(kind: str = "default") -> Callable[..., None]:
    def checker(request: Request, settings: Settings = Depends(get_settings)) -> None:
        cap = settings.auth_rate_limit_per_minute if kind == "auth" else settings.rate_limit_per_minute
        client = request.client.host if request.client else "unknown"
        if not rate_limiter.allow(f"{kind}:{client}", cap):
            raise RateLimited("Too many requests. Please slow down.")

    return checker


async def require_tool_secret(
    x_lifeloop_tool_secret: str | None = Header(default=None), settings: Settings = Depends(get_settings)
) -> None:
    """Voice-agent tool calls authenticate with a shared secret configured in the ElevenLabs tool headers."""
    import hmac

    if not x_lifeloop_tool_secret or not hmac.compare_digest(x_lifeloop_tool_secret, settings.voice_tool_secret):
        raise Unauthorized("Invalid tool secret")
