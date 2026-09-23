from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import bearer, get_container, get_current_user, limit
from app.core.errors import Conflict, Unauthorized
from app.core.security import create_token, decode_token, hash_password, verify_password
from app.models.enums import UserRole
from app.models.user import RevokedToken, User
from app.schemas.auth import LoginIn, LogoutIn, RefreshIn, RegisterIn, TokenOut, UserOut, UserUpdate
from app.services.container import ServiceContainer

router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(limit("auth"))])


def issue_tokens(c: ServiceContainer, user: User) -> TokenOut:
    s = c.settings
    access, _, _ = create_token(s, subject=str(user.id), token_type="access", role=user.role.value, ttl=timedelta(minutes=s.access_token_minutes))
    refresh, _, _ = create_token(s, subject=str(user.id), token_type="refresh", role=user.role.value, ttl=timedelta(days=s.refresh_token_days))
    return TokenOut(access_token=access, refresh_token=refresh, expires_in=s.access_token_minutes * 60)


@router.post("/register", response_model=TokenOut, status_code=201, summary="Register a resident account")
async def register(body: RegisterIn, c: ServiceContainer = Depends(get_container)) -> TokenOut:
    if await c.session.scalar(select(User.id).where(User.email == body.email)):
        raise Conflict("An account with this email already exists", code="email_taken")
    user = User(
        email=body.email, hashed_password=hash_password(body.password, c.settings.bcrypt_rounds), full_name=body.full_name,
        phone=body.phone, preferred_language=body.preferred_language, role=UserRole.RESIDENT,
    )
    c.session.add(user)
    await c.session.flush()
    await c.commit()
    return issue_tokens(c, user)


@router.post("/login", response_model=TokenOut, summary="Exchange email + password for JWT tokens")
async def login(body: LoginIn, c: ServiceContainer = Depends(get_container)) -> TokenOut:
    user = await c.session.scalar(select(User).where(User.email == body.email.strip().lower()))
    if not user or not user.is_active or not verify_password(body.password, user.hashed_password):
        raise Unauthorized("Incorrect email or password")
    return issue_tokens(c, user)


@router.post("/refresh", response_model=TokenOut, summary="Rotate a refresh token")
async def refresh(body: RefreshIn, c: ServiceContainer = Depends(get_container)) -> TokenOut:
    payload = decode_token(c.settings, body.refresh_token, "refresh")
    if await c.session.scalar(select(RevokedToken.id).where(RevokedToken.jti == payload["jti"])):
        raise Unauthorized("Refresh token has been revoked")
    import uuid
    from datetime import UTC, datetime

    user = await c.session.get(User, uuid.UUID(payload["sub"]))
    if not user or not user.is_active:
        raise Unauthorized("User not found or inactive")
    c.session.add(RevokedToken(jti=payload["jti"], user_id=user.id, expires_at=datetime.fromtimestamp(payload["exp"], UTC)))
    await c.commit()
    return issue_tokens(c, user)


@router.post("/logout", status_code=204, summary="Revoke the current access token (and optionally a refresh token)")
async def logout(body: LogoutIn, credentials=Depends(bearer), user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> None:
    from datetime import UTC, datetime

    tokens = [(credentials.credentials, "access")]
    if body.refresh_token:
        tokens.append((body.refresh_token, "refresh"))
    for token, kind in tokens:
        payload = decode_token(c.settings, token, kind)
        if not await c.session.scalar(select(RevokedToken.id).where(RevokedToken.jti == payload["jti"])):
            c.session.add(RevokedToken(jti=payload["jti"], user_id=user.id, expires_at=datetime.fromtimestamp(payload["exp"], UTC)))
    await c.commit()


@router.get("/me", response_model=UserOut, summary="Current user")
async def me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me", response_model=UserOut, summary="Update profile (language, phone for real callbacks)")
async def update_me(body: UserUpdate, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> User:
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await c.commit()
    return user
