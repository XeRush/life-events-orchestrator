"""Proactive callback engine: notification policy, coalescing, execution and completion."""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any

from sqlalchemy import select

from app.core.clock import utcnow
from app.core.errors import NotFound
from app.core.logging import get_logger
from app.integrations.elevenlabs.schemas import OutboundCallRequest
from app.models.callback import Callback
from app.models.conversation import Conversation
from app.models.enums import (
    ActorType,
    CallbackStatus,
    CaseStatus,
    ConsentType,
    ConversationChannel,
    ConversationStatus,
)
from app.models.enums import (
    DomainEventType as E,
)
from app.models.event import Event
from app.models.life_event_case import LifeEventCase
from app.models.user import User

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

log = get_logger("lifeloop.callbacks")


@dataclass
class CallbackDecision:
    kind: str
    reason: str
    text: str


class NotificationPolicy:
    """Decides whether a domain event is meaningful enough to phone the resident.

    Calls:   milestone completed, additional information needed, significant delay, resident-relevant replan,
             escalation, case completion.
    Silent:  PROCESSING, WAITING_FOR_DEPENDENCY/BLOCKED, ordinary delays, internal retries, task creation.
    """

    def __init__(self, delay_threshold_hours: int) -> None:
        self.delay_threshold_hours = delay_threshold_hours

    def decide(self, event: Event) -> CallbackDecision | None:
        m = event.event_metadata or {}
        name = m.get("task_name", "A service")
        entity = m.get("entity_name") or "the responsible authority"
        et = event.event_type
        if et == E.TASK_COMPLETED and not m.get("is_system"):
            label = m.get("completed_label") or f"{name} completed"
            return CallbackDecision("milestone", label, f"{name} has been confirmed as completed by the {entity}.")
        if et == E.DOCUMENT_REQUIRED:
            docs = ", ".join(d.get("name", d.get("type", "a document")) for d in m.get("documents", [])) or "additional information"
            return CallbackDecision("resident_action", f"{name} needs {docs}", f"The {entity} needs {docs} for {name}.")
        if et == E.TASK_DELAYED and int(m.get("delay_hours", 0) or 0) >= self.delay_threshold_hours:
            return CallbackDecision("significant_delay", f"{name} is significantly delayed",
                                    f"{name} is delayed at the {entity}, by about {m.get('delay_hours')} hours. Nothing is needed from you.")
        if et == E.WORKFLOW_REPLANNED and m.get("notify_resident"):
            return CallbackDecision("replanned", "Your workflow was adjusted", m.get("summary", "Your workflow was adjusted."))
        if et == E.CASE_ESCALATED:
            return CallbackDecision("escalation", "A human officer will review your case",
                                    "I've asked a human officer to review your case. They will follow up with you.")
        if et == E.CASE_COMPLETED:
            return CallbackDecision("case_complete", "Your case is complete", "All services in your case are now complete.")
        return None


class CallbackService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c
        self.policy = NotificationPolicy(c.settings.delay_significant_hours)

    # ---- decision ------------------------------------------------------------------------------
    async def on_event(self, event: Event) -> Callback | None:
        """Apply the notification policy to a domain event; schedule or coalesce a callback if warranted."""
        decision = self.policy.decide(event)
        if not decision or not event.case_id:
            return None
        case = await self.c.session.get(LifeEventCase, event.case_id)
        if case is None:
            return None
        if case.status == CaseStatus.PAUSED:
            log.info("callback_held_paused", case_id=str(case.id), kind=decision.kind)
            return None
        if not await self.c.consents.has_consent(case.id, ConsentType.CALLBACK_CONSENT):
            log.info("callback_suppressed_no_consent", case_id=str(case.id), kind=decision.kind)
            await self.c.timeline.record(
                case.id, "CALLBACK_SUPPRESSED", "Callback not placed", "No callback consent is on file for this case.",
                category="callback",
            )
            return None
        update = {"kind": decision.kind, "text": decision.text, "event_id": str(event.id), "event_type": event.event_type,
                  "task_key": (event.event_metadata or {}).get("task_key")}
        existing = await self.c.session.scalar(
            select(Callback).where(Callback.case_id == case.id, Callback.status == CallbackStatus.SCHEDULED)
            .where(Callback.trigger_event_type != "RESIDENT_REQUEST").order_by(Callback.created_at)
        )
        if existing:  # coalesce: one call carries every meaningful update since the last one
            updates = list(existing.payload.get("updates", []))
            if not any(u["event_id"] == update["event_id"] for u in updates):
                updates.append(update)
                existing.payload = {**existing.payload, "updates": updates}
                existing.reason = self._reason_for(updates)
            return existing
        callback = await self._create(
            case, reason=decision.reason, trigger=event.event_type, trigger_event_id=event.id, task_id=event.task_id,
            scheduled_for=utcnow() + timedelta(seconds=self.c.settings.callback_delay_seconds), updates=[update],
            idempotency_key=f"cb:{event.id}",
        )
        return callback

    @staticmethod
    def _reason_for(updates: list[dict[str, Any]]) -> str:
        labels = []
        for u in updates:
            labels.append(u["text"].split(" has been confirmed")[0] + " completed" if u["kind"] == "milestone" else u["text"])
        return "; ".join(labels[:3]) + (f" (+{len(labels) - 3} more)" if len(labels) > 3 else "")

    async def schedule_for_resident(self, case: LifeEventCase, *, reason: str, when: datetime | None = None, updates: list[dict[str, Any]] | None = None) -> Callback:
        """Explicit callback requested by the resident / operator (or the demo 'trigger callback')."""
        when = when or utcnow() + timedelta(seconds=self.c.settings.callback_delay_seconds)
        return await self._create(
            case, reason=reason, trigger="RESIDENT_REQUEST", trigger_event_id=None, task_id=None, scheduled_for=when,
            updates=updates or [], idempotency_key=f"cb:req:{case.id}:{uuid.uuid4().hex[:8]}",
        )

    async def _create(self, case: LifeEventCase, *, reason: str, trigger: str, trigger_event_id, task_id, scheduled_for: datetime,
                      updates: list[dict[str, Any]], idempotency_key: str) -> Callback:
        user = await self.c.session.get(User, case.user_id)
        callback = Callback(
            case_id=case.id, task_id=task_id, status=CallbackStatus.SCHEDULED, reason=reason, trigger_event_type=trigger,
            trigger_event_id=trigger_event_id, scheduled_for=scheduled_for, language=(user.preferred_language if user else "en"),
            payload={"updates": updates}, idempotency_key=idempotency_key,
        )
        self.c.session.add(callback)
        await self.c.session.flush()
        await self.c.publisher.case_event(
            E.CALLBACK_REQUIRED, case, actor="ai:callback-engine", actor_type=ActorType.AI_AGENT,
            metadata={"callback_id": str(callback.id), "reason": reason, "trigger": trigger},
        )
        return callback

    # ---- execution -----------------------------------------------------------------------------
    async def get(self, callback_id: uuid.UUID) -> Callback:
        cb = await self.c.session.get(Callback, callback_id)
        if not cb:
            raise NotFound("Callback not found")
        return cb

    async def execute_due(self, *, force: bool = False) -> list[Callback]:
        query = select(Callback).where(Callback.status == CallbackStatus.SCHEDULED)
        if not force:
            query = query.where(Callback.scheduled_for <= utcnow())
        done = []
        for cb in (await self.c.session.scalars(query.order_by(Callback.scheduled_for))).all():
            done.append(await self.execute(cb))
        return done

    async def execute(self, callback: Callback) -> Callback:
        """Place the call through the configured provider and record the conversation."""
        if callback.status not in {CallbackStatus.SCHEDULED, CallbackStatus.FAILED}:
            return callback
        case = await self.c.session.get(LifeEventCase, callback.case_id)
        user = await self.c.session.get(User, case.user_id)
        snapshot = await self.c.cases.snapshot(case)
        script = self.c.agent.compose_callback_script(snapshot, callback.payload.get("updates", []), callback.language)
        callback.status = CallbackStatus.IN_PROGRESS
        callback.started_at = utcnow()
        callback.attempts += 1
        conversation = Conversation(
            user_id=user.id, case_id=case.id, callback_id=callback.id, channel=ConversationChannel.VOICE_OUTBOUND,
            language=callback.language, transcript=[], state={"stage": "callback"}, started_at=utcnow(),
        )
        self.c.session.add(conversation)
        await self.c.session.flush()
        request = OutboundCallRequest(
            callback_id=str(callback.id), conversation_id=str(conversation.id), case_reference=case.reference,
            to_number=user.phone, language=callback.language, script=script,
            dynamic_variables={"resident_id": str(user.id), "case_reference": case.reference, "language": callback.language, "callback_reason": callback.reason},
        )
        result = await self.c.caller.place_call(request)
        callback.provider = result.provider
        callback.provider_call_id = result.call_id
        callback.conversation_id = conversation.id
        callback.payload = {**callback.payload, "script": script}
        conversation.provider = result.provider
        conversation.provider_conversation_id = result.call_id
        if result.status == "completed":
            conversation.transcript = [{**t, "at": utcnow().isoformat()} for t in result.transcript]
            await self.complete(callback, duration=result.duration_seconds or 0, outcome=result.outcome or "Completed")
        elif result.status == "initiated":
            log.info("callback_initiated", callback_id=str(callback.id), provider=result.provider)
        else:
            callback.status = CallbackStatus.FAILED if callback.attempts >= 3 else CallbackStatus.SCHEDULED
            callback.outcome = result.detail or "Call failed"
            callback.scheduled_for = utcnow() + timedelta(minutes=5)
            conversation.status = ConversationStatus.FAILED
            log.error("callback_failed", callback_id=str(callback.id), detail=result.detail, attempts=callback.attempts)
        return callback

    async def complete(self, callback: Callback, *, duration: float, outcome: str) -> Callback:
        if callback.status == CallbackStatus.COMPLETED:
            return callback
        callback.status = CallbackStatus.COMPLETED
        callback.completed_at = utcnow()
        callback.duration_seconds = duration
        callback.outcome = outcome
        if callback.conversation_id:
            conv = await self.c.session.get(Conversation, callback.conversation_id)
            if conv:
                conv.status = ConversationStatus.COMPLETED
                conv.ended_at = utcnow()
                conv.duration_seconds = duration
                conv.summary = callback.reason
        case = await self.c.session.get(LifeEventCase, callback.case_id)
        await self.c.publisher.case_event(
            E.CALLBACK_COMPLETED, case, actor="ai:callback-engine", actor_type=ActorType.AI_AGENT,
            metadata={"callback_id": str(callback.id), "reason": callback.reason, "duration_seconds": duration, "provider": callback.provider},
        )
        return callback

    async def list_callbacks(self, case_ids: list[uuid.UUID] | None, status: str | None = None, limit: int = 100, offset: int = 0) -> list[Callback]:
        q = select(Callback).order_by(Callback.scheduled_for.desc()).limit(limit).offset(offset)
        if case_ids is not None:
            q = q.where(Callback.case_id.in_(case_ids))
        if status:
            q = q.where(Callback.status == CallbackStatus(status))
        return list((await self.c.session.scalars(q)).all())
