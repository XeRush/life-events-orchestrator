"""Authentication and account provisioning schemas."""
from __future__ import annotations

import re
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field

_EMAIL_RE = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$")


def _email(value: str) -> str:
    """Syntactic check only. (email-validator rejects reserved domains such as .local, which the demo accounts use.)"""
    value = value.strip().lower()
    if len(value) > 254 or not _EMAIL_RE.match(value):
        raise ValueError("Enter a valid email address")
    return value


EmailStr = Annotated[str, AfterValidator(_email)]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    full_name: str = Field(min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=32, pattern=r"^\+?[0-9 ()-]{7,20}$")
    preferred_language: str = Field(default="en", max_length=8)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=2000)


class LogoutIn(BaseModel):
    refresh_token: str | None = Field(default=None, max_length=2000)


class TokenIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class EmailIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=10, max_length=128)


class AcceptInviteIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=10, max_length=128)
    full_name: str | None = Field(default=None, max_length=160)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)


class ProfileIn(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=32)
    preferred_language: str | None = Field(default=None, max_length=8)


class ProvisionIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    role: Literal["OFFICER", "ADMIN", "RESIDENT"]
    organization_id: str | None = None
    title: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=32)
    preferred_language: str | None = Field(default=None, max_length=8)


class UserUpdateIn(BaseModel):
    role: Literal["OFFICER", "ADMIN", "RESIDENT"] | None = None
    is_active: bool | None = None
    organization_id: str | None = None
    title: str | None = Field(default=None, max_length=120)
    full_name: str | None = Field(default=None, max_length=160)


class OrganizationIn(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=2, max_length=160)
    emirate: str = Field(default="DUBAI", max_length=20)
    kind: Literal["SERVICE_CENTRE", "PLATFORM"] = "SERVICE_CENTRE"


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    title: str | None
    role: str
    organization_id: str | None
    organization_name: str | None = None
    phone: str | None
    preferred_language: str
    is_active: bool
    email_verified: bool
    invitation_pending: bool
    last_login_at: str | None
    created_at: str


class TokensOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    expires_at: str


class SessionOut(BaseModel):
    tokens: TokensOut
    user: UserOut
