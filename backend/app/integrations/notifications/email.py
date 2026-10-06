"""Email rendering (Jinja2, autoescaped) and delivery (Gmail API, or console in development).

Configuration is three variables: GMAIL_CREDENTIALS_B64 (base64 of the pickled OAuth credential, gmail.send scope
only), GMAIL_SENDER (the mailbox that consented) and EMAIL_FROM_NAME. With no credential, the console backend
records that a message would have been sent; in development it also keeps the last messages in a local mailbox
(GET /api/v1/dev/mailbox) so verification and reset links can be followed without a mail server.

Rendered bodies contain single-use links. They go straight to the transport and are never logged or persisted.
"""
from __future__ import annotations

import asyncio
import base64
import pickle
import threading
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.message import EmailMessage
from email.policy import SMTP as SMTP_POLICY
from email.utils import make_msgid
from functools import lru_cache
from pathlib import Path
from typing import Any, Final, Protocol
from urllib.parse import urlencode

import anyio.to_thread
from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

from app.core.config import Settings
from app.core.pii import mask_email
from app.observability.logging import get_logger

log = get_logger("lifeloop.email")
TEMPLATE_DIR = Path(__file__).resolve().parents[2] / "templates" / "email"


class EmailSendError(Exception):
    pass


@dataclass(frozen=True)
class RenderedEmail:
    template: str
    subject: str
    html: str
    text: str


@dataclass(frozen=True)
class OutgoingEmail:
    to: str
    subject: str
    html: str
    text: str
    headers: dict[str, str] = field(default_factory=dict)


@lru_cache
def _env() -> Environment:
    return Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)), undefined=StrictUndefined,
                       autoescape=select_autoescape(enabled_extensions=("html",), default_for_string=True), keep_trailing_newline=True)


def frontend_url(settings: Settings, path: str, query: dict[str, str] | None = None) -> str:
    url = f"{settings.frontend_url.rstrip('/')}/{path.lstrip('/')}"
    return f"{url}?{urlencode(query)}" if query else url


def render(settings: Settings, template: str, subject: str, context: dict[str, Any]) -> RenderedEmail:
    ctx: dict[str, Any] = {"subject": subject, "app_name": settings.app_name, "year": datetime.now(UTC).year,
                           "recipient_name": None, "action_url": None, "action_label": "Open LifeLoop", "eyebrow": "Account",
                           "details": [], **context}
    env = _env()
    return RenderedEmail(template, subject, env.get_template(f"{template}.html").render(ctx), env.get_template(f"{template}.txt").render(ctx))


def render_verify_email(settings: Settings, name: str, raw_token: str) -> RenderedEmail:
    return render(settings, "verify_email", "Confirm your email for LifeLoop", {
        "recipient_name": name, "action_url": frontend_url(settings, "/verify-email", {"token": raw_token}),
        "action_label": "Confirm email address", "expires_in": f"{settings.email_verification_ttl_hours} hours"})


def render_password_reset(settings: Settings, name: str, raw_token: str) -> RenderedEmail:
    return render(settings, "password_reset", "Reset your LifeLoop password", {
        "recipient_name": name, "action_url": frontend_url(settings, "/reset-password", {"token": raw_token}),
        "action_label": "Choose a new password", "expires_in": f"{settings.password_reset_ttl_minutes} minutes"})


def render_invitation(settings: Settings, name: str, raw_token: str, role: str, organization: str, inviter: str) -> RenderedEmail:
    return render(settings, "invitation", "You have been invited to LifeLoop", {
        "recipient_name": name, "action_url": frontend_url(settings, "/accept-invite", {"token": raw_token}),
        "action_label": "Set up your account", "expires_in": f"{settings.invitation_ttl_hours} hours", "role": role.title(),
        "organization": organization, "inviter": inviter})


def render_case_update(settings: Settings, name: str, title: str, message: str, case_reference: str, link: str | None) -> RenderedEmail:
    return render(settings, "case_update", f"{title} | {case_reference}", {
        "recipient_name": name, "title": title, "message": message, "eyebrow": f"Case {case_reference}",
        "action_url": frontend_url(settings, link) if link else None, "action_label": "Open your case"})


class EmailBackend(Protocol):
    name: str

    async def send(self, message: OutgoingEmail) -> None: ...


def build_mime(message: OutgoingEmail, sender: str) -> EmailMessage:
    mime = EmailMessage()
    mime["From"] = sender
    mime["To"] = message.to
    mime["Subject"] = message.subject
    mime["Message-ID"] = make_msgid(domain=sender.rsplit("@", 1)[-1].rstrip(">") or None)
    for key, value in message.headers.items():
        mime[key] = value
    mime.set_content(message.text)
    mime.add_alternative(message.html, subtype="html")
    return mime


_gmail_lock = threading.Lock()
_ATTEMPTS: Final = 3
_WAITS: Final = (1.0, 2.0)


def _gmail_service(credentials_b64: str) -> Any:
    """Unpickle the operator-supplied credential (from the environment only - never from user input)."""
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    credentials = pickle.loads(base64.b64decode(credentials_b64))  # noqa: S301 - operator configuration, see docstring
    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
    return build("gmail", "v1", credentials=credentials, cache_discovery=False)


def _transient(exc: BaseException) -> bool:
    from google.auth.exceptions import RefreshError, TransportError
    from googleapiclient.errors import HttpError

    if isinstance(exc, RefreshError):
        return False
    if isinstance(exc, HttpError):
        return exc.status_code is not None and (exc.status_code == 429 or exc.status_code >= 500)
    return isinstance(exc, (TransportError, OSError, TimeoutError))


def _reason(exc: BaseException) -> str:
    from google.auth.exceptions import RefreshError

    if isinstance(exc, RefreshError) and "invalid_grant" in str(exc):
        return ("Google rejected the refresh token (invalid_grant). Mint a new one with scripts/mint_gmail_token.py; "
                "tokens from an OAuth app still in Testing expire after 7 days.")
    return f"{type(exc).__name__}: {exc}"


class GmailEmailBackend:
    name = "gmail"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _send_sync(self, mime: EmailMessage) -> None:
        raw = base64.urlsafe_b64encode(mime.as_bytes(policy=SMTP_POLICY)).decode("ascii")
        with _gmail_lock:
            _gmail_service(self.settings.gmail_credentials_b64).users().messages().send(userId="me", body={"raw": raw}).execute()

    async def send(self, message: OutgoingEmail) -> None:
        mime = build_mime(message, self.settings.email_sender)
        for attempt in range(1, _ATTEMPTS + 1):
            try:
                await anyio.to_thread.run_sync(self._send_sync, mime)
                log.info("email_sent", backend="gmail", to=mask_email(message.to), subject=message.subject)
                return
            except Exception as exc:
                transient = _transient(exc)
                if not transient or attempt == _ATTEMPTS:
                    raise EmailSendError(f"Gmail delivery failed ({'transient' if transient else 'permanent'}): {_reason(exc)}") from exc
                log.warning("email_send_retry", backend="gmail", attempt=attempt, error=_reason(exc))
                await asyncio.sleep(_WAITS[attempt - 1])


class ConsoleEmailBackend:
    """Development transport. Logs only recipient + subject; keeps bodies in a local, dev-only mailbox."""

    name = "console"

    def __init__(self, keep: bool) -> None:
        self.keep = keep
        self.mailbox: deque[dict[str, Any]] = deque(maxlen=50)

    async def send(self, message: OutgoingEmail) -> None:
        log.info("email_sent", backend="console", to=mask_email(message.to), subject=message.subject)
        if self.keep:
            self.mailbox.appendleft({"to": message.to, "subject": message.subject, "text": message.text,
                                     "sent_at": datetime.now(UTC).isoformat()})


def build_email_backend(settings: Settings) -> GmailEmailBackend | ConsoleEmailBackend:
    if settings.email_backend == "console" or (settings.email_backend == "auto" and not settings.gmail_configured):
        return ConsoleEmailBackend(keep=settings.is_development)
    return GmailEmailBackend(settings)


async def send_rendered(backend: EmailBackend, to: str, rendered: RenderedEmail) -> bool:
    try:
        await backend.send(OutgoingEmail(to=to, subject=rendered.subject, html=rendered.html, text=rendered.text))
        return True
    except EmailSendError as exc:
        log.error("email_failed", template=rendered.template, to=mask_email(to), error=str(exc))
        return False
