"""Callback engine (canvas boxes I step 4, K and L).

Policy: call on CLEARED / BLOCKED / DOCUMENT_MISSING / STALLED (SLA) / HUMAN_ESCALATION, and to ask the parent for
the consulate milestone. Never call without a valid consent token. Never call after opt-out (SMS instead). Consent
and opt-out are checked when the callback is scheduled AND again at dial time. Updates arriving within the
coalescing window share one call.
"""
from __future__ import annotations

import uuid
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from app.core.clock import utcnow
from app.core.errors import Conflict, Forbidden, NotFound
from app.core.i18n import node_title, t
from app.events.recorder import Actor
from app.integrations.telephony.providers import TelephonyError
from app.models.call import CallSession
from app.models.callback import Callback
from app.models.case import Case
from app.models.enums import (
    CallbackStatus,
    CallDirection,
    CallProvider,
    CallState,
    NotificationChannel,
    Source,
    UserRole,
)
from app.models.user import User
from app.observability import metrics
from app.workflows.step_text import step_text

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

REASONS = ("CLEARED", "COMPLETED", "BLOCKED", "DOCUMENT_MISSING", "STALLED", "HUMAN_ESCALATION", "PARENT_INPUT", "CASE_COMPLETE")


class CallbackService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    def compose(self, case: Case, reasons: list[dict[str, Any]], lang: str | None = None) -> str:
        lang = lang or case.language
        lines = []
        for r in reasons:
            key = {"CLEARED": "cb_cleared", "COMPLETED": "cb_completed", "BLOCKED": "cb_blocked", "DOCUMENT_MISSING": "cb_document_missing",
                   "STALLED": "cb_stalled", "HUMAN_ESCALATION": "cb_escalation", "PARENT_INPUT": "cb_parent_input",
                   "CASE_COMPLETE": "cb_case_complete", "STATUS": "cb_status", "BIOMETRICS": "cb_biometrics"}[r["reason"]]
            lines.append(t(key, lang, node=node_title(r.get("node_key"), lang, r.get("node_title") or ""), entity=r.get("entity") or "", reason=r.get("detail") or "",
                           docs=r.get("detail") or ""))
        needs_action = any(r["reason"] in ("DOCUMENT_MISSING", "PARENT_INPUT", "BIOMETRICS") for r in reasons)
        lines.append(t("cb_close_action" if needs_action else "cb_close", lang))
        return " ".join(lines)

    async def request(self, case: Case, reason: str, *, trigger_event: str, node_key: str | None = None, node_title: str | None = None,
                      entity: str | None = None, detail: str | None = None) -> Callback | None:
        """Decide whether and how to reach the resident. Returns the callback record (any status) or None."""
        resident = await self.c.users_repo.get(case.resident_id)
        if resident is None:
            return None
        item = {"reason": reason, "node_key": node_key, "node_title": node_title, "entity": entity, "detail": detail, "trigger": trigger_event}
        now = utcnow()
        opt_out = await self.c.optouts_repo.active(case.id)
        if opt_out:
            cb = Callback(case_id=case.id, node_key=node_key, reason=reason, reasons=[item], trigger_event=trigger_event,
                          status=CallbackStatus.SMS_ONLY, channel="SMS", language=case.language, scheduled_for=now, completed_at=now,
                          outcome="Opted out of calls - update sent by SMS instead.")
            self.c.session.add(cb)
            await self.c.notifications.notify(resident.id, case.id, NotificationChannel.SMS, step_text("notice_case_update", case.language),
                                              t("sms_update", case.language, ref=case.reference, update=self.compose(case, [item])))
            metrics.CALLBACKS.labels("sms_only").inc()
            await self.c.events.emit("CallbackBlocked", case_id=case.id, node_key=node_key, source=Source.SYSTEM,
                                     title="Call not placed - resident opted out; SMS sent", payload={"reason": reason, "why": "OPTED_OUT"},
                                     i18n={"key": "timeline.callbackBlocked.OPTED_OUT", "params": {"cbReason": reason}})
            return cb
        consent = await self.c.consents.valid_callback_consent(case)
        if consent is None:
            cb = Callback(case_id=case.id, node_key=node_key, reason=reason, reasons=[item], trigger_event=trigger_event,
                          status=CallbackStatus.BLOCKED_NO_CONSENT, language=case.language, scheduled_for=now,
                          outcome="No callback consent token - the engine refused to dial.")
            self.c.session.add(cb)
            await self.c.notifications.notify(resident.id, case.id, NotificationChannel.IN_APP, step_text("notice_case_update", case.language), self.compose(case, [item]),
                                              link=f"/app/cases/{case.reference}")
            metrics.CALLBACKS.labels("blocked_no_consent").inc()
            await self.c.events.emit("CallbackBlocked", case_id=case.id, node_key=node_key, source=Source.SYSTEM,
                                     title="Call not placed - no callback consent", payload={"reason": reason, "why": "NO_CONSENT"},
                                     i18n={"key": "timeline.callbackBlocked.NO_CONSENT", "params": {"cbReason": reason}})
            return cb
        for existing in await self.c.callbacks_repo.open_for_case(case.id):
            if existing.status == CallbackStatus.SCHEDULED:
                existing.reasons = [*existing.reasons, item]
                existing.reason = reason if reason in ("BLOCKED", "DOCUMENT_MISSING", "STALLED", "HUMAN_ESCALATION") else existing.reason
                return existing
        cb = Callback(case_id=case.id, node_key=node_key, reason=reason, reasons=[item], trigger_event=trigger_event, status=CallbackStatus.SCHEDULED,
                      language=case.language, consent_id=consent.id, scheduled_for=now + timedelta(seconds=self.c.settings.callback_coalesce_seconds))
        self.c.session.add(cb)
        await self.c.session.flush()
        metrics.CALLBACKS.labels("scheduled").inc()
        await self.c.events.emit("CallbackScheduled", case_id=case.id, node_key=node_key, source=Source.SYSTEM,
                                 title=f"Callback scheduled: {self.compose(case, [item], 'en').split('. ')[0]}",
                                 payload={"callback_id": str(cb.id), "reason": reason, "consent_token_checked": True},
                                 i18n={"key": "timeline.callbackScheduled", "params": {"cbReason": reason, **({"node": node_key} if node_key else {})}})
        return cb

    async def dial_due(self) -> int:
        """Worker: place due callbacks. Consent and opt-out are re-checked here - they may have changed."""
        placed = 0
        for cb in await self.c.callbacks_repo.due(utcnow()):
            case = await self.c.cases_repo.get(cb.case_id)
            resident = await self.c.users_repo.get(case.resident_id) if case else None
            if case is None or resident is None:
                cb.status = CallbackStatus.CANCELLED
                continue
            if await self.c.optouts_repo.active(case.id):
                cb.status, cb.channel, cb.outcome = CallbackStatus.SMS_ONLY, "SMS", "Opted out before dialling - SMS sent."
                await self.c.notifications.notify(resident.id, case.id, NotificationChannel.SMS, step_text("notice_case_update", case.language),
                                                  t("sms_update", case.language, ref=case.reference, update=self.compose(case, cb.reasons)))
                continue
            consent = await self.c.consents.valid_callback_consent(case)
            if consent is None:
                cb.status, cb.outcome = CallbackStatus.BLOCKED_NO_CONSENT, "Consent withdrawn before dialling - not called."
                metrics.CALLBACKS.labels("blocked_no_consent").inc()
                continue
            # The call session exists BEFORE dialling so the ElevenLabs agent receives `lifeloop_call_id` and its server
            # tools can bind to this call, this case and this resident (verification still required before details).
            call = CallSession(case_id=case.id, user_id=resident.id, callback_id=cb.id, direction=CallDirection.OUTBOUND,
                               provider=CallProvider.SIMULATED, language=cb.language, state=CallState.RINGING, started_at=utcnow())
            self.c.session.add(call)
            await self.c.session.flush()
            client_data = {"dynamic_variables": {
                "lifeloop_call_id": str(call.id), "case_reference": case.reference, "language": cb.language, "callback_id": str(cb.id),
                "verified": "false", "callback_script": self.compose(case, cb.reasons, cb.language), "consent_token_present": True}}
            try:
                result = await self.c.infra.telephony.dial(to_number=resident.phone, client_data=client_data)
            except TelephonyError as exc:
                call.state, call.ended_at, call.outcome = CallState.FAILED, utcnow(), f"Telephony unavailable: {exc}"
                cb.status, cb.outcome = CallbackStatus.FAILED, f"Telephony unavailable: {exc}. SMS sent with the case ID."
                await self.c.notifications.notify(resident.id, case.id, NotificationChannel.SMS, step_text("notice_tried_call", case.language),
                                                  t("sms_missed_call", case.language, ref=case.reference))
                metrics.CALLBACKS.labels("telephony_failed").inc()
                continue
            cb.status, cb.dialed_at, cb.provider = CallbackStatus.DIALING, utcnow(), result.provider
            call.provider = CallProvider.SIMULATED if result.rings_in_browser else CallProvider.ELEVENLABS
            call.provider_conversation_id = result.provider_conversation_id
            if not result.rings_in_browser:
                call.state = CallState.ACTIVE  # the phone is ringing on the real network; ElevenLabs owns the conversation
            cb.call_session_id = call.id
            await self.c.events.emit("CallbackDialed", case_id=case.id, node_key=cb.node_key, actor=Actor.agent(), source=Source.AI_AGENT,
                                     title="LifeLoop is calling the resident", description=result.detail,
                                     payload={"callback_id": str(cb.id), "call_session_id": str(call.id), "provider": result.provider},
                                     i18n={"key": "timeline.callbackDialed", "params": {}})
            await self.c.notifications.notify(resident.id, case.id, NotificationChannel.IN_APP, step_text("notice_calling", case.language),
                                              f"Case {case.reference}: answer in the Voice screen.", link=f"/app/voice?call={call.id}")
            metrics.CALLBACKS.labels("dialed").inc()
            placed += 1
        return placed

    async def sweep_unanswered(self) -> int:
        cutoff = utcnow() - timedelta(seconds=self.c.settings.callback_ring_timeout_seconds)
        swept = 0
        for cb in await self.c.callbacks_repo.ringing_before(cutoff):
            call = await self.c.calls_repo.get(cb.call_session_id) if cb.call_session_id else None
            if call is not None and call.state != CallState.RINGING:
                continue
            case = await self.c.cases_repo.get(cb.case_id)
            cb.status, cb.completed_at, cb.outcome = CallbackStatus.NO_ANSWER, utcnow(), "No answer - SMS sent with the case ID."
            if call is not None:
                call.state, call.ended_at, call.outcome = CallState.ENDED, utcnow(), "No answer"
            if case is not None:
                await self.c.notifications.notify(case.resident_id, case.id, NotificationChannel.SMS, step_text("notice_tried_call", case.language),
                                                  t("sms_missed_call", case.language, ref=case.reference))
                await self.c.events.emit("CallbackNoAnswer", case_id=case.id, source=Source.SYSTEM, title="Callback not answered - SMS sent",
                                         payload={"callback_id": str(cb.id)}, i18n={"key": "timeline.callbackNoAnswer", "params": {}})
            swept += 1
        return swept

    async def complete(self, cb: Callback, *, duration: float | None, outcome: str) -> None:
        if cb.status in (CallbackStatus.COMPLETED, CallbackStatus.CANCELLED):
            return
        cb.status, cb.completed_at, cb.duration_seconds, cb.outcome = CallbackStatus.COMPLETED, utcnow(), duration, outcome
        metrics.CALLBACKS.labels("completed").inc()
        await self.c.events.emit("CallbackCompleted", case_id=cb.case_id, node_key=cb.node_key, actor=Actor.agent(), source=Source.AI_AGENT,
                                 title="Resident updated by voice", description=outcome,
                                 payload={"callback_id": str(cb.id), "duration_seconds": duration},
                                 i18n={"key": "timeline.callbackCompleted", "params": {}})

    async def cancel_pending(self, case: Case, reason: str) -> int:
        cancelled = 0
        for cb in await self.c.callbacks_repo.open_for_case(case.id):
            cb.status, cb.outcome, cb.completed_at = CallbackStatus.CANCELLED, reason, utcnow()
            if cb.call_session_id:
                call = await self.c.calls_repo.get(cb.call_session_id)
                if call and call.state == CallState.RINGING:
                    call.state, call.ended_at, call.outcome = CallState.ENDED, utcnow(), reason
            cancelled += 1
        if cancelled:
            await self.c.events.emit("CallbacksCancelled", case_id=case.id, source=Source.SYSTEM, title=f"{cancelled} pending callback(s) cancelled",
                                     description=reason, payload={"count": cancelled},
                                     i18n={"key": "timeline.callbacksCancelled", "params": {"count": str(cancelled)}})
        return cancelled

    async def trigger_now(self, case: Case, user: User) -> Callback | None:
        """'Request a callback' (resident) or a demo trigger (staff): same policy, scheduled immediately."""
        if user.role == UserRole.RESIDENT and case.resident_id != user.id:
            raise Forbidden("Not your case")
        summary = await self.c.cases.summary_sentence(case)
        cb = await self.request(case, "STATUS", trigger_event="CallbackRequested", detail=summary)
        if cb is not None and cb.status == CallbackStatus.SCHEDULED:
            cb.scheduled_for = utcnow()
        return cb

    async def get(self, callback_id: uuid.UUID) -> Callback:
        cb = await self.c.callbacks_repo.get(callback_id)
        if cb is None:
            raise NotFound("Callback not found")
        return cb

    def view(self, cb: Callback, reference: str | None = None) -> dict[str, Any]:
        return {"id": str(cb.id), "case_id": str(cb.case_id), "case_reference": reference, "node_key": cb.node_key, "reason": cb.reason,
                "reasons": cb.reasons, "trigger_event": cb.trigger_event, "status": cb.status.value, "channel": cb.channel,
                "language": cb.language, "consent_checked": cb.consent_id is not None, "scheduled_for": cb.scheduled_for.isoformat(),
                "dialed_at": cb.dialed_at.isoformat() if cb.dialed_at else None, "completed_at": cb.completed_at.isoformat() if cb.completed_at else None,
                "duration_seconds": cb.duration_seconds, "outcome": cb.outcome, "provider": cb.provider,
                "call_session_id": str(cb.call_session_id) if cb.call_session_id else None}

    async def ensure_answerable(self, cb: Callback) -> None:
        if cb.status != CallbackStatus.DIALING:
            raise Conflict("This call is no longer ringing.")
