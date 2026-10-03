"""Consent tokens and the opt-out path.

* A GRANTED CALLBACK consent carries a token. The callback engine refuses to dial without it (checked at schedule
  AND dial time).
* "Stop calling" at any turn: record the opt-out, cancel pending callbacks, switch the case to SMS-only, confirm by SMS.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.core.clock import utcnow
from app.core.i18n import t
from app.core.security import new_consent_token
from app.events.recorder import Actor
from app.models.case import Case
from app.models.consent import Consent, OptOut
from app.models.enums import ChannelMode, ConsentStatus, ConsentType, NotificationChannel, Source
from app.models.user import User
from app.workflows.step_text import step_text

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

SCOPES = {
    ConsentType.DATA_PROCESSING: "Process the parent and child details captured on this call to coordinate the post-birth services.",
    ConsentType.SERVICE_FILING: "Prepare filings with the birth-certificate issuer, MOFA, GDRFA/ICP and the insurer, each released by an officer.",
    ConsentType.CALLBACK: "Call the resident back when a step is cleared, blocked, needs a document, stalls, or is escalated.",
}
LABELS = {ConsentType.DATA_PROCESSING: "data processing", ConsentType.SERVICE_FILING: "service filing", ConsentType.CALLBACK: "callbacks"}


class ConsentService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def capture(self, case: Case, user: User, consent_type: ConsentType, *, source: str, actor: Actor,
                      call_session_id: Any = None, evidence: dict[str, Any] | None = None) -> Consent:
        existing = await self.c.consents_repo.active(case.id, consent_type)
        if existing:
            return existing
        consent = Consent(case_id=case.id, user_id=user.id, consent_type=consent_type, status=ConsentStatus.GRANTED,
                          token=new_consent_token() if consent_type == ConsentType.CALLBACK else None, scope=SCOPES[consent_type],
                          source=source, language=case.language, call_session_id=call_session_id, evidence=evidence or {},
                          captured_at=utcnow())
        self.c.session.add(consent)
        await self.c.session.flush()
        await self.c.events.emit("ConsentCaptured", case_id=case.id, actor=actor,
                                 source=Source.AI_AGENT if source in ("VOICE", "VOICE_TOOL") else Source.RESIDENT,
                                 title=f"Consent captured: {LABELS[consent_type]}", description=SCOPES[consent_type],
                                 payload={"consent_type": consent_type.value, "version": consent.version, "source": source,
                                          "token_issued": bool(consent.token)},
                                 i18n={"key": "timeline.consent", "params": {"type": consent_type.value}})
        return consent

    async def revoke(self, case: Case, user: User, consent_type: ConsentType, actor: Actor) -> Consent | None:
        consent = await self.c.consents_repo.active(case.id, consent_type)
        if consent is None:
            return None
        consent.status, consent.revoked_at = ConsentStatus.REVOKED, utcnow()
        await self.c.events.emit("ConsentRevoked", case_id=case.id, actor=actor, source=Source.RESIDENT,
                                 title=f"Consent withdrawn: {LABELS[consent_type]}", payload={"consent_type": consent_type.value},
                                 i18n={"key": "timeline.consentRevoked", "params": {"type": consent_type.value}})
        if consent_type == ConsentType.CALLBACK:
            await self.c.callbacks.cancel_pending(case, "Callback consent withdrawn")
        return consent

    async def valid_callback_consent(self, case: Case) -> Consent | None:
        consent = await self.c.consents_repo.active(case.id, ConsentType.CALLBACK)
        return consent if consent and consent.token else None

    async def view(self, case: Case) -> list[dict[str, Any]]:
        return [{"id": str(x.id), "consent_type": x.consent_type.value, "status": x.status.value, "version": x.version, "scope": x.scope,
                 "source": x.source, "language": x.language, "token_present": bool(x.token), "captured_at": x.captured_at.isoformat(),
                 "revoked_at": x.revoked_at.isoformat() if x.revoked_at else None} for x in await self.c.consents_repo.for_case(case.id)]


class OptOutService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def opt_out(self, case: Case, user: User, *, source: str, actor: Actor, reason: str = "Resident said 'stop calling'") -> OptOut:
        existing = await self.c.optouts_repo.active(case.id)
        if existing:
            return existing
        await self.c.events.emit("OptOutRequested", case_id=case.id, actor=actor, source=Source.RESIDENT,
                                 title="Resident asked LifeLoop to stop calling", description=reason, payload={"source": source},
                                 i18n={"key": "timeline.optOutRequested", "params": {}})
        opt_out = OptOut(case_id=case.id, user_id=user.id, channel="VOICE", reason=reason, source=source, active=True)
        self.c.session.add(opt_out)
        case.channel_mode = ChannelMode.SMS_ONLY
        case.opted_out_at = utcnow()
        cancelled = await self.c.callbacks.cancel_pending(case, "Resident opted out of calls")
        await self.c.notifications.notify(user.id, case.id, NotificationChannel.SMS, step_text("notice_calls_stopped", case.language), t("sms_opt_out", case.language, ref=case.reference))
        await self.c.events.emit("OptOutCompleted", case_id=case.id, actor=Actor.system(), source=Source.SYSTEM,
                                 title="Calls stopped - case switched to SMS-only",
                                 description=f"{cancelled} pending callback(s) cancelled. Updates continue by SMS and in the app.",
                                 payload={"callbacks_cancelled": cancelled, "channel_mode": ChannelMode.SMS_ONLY.value},
                                 i18n={"key": "timeline.optOutCompleted", "params": {"count": str(cancelled)}})
        return opt_out

    async def opt_in(self, case: Case, user: User, actor: Actor) -> None:
        for row in await self.c.optouts_repo.for_case(case.id):
            if row.active:
                row.active, row.revoked_at = False, utcnow()
        case.channel_mode = ChannelMode.VOICE
        case.opted_out_at = None
        old = await self.c.consents_repo.active(case.id, ConsentType.CALLBACK)
        if old:  # a new consent (and token) is required to resume calling
            old.status, old.revoked_at = ConsentStatus.REVOKED, utcnow()
        await self.c.consents.capture(case, user, ConsentType.CALLBACK, source="WEB_FORM", actor=actor)
        await self.c.events.emit("OptInRestored", case_id=case.id, actor=actor, source=Source.RESIDENT,
                                 title="Voice callbacks turned back on", description="A fresh callback consent was recorded.",
                                 i18n={"key": "timeline.optInRestored", "params": {}})
