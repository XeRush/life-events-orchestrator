"""Authentication: register, login, refresh, logout, me, email verification, password reset, invitations."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import current_session, get_container, get_current_user, rate_limit
from app.api.v1.common import user_out
from app.models.user import User
from app.schemas.auth import (
    AcceptInviteIn,
    ChangePasswordIn,
    EmailIn,
    LoginIn,
    LogoutIn,
    ProfileIn,
    RefreshIn,
    RegisterIn,
    ResetPasswordIn,
    TokenIn,
)
from app.services.container import ServiceContainer

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/config", summary="Public auth configuration (verification policy, email transport, demo accounts)")
async def auth_config(c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    s = c.settings
    return {
        "require_email_verification": s.require_email_verification,
        "email_transport": c.infra.email.name,
        "dev_mailbox": s.is_development and c.infra.email.name == "console",
        "demo_accounts": [{"email": "demo.resident@lifeloop.local", "role": "RESIDENT"}, {"email": "demo.officer@lifeloop.local", "role": "OFFICER"},
                          {"email": "demo.admin@lifeloop.local", "role": "ADMIN"}] if s.demo_mode else [],
        "password_rules": "At least 10 characters, with a letter and a number.",
    }


@router.post("/register", status_code=201, dependencies=[Depends(rate_limit("auth"))], summary="Register a resident account")
async def register(body: RegisterIn, c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    user = await c.auth.register(email=body.email, password=body.password, full_name=body.full_name, phone=body.phone,
                                 language=body.preferred_language)
    _, tokens = user, c.auth.issue_tokens(user)
    await c.commit()
    return {"user": await user_out(c, user), "tokens": tokens, "verification_email_sent": True}


@router.post("/login", dependencies=[Depends(rate_limit("auth"))], summary="Sign in (lockout after repeated failures)")
async def login(body: LoginIn, c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    user, tokens = await c.auth.login(body.email, body.password)
    await c.commit()
    return {"user": await user_out(c, user), "tokens": tokens}


@router.post("/refresh", dependencies=[Depends(rate_limit("auth"))], summary="Rotate the refresh token")
async def refresh(body: RefreshIn, c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    user, tokens = await c.auth.refresh(body.refresh_token)
    await c.commit()
    return {"user": await user_out(c, user), "tokens": tokens}


@router.post("/logout", status_code=204, summary="Revoke the access and refresh tokens")
async def logout(body: LogoutIn, session: tuple = Depends(current_session), c: ServiceContainer = Depends(get_container)) -> Response:
    await c.auth.logout(session[1], body.refresh_token)
    await c.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", summary="Current user")
async def me(user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return await user_out(c, user)


@router.patch("/me", summary="Update profile (name, phone, language)")
async def update_me(body: ProfileIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    user = await c.session.merge(user)
    await c.users.update_profile(user, full_name=body.full_name, phone=body.phone, language=body.preferred_language)
    await c.commit()
    return await user_out(c, user)


@router.post("/verify-email", summary="Confirm an email address with the emailed token")
async def verify_email(body: TokenIn, c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    user = await c.auth.verify_email(body.token)
    await c.commit()
    return {"verified": True, "email": user.email}


@router.post("/resend-verification", dependencies=[Depends(rate_limit("auth"))], summary="Send a new verification email")
async def resend(user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    await c.auth.send_verification(await c.session.merge(user))
    await c.commit()
    return {"sent": not user.email_verified}


@router.post("/forgot-password", status_code=202, dependencies=[Depends(rate_limit("auth"))],
             summary="Request a password reset (always 202: no account enumeration)")
async def forgot(body: EmailIn, c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    await c.auth.forgot_password(body.email)
    await c.commit()
    return {"accepted": True}


@router.post("/reset-password", dependencies=[Depends(rate_limit("auth"))], summary="Set a new password with the emailed token")
async def reset(body: ResetPasswordIn, c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    user = await c.auth.reset_password(body.token, body.password)
    await c.commit()
    return {"reset": True, "email": user.email}


@router.post("/accept-invite", dependencies=[Depends(rate_limit("auth"))], summary="Activate a provisioned account")
async def accept_invite(body: AcceptInviteIn, c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    user = await c.auth.accept_invitation(body.token, body.password, body.full_name)
    tokens = c.auth.issue_tokens(user)
    await c.commit()
    return {"user": await user_out(c, user), "tokens": tokens}


@router.post("/change-password", summary="Change password (ends other sessions)")
async def change_password(body: ChangePasswordIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    user = await c.session.merge(user)
    await c.auth.change_password(user, body.current_password, body.new_password)
    tokens = c.auth.issue_tokens(user)
    await c.commit()
    return {"changed": True, "tokens": tokens}
