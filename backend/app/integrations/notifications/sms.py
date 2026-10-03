"""SMS channel: Twilio when TWILIO_* is configured, otherwise a clearly labelled mock that only records messages.

SMS is the opt-out and telephony-down fallback (canvas box L): it carries the case ID and a callback offer.
A case never advances on SMS alone.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.clock import utcnow
from app.core.config import Settings
from app.core.pii import mask_phone
from app.observability.logging import get_logger

log = get_logger("lifeloop.sms")


@dataclass
class SmsResult:
    provider: str
    is_mock: bool
    provider_id: str | None = None


class SmsError(Exception):
    pass


class MockSms:
    name = "MOCK_SMS"
    is_mock = True

    def __init__(self) -> None:
        self.outbox: deque[dict[str, Any]] = deque(maxlen=100)

    async def send(self, to: str | None, body: str) -> SmsResult:
        self.outbox.appendleft({"to": mask_phone(to), "body": body, "at": utcnow().isoformat()})
        log.info("sms_sent", provider=self.name, to=mask_phone(to), chars=len(body))
        return SmsResult(provider=self.name, is_mock=True)


class TwilioSms:
    name = "TWILIO"
    is_mock = False

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def send(self, to: str | None, body: str) -> SmsResult:
        if not to:
            raise SmsError("Resident has no phone number on file")
        s = self.settings
        url = f"https://api.twilio.com/2010-04-01/Accounts/{s.twilio_account_sid}/Messages.json"
        try:
            async with httpx.AsyncClient(timeout=10) as http:
                response = await http.post(url, data={"To": to, "From": s.twilio_phone_number, "Body": body},
                                           auth=(s.twilio_account_sid, s.twilio_auth_token))
        except httpx.HTTPError as exc:
            raise SmsError(f"Twilio unreachable: {type(exc).__name__}") from exc
        if response.status_code >= 400:
            raise SmsError(f"Twilio rejected the message (HTTP {response.status_code})")
        log.info("sms_sent", provider=self.name, to=mask_phone(to))
        return SmsResult(provider=self.name, is_mock=False, provider_id=response.json().get("sid"))


def build_sms(settings: Settings) -> MockSms | TwilioSms:
    return TwilioSms(settings) if settings.twilio_configured else MockSms()
