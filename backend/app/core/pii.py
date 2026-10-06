"""PII minimisation and redaction shared by logs, traces, transcripts, audit metadata and integration payloads.

Rules (see SECURITY.md):
* Emirates ID numbers are never stored in clear: a keyed hash (for matching) and the last four digits only.
* Passport numbers are never stored: only "present / not present".
* Anything leaving the process for observability passes through `redact_value` first.
"""
from __future__ import annotations

import hashlib
import hmac
import re
from typing import Any

# 784-YYYY-NNNNNNN-C, with or without separators.
EID_RE = re.compile(r"\b784[\s-]?\d{4}[\s-]?\d{7}[\s-]?\d\b")
LONG_DIGITS_RE = re.compile(r"\b\d{12,19}\b")
PASSPORT_RE = re.compile(r"\b[A-Z]{1,2}\d{6,8}\b")
PHONE_RE = re.compile(r"(?<![\w-])\+?\d[\d\s-]{7,16}\d(?![\w-])")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
EMAIL_RE = re.compile(r"\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b")
BEARER_RE = re.compile(r"(?i)bearer\s+[A-Za-z0-9._-]+")
KV_SECRET_RE = re.compile(r"(?i)\b(password|passwd|token|secret|api[_-]?key|authorization)\s*[=:]\s*[^\s,;]+")
JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")

SENSITIVE_KEYS = (
    "password", "passwd", "token", "secret", "api_key", "apikey", "authorization", "signature", "cookie",
    "emirates_id", "eid", "passport_number", "otp", "credential", "private_key", "audio", "recording",
)
PARTIAL_KEYS = ("phone", "email", "to_number")


def digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def normalise_eid(value: str) -> str:
    return digits(value)


def is_valid_eid(value: str) -> bool:
    d = normalise_eid(value)
    return len(d) == 15 and d.startswith("784")


def keyed_hash(value: str, key: str) -> str:
    """Deterministic keyed hash for matching identifiers without storing them."""
    return hmac.new(key.encode(), value.encode(), hashlib.sha256).hexdigest()


def last4(value: str) -> str:
    d = digits(value)
    return d[-4:] if len(d) >= 4 else ""


def mask_phone(phone: str | None) -> str | None:
    if not phone:
        return phone
    d = digits(phone)
    return f"+{d[:3]}•••••{d[-2:]}" if len(d) > 5 else "•••"


def mask_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return email
    local, domain = email.split("@", 1)
    return f"{local[:1]}•••@{domain}"


def _phone(match: re.Match[str]) -> str:
    """Only digit runs that look like phone numbers (9-15 digits); dates and short references are left alone."""
    raw = match.group(0)
    count = len(digits(raw))
    if ISO_DATE_RE.match(raw.strip()) or not 9 <= count <= 15:
        return raw
    return "[PHONE]"


def redact_text(text: str | None) -> str | None:
    """Scrub identifiers from free text (transcripts, error messages, log lines)."""
    if not text:
        return text
    out = JWT_RE.sub("[REDACTED_TOKEN]", text)
    out = KV_SECRET_RE.sub(lambda m: f"{m.group(1)}=[REDACTED]", out)
    out = BEARER_RE.sub("Bearer [REDACTED]", out)
    out = EID_RE.sub("[EMIRATES_ID]", out)
    out = LONG_DIGITS_RE.sub("[NUMBER]", out)
    out = PASSPORT_RE.sub("[PASSPORT]", out)
    out = PHONE_RE.sub(_phone, out)
    out = EMAIL_RE.sub(lambda m: f"{m.group(1)}•••@{m.group(2)}", out)
    return out


def redact_value(value: Any, key: str | None = None, depth: int = 0) -> Any:
    """Recursively redact a structure for logging / tracing / audit metadata."""
    if depth > 6:
        return "[TRUNCATED]"
    if key:
        lowered = key.lower()
        if any(marker in lowered for marker in SENSITIVE_KEYS) and not lowered.endswith(("_present", "_last4", "_hash", "_status", "_at")):
            return "[REDACTED]" if value not in (None, "", [], {}) else value
        if any(marker in lowered for marker in PARTIAL_KEYS) and isinstance(value, str):
            return mask_email(value) if "@" in value else mask_phone(value)
    if isinstance(value, dict):
        return {k: redact_value(v, str(k), depth + 1) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact_value(v, None, depth + 1) for v in value][:50]
    if isinstance(value, str):
        return redact_text(value[:4000])
    return value


def contains_eid(text: str) -> bool:
    return bool(EID_RE.search(text or "")) or any(len(d) == 15 and d.startswith("784") for d in LONG_DIGITS_RE.findall(text or ""))
