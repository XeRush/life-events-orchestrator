"""Password hashing, JWT, rate limiting, HMAC verification and secure headers."""
import hashlib
import hmac
import time
import uuid
from abc import ABC, abstractmethod
from collections import defaultdict, deque
from datetime import datetime, timedelta

import bcrypt
import jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.errors import Unauthorized


def hash_password(password: str, rounds: int = 12) -> str:
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(rounds)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], hashed.encode())
    except ValueError:
        return False


def create_token(
    settings: Settings, *, subject: str, token_type: str, role: str, ttl: timedelta
) -> tuple[str, str, datetime]:
    """Returns (token, jti, expires_at)."""
    now = utcnow()
    jti = uuid.uuid4().hex
    exp = now + ttl
    payload = {
        "sub": subject,
        "type": token_type,
        "role": role,
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm), jti, exp


def decode_token(settings: Settings, token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise Unauthorized("Invalid or expired token") from exc
    if payload.get("type") != expected_type:
        raise Unauthorized("Wrong token type")
    return payload


def verify_hmac_signature(secret: str, body: bytes, header: str, tolerance_seconds: int = 1800) -> bool:
    """Verify an ElevenLabs-style `t=<ts>,v0=<hex>` signature header."""
    try:
        parts = dict(p.strip().split("=", 1) for p in header.split(","))
        timestamp, signature = parts["t"], parts["v0"]
        if abs(time.time() - int(timestamp)) > tolerance_seconds:
            return False
    except (ValueError, KeyError):
        return False
    expected = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


class RateLimiter(ABC):
    """Abstraction so a Redis-backed limiter can replace the in-memory one without touching callers."""

    @abstractmethod
    def allow(self, key: str, limit: int, window_seconds: int = 60) -> bool: ...


class InMemoryRateLimiter(RateLimiter):
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit: int, window_seconds: int = 60) -> bool:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > window_seconds:
            hits.popleft()
        if len(hits) >= limit:
            return False
        hits.append(now)
        return True


rate_limiter: RateLimiter = InMemoryRateLimiter()


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if not request.url.path.startswith(("/docs", "/redoc", "/openapi")):
            response.headers.setdefault("Cache-Control", "no-store")
        return response
