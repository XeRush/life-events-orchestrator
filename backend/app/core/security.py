"""Password hashing, JWTs, one-time tokens, webhook signatures and secure HTTP headers."""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
import uuid
from datetime import datetime, timedelta

import bcrypt
import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.errors import Unauthorized, ValidationFailed

PASSWORD_MIN_LENGTH = 10


def hash_password(password: str, rounds: int = 12) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(rounds)).decode()


def verify_password(password: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


def validate_password_strength(password: str) -> None:
    problems = []
    if len(password) < PASSWORD_MIN_LENGTH:
        problems.append(f"at least {PASSWORD_MIN_LENGTH} characters")
    if not any(c.isalpha() for c in password):
        problems.append("a letter")
    if not any(c.isdigit() for c in password):
        problems.append("a number")
    if problems:
        raise ValidationFailed("Password must contain " + ", ".join(problems) + ".", code="weak_password")


def create_token(settings: Settings, *, subject: str, token_type: str, role: str, ttl: timedelta,
                 org: str | None = None) -> tuple[str, str, datetime]:
    """Returns (token, jti, expires_at)."""
    now = utcnow()
    jti = uuid.uuid4().hex
    exp = now + ttl
    payload = {"sub": subject, "type": token_type, "role": role, "jti": jti, "iat": int(now.timestamp()),
               "exp": int(exp.timestamp()), "iss": "lifeloop"}
    if org:
        payload["org"] = org
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm), jti, exp


def decode_token(settings: Settings, token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm], issuer="lifeloop")
    except jwt.PyJWTError as exc:
        raise Unauthorized("Invalid or expired token") from exc
    if payload.get("type") != expected_type:
        raise Unauthorized("Wrong token type")
    return payload


def new_opaque_token() -> tuple[str, str]:
    """A single-use URL token: (raw value for the email link, sha256 digest stored in the database)."""
    raw = secrets.token_urlsafe(32)
    return raw, sha256_hex(raw)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def new_consent_token() -> str:
    return "cst_" + secrets.token_urlsafe(18)


def sign_payload(secret: str, body: bytes, timestamp: int | None = None) -> str:
    """Produce an ElevenLabs-style `t=<ts>,v0=<hex>` header (used by the demo webhook simulator and tests)."""
    ts = timestamp or int(time.time())
    digest = hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={ts},v0={digest}"


def verify_hmac_signature(secret: str, body: bytes, header: str | None, tolerance_seconds: int = 300) -> tuple[bool, str | None]:
    """Verify `t=<ts>,v0=<hex>`; returns (valid, timestamp). Old timestamps fail (replay window)."""
    if not header:
        return False, None
    try:
        parts = dict(p.strip().split("=", 1) for p in header.split(","))
        timestamp, signature = parts["t"], parts["v0"]
        if abs(time.time() - int(timestamp)) > tolerance_seconds:
            return False, timestamp
    except (ValueError, KeyError):
        return False, None
    expected = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature), timestamp


def constant_time_equals(a: str | None, b: str | None) -> bool:
    return bool(a) and bool(b) and hmac.compare_digest(str(a), str(b))


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, production: bool = False) -> None:
        super().__init__(app)
        self.production = production

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        h = response.headers
        h.setdefault("X-Content-Type-Options", "nosniff")
        h.setdefault("X-Frame-Options", "DENY")
        h.setdefault("Referrer-Policy", "no-referrer")
        h.setdefault("Permissions-Policy", "camera=(), geolocation=(), microphone=(self)")
        h.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if self.production:
            h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        path = request.url.path
        if not path.startswith(("/docs", "/redoc", "/openapi")):
            h.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
            h.setdefault("Cache-Control", "no-store")
        return response
