"""Voice calls: start / answer / turn / end, the fixed disclosure, transcripts, and post-call processing.

Two transports, one product:
* ELEVENLABS - the browser (or a phone via Twilio) talks to the ElevenLabs agent; the agent calls our scoped tools;
  the post-call webhook writes the transcript, consent evidence and extracted fields back into the case.
* SIMULATED - the backend dialog graph answers each utterance using the same tools and guardrails.

Step 1 is always the disclosure: it is written as transcript turn 1 (is_disclosure) before anything else happens.
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from app.agents.dialog.graph import GRAPH, DialogState, Engine
from app.agents.guardrails import contains_disclosure
from app.core.clock import utcnow
from app.core.errors import Conflict, Forbidden, NotFound
from app.core.i18n import LANGUAGE_NAMES, LANGUAGE_NAMES_EN, normalise_lang, t
from app.core.pii import redact_text, redact_value
from app.events.recorder import Actor
from app.integrations.elevenlabs.client import ElevenLabsError
from app.models.call import AgentSession, CallSession, Transcript
from app.models.enums import (
    ACTIVE_CASE_STATES,
    CallbackStatus,
    CallDirection,
    CallProvider,
    CallState,
    ConsentType,
    IntegrationStatus,
    Source,
    SubAgent,
    TranscriptRole,
    UserRole,
)
from app.models.integration import IntegrationEvent
from app.models.user import User
from app.observability.logging import get_logger

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

log = get_logger("lifeloop.calls")


class CallService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    # --- helpers --------------------------------------------------------------------------------------------
    async def get(self, call_id: uuid.UUID, user: User | None = None) -> CallSession:
        call = await self.c.calls_repo.get(call_id)
        if call is None:
            raise NotFound("Call not found")
        if user is not None and user.role == UserRole.RESIDENT and call.user_id != user.id:
            raise NotFound("Call not found")
        if user is not None and user.role == UserRole.OFFICER and call.case_id:
            case = await self.c.cases_repo.get(call.case_id)
            if case is None or not self.c.access.can_view(user, case):
                raise NotFound("Call not found")
        return call

    async def _say(self, call: CallSession, role: TranscriptRole, text: str, *, sub_agent: SubAgent | None = None,
                   tool: str | None = None, disclosure: bool = False) -> Transcript:
        row = Transcript(call_session_id=call.id, case_id=call.case_id, seq=await self.c.calls_repo.next_seq(call.id), role=role,
                         text=redact_text(text) or "", language=call.language, sub_agent=sub_agent, tool_name=tool, is_disclosure=disclosure)
        self.c.session.add(row)
        await self.c.session.flush()
        return row

    async def _agent_session(self, call: CallSession) -> AgentSession:
        session = await self.c.calls_repo.agent_session(call.id)
        if session is None:
            session = AgentSession(call_session_id=call.id, case_id=call.case_id, graph="conversation", thread_id=f"call:{call.id}",
                                   state={"stage": "LANGUAGE", "lang": call.language}, path=[], steps=0, sub_agent=SubAgent.ROUTER)
            self.c.session.add(session)
            await self.c.session.flush()
        return session

    def _provider(self) -> CallProvider:
        voice = self.c.infra.voice_status()
        return CallProvider.ELEVENLABS if voice["provider"] == "elevenlabs" else CallProvider.SIMULATED

    async def _elevenlabs_session(self, call: CallSession, disclosure: str) -> dict[str, Any]:
        client = self.c.infra.elevenlabs
        case = await self.c.cases_repo.get(call.case_id) if call.case_id else None
        dynamic = {"lifeloop_call_id": str(call.id), "case_reference": case.reference if case else "", "language": call.language,
                   "verified": str(call.verified).lower()}
        try:
            signed_url = await client.get_signed_url(self.c.settings.elevenlabs_agent_id)
        except ElevenLabsError as exc:
            log.warning("elevenlabs_session_fallback", error=str(exc))
            call.provider = CallProvider.SIMULATED
            return {"provider": "simulated", "fallback_reason": f"ElevenLabs unavailable ({exc}); using the simulated dialog engine."}
        return {"provider": "elevenlabs", "signed_url": signed_url, "dynamic_variables": dynamic, "first_message": disclosure,
                "language": call.language}

    # --- lifecycle -----------------------------------------------------------------------------------------------
    async def start(self, user: User, *, case_ref: str | None = None, language: str | None = None) -> dict[str, Any]:
        if user.role != UserRole.RESIDENT:
            raise Forbidden("Calls are placed by residents. Officers see transcripts in the officer dashboard.")
        lang = normalise_lang(language or user.preferred_language)
        case = await self.c.access.case_for(user, case_ref) if case_ref else None
        if case is None:
            cases, _ = await self.c.cases_repo.page(self.c.cases_repo.for_resident(user.id).where(
                self.c.cases_repo.model.status.in_(ACTIVE_CASE_STATES)), limit=1)
            case = cases[0] if cases else None
        now = utcnow()
        call = CallSession(case_id=case.id if case else None, user_id=user.id, direction=CallDirection.INBOUND, provider=self._provider(),
                           language=lang, state=CallState.ACTIVE, started_at=now, verified=True, disclosure_at=now,
                           verification_method="AUTHENTICATED_SESSION")
        self.c.session.add(call)
        await self.c.session.flush()
        disclosure = t("disclosure", lang)
        await self._say(call, TranscriptRole.AGENT, disclosure, sub_agent=SubAgent.ROUTER, disclosure=True)
        await self._agent_session(call)
        await self.c.events.emit("CallStarted", case_id=call.case_id, actor=Actor.user(user), source=Source.RESIDENT,
                                 title="Resident called LifeLoop", description=f"Language: {LANGUAGE_NAMES_EN[lang]}. Disclosure delivered first.",
                                 payload={"call_session_id": str(call.id), "provider": call.provider.value, "direction": "INBOUND"},
                                 i18n={"key": "timeline.callStarted", "params": {"language": lang}})
        transport = await self._elevenlabs_session(call, disclosure) if call.provider == CallProvider.ELEVENLABS else {
            "provider": "simulated", "fallback_reason": None if not self.c.settings.elevenlabs_configured else "ElevenLabs unavailable"}
        return {"call": await self.view(call), "transport": transport}

    async def inbound_phone(self, *, caller_id: str, called_number: str | None, call_sid: str | None) -> dict[str, Any]:
        """ElevenLabs conversation-initiation webhook for a call to the life-event number (Twilio / SIP).

        Binds the phone call to a resident (matched by caller ID, or a phone-only resident is created so a first-time
        caller can open a case), creates the CallSession up front and returns the dynamic variables the agent's server
        tools need. Telephone callers are NOT verified: case details require UAE Pass or two facts from the case file.
        """
        import hashlib

        from app.core.pii import digits, mask_phone

        caller = digits(caller_id)
        if len(caller) < 7:
            raise Forbidden("Caller ID is required for the life-event line.")
        residents = (await self.c.session.scalars(self.c.users_repo.search(role=UserRole.RESIDENT).where(User.phone.is_not(None)))).all()
        user = next((u for u in residents if digits(u.phone or "")[-9:] == caller[-9:]), None)
        if user is None:
            user = User(email=f"phone-{hashlib.sha256(caller.encode()).hexdigest()[:16]}@phone.lifeloop.local", hashed_password=None,
                        full_name=f"Caller {mask_phone(caller_id)}", role=UserRole.RESIDENT, phone=f"+{caller}", is_active=True)
            self.c.session.add(user)
            await self.c.session.flush()
        cases, _ = await self.c.cases_repo.page(self.c.cases_repo.for_resident(user.id).where(
            self.c.cases_repo.model.status.in_(ACTIVE_CASE_STATES)), limit=1)
        case = cases[0] if cases else None
        lang = normalise_lang(case.language if case else user.preferred_language)
        now = utcnow()
        call = CallSession(case_id=case.id if case else None, user_id=user.id, direction=CallDirection.INBOUND, provider=CallProvider.ELEVENLABS,
                           language=lang, state=CallState.ACTIVE, started_at=now, verified=False, disclosure_at=now,
                           extracted_fields={"channel": "TELEPHONY", "twilio_call_sid": (call_sid or "")[:64], "called_number": mask_phone(called_number)})
        self.c.session.add(call)
        await self.c.session.flush()
        await self._say(call, TranscriptRole.AGENT, t("disclosure", lang), sub_agent=SubAgent.ROUTER, disclosure=True)
        await self._agent_session(call)
        await self.c.events.emit("CallStarted", case_id=call.case_id, actor=Actor.provider("ElevenLabs telephony"), source=Source.RESIDENT,
                                 title="Resident called the life-event line", description="Telephone call; caller must verify before case details are shared.",
                                 payload={"call_session_id": str(call.id), "provider": "ELEVENLABS", "direction": "INBOUND", "channel": "TELEPHONY"},
                                 i18n={"key": "timeline.callStartedPhone", "params": {"language": lang}})
        return {"type": "conversation_initiation_client_data",
                "dynamic_variables": {"lifeloop_call_id": str(call.id), "case_reference": case.reference if case else "", "language": lang,
                                      "verified": "false"},
                "conversation_config_override": {"agent": {"language": lang, "first_message": t("disclosure", lang)}}}

    async def answer(self, user: User, call_id: uuid.UUID) -> dict[str, Any]:
        call = await self.get(call_id, user)
        if call.direction != CallDirection.OUTBOUND or call.state != CallState.RINGING:
            raise Conflict("This call is not ringing.")
        call.state, call.started_at, call.disclosure_at = CallState.ACTIVE, utcnow(), utcnow()
        case = await self.c.cases_repo.get(call.case_id)
        disclosure = t("disclosure_callback", call.language, ref=case.reference if case else "")
        await self._say(call, TranscriptRole.AGENT, disclosure, sub_agent=SubAgent.ROUTER, disclosure=True)
        await self._agent_session(call)
        transport = await self._elevenlabs_session(call, disclosure) if call.provider == CallProvider.ELEVENLABS else {"provider": "simulated"}
        return {"call": await self.view(call), "transport": transport}

    async def turn(self, user: User, call_id: uuid.UUID, utterance: str) -> dict[str, Any]:
        call = await self.get(call_id, user)
        if call.state != CallState.ACTIVE:
            raise Conflict("This call has ended.")
        if call.provider == CallProvider.ELEVENLABS:
            raise Conflict("This call is handled by ElevenLabs; typed turns are for the simulated channel.")
        if call.muted:
            raise Conflict("You are muted. Unmute to speak.")
        await self._say(call, TranscriptRole.RESIDENT, utterance)
        session = await self._agent_session(call)
        engine = Engine(self.c, call, user)
        state: DialogState = {**(session.state or {}), "utterance": utterance, "reply": [], "path": [], "handled": False,
                              "ended": False, "transferred": False}
        state.setdefault("lang", call.language)
        with self.c.infra.tracer.span("langgraph.conversation.turn", kind="agent", case_id=str(call.case_id) if call.case_id else None,
                                      session_id=str(call.id), input={"utterance": utterance},
                                      metadata={"stage": state.get("stage"), "language": state.get("lang")}) as span:
            result: DialogState = await GRAPH.ainvoke(state, config={"configurable": {"engine": engine}})
            reply = " ".join(p for p in result.get("reply", []) if p).strip() or t("fallback", call.language)
            span.update(output={"reply": reply, "tools": [x["name"] for x in engine.tool_log], "path": result.get("path")})
        call.language = result.get("lang", call.language)
        call.sub_agent = SubAgent(result.get("sub_agent") or SubAgent.ROUTER.value)
        await self._say(call, TranscriptRole.AGENT, reply, sub_agent=call.sub_agent,
                        tool=",".join(x["name"] for x in engine.tool_log)[:60] or None)
        keep = {k: v for k, v in result.items() if k in ("lang", "stage", "intake_step", "slots", "verify_step", "awaiting")}
        session.state, session.case_id = keep, call.case_id
        session.sub_agent, session.current_node = call.sub_agent, (result.get("path") or ["END"])[-1]
        session.path = [*(session.path or []), {"at": utcnow().isoformat(), "path": result.get("path", []),
                                                "tools": [x["name"] for x in engine.tool_log]}][-60:]
        session.steps += 1
        if result.get("ended"):
            await self._finish(call, outcome="Transferred to an Amer officer" if result.get("transferred") else "Call completed")
        case = await self.c.cases_repo.get(call.case_id) if call.case_id else None
        return {"reply": reply, "tool_calls": engine.tool_log, "stage": keep.get("stage"), "sub_agent": call.sub_agent.value,
                "ended": bool(result.get("ended")), "transferred": call.state == CallState.TRANSFERRED or bool(result.get("transferred")),
                "language": call.language, "case_reference": case.reference if case else None, "verified": call.verified}

    async def _finish(self, call: CallSession, outcome: str) -> None:
        if call.state in (CallState.ENDED, CallState.FAILED):
            return
        call.state = CallState.TRANSFERRED if call.state == CallState.TRANSFERRED else CallState.ENDED
        call.ended_at = utcnow()
        call.duration_seconds = round((call.ended_at - call.started_at).total_seconds(), 1)
        call.outcome = outcome
        if call.callback_id:
            cb = await self.c.callbacks_repo.get(call.callback_id)
            if cb and cb.status in (CallbackStatus.DIALING, CallbackStatus.SCHEDULED):
                cb.call_session_id = call.id
                await self.c.callbacks.complete(cb, duration=call.duration_seconds, outcome=outcome)
        session = await self.c.calls_repo.agent_session(call.id)
        if session is not None:
            session.status, session.ended_at = "ENDED", utcnow()
        await self.c.events.emit("CallEnded", case_id=call.case_id, actor=Actor.agent(), source=Source.AI_AGENT,
                                 title=f"Call ended ({int(call.duration_seconds or 0)}s)", description=outcome,
                                 payload={"call_session_id": str(call.id), "direction": call.direction.value, "state": call.state.value},
                                 i18n={"key": "timeline.callEnded", "params": {"seconds": str(int(call.duration_seconds or 0)),
                                                                              "direction": call.direction.value}})

    async def end(self, user: User, call_id: uuid.UUID) -> dict[str, Any]:
        call = await self.get(call_id, user)
        if call.state == CallState.RINGING:
            call.state, call.ended_at, call.outcome = CallState.ENDED, utcnow(), "Declined by the resident"
            if call.callback_id:
                cb = await self.c.callbacks_repo.get(call.callback_id)
                if cb and cb.status == CallbackStatus.DIALING:
                    cb.status, cb.outcome, cb.completed_at = CallbackStatus.NO_ANSWER, "Declined in the app", utcnow()
        else:
            await self._finish(call, "Call ended by the resident")
        return await self.view(call)

    async def set_muted(self, user: User, call_id: uuid.UUID, muted: bool) -> dict[str, Any]:
        call = await self.get(call_id, user)
        call.muted = muted
        return await self.view(call)

    async def change_language(self, user: User, call_id: uuid.UUID, language: str) -> dict[str, Any]:
        call = await self.get(call_id, user)
        lang = normalise_lang(language)
        call.language = lang
        session = await self._agent_session(call)
        session.state = {**(session.state or {}), "lang": lang}
        reply = t("language_confirmed", lang, language=LANGUAGE_NAMES[lang])
        await self._say(call, TranscriptRole.AGENT, reply, sub_agent=SubAgent.ROUTER)
        if call.case_id:
            case = await self.c.cases_repo.get(call.case_id)
            if case is not None:
                case.language = lang
        return {"reply": reply, "call": await self.view(call)}

    async def push_transcript(self, user: User, call_id: uuid.UUID, messages: list[dict[str, str]], provider_conversation_id: str | None) -> None:
        """Browser-side ElevenLabs sessions stream their transcript for the live console (the webhook is authoritative)."""
        call = await self.get(call_id, user)
        if provider_conversation_id and not call.provider_conversation_id:
            call.provider_conversation_id = provider_conversation_id
        for m in messages[:20]:
            await self._say(call, TranscriptRole.AGENT if m.get("role") == "agent" else TranscriptRole.RESIDENT, m.get("text", "")[:2000])

    # --- views --------------------------------------------------------------------------------------------------
    async def view(self, call: CallSession, include_transcript: bool = True) -> dict[str, Any]:
        case = await self.c.cases_repo.get(call.case_id) if call.case_id else None
        transcript = await self.c.calls_repo.transcript(call.id) if include_transcript else []
        session = await self.c.calls_repo.agent_session(call.id)
        return {
            "id": str(call.id), "case_id": str(call.case_id) if call.case_id else None, "case_reference": case.reference if case else None,
            "direction": call.direction.value, "provider": call.provider.value, "state": call.state.value, "language": call.language,
            "sub_agent": call.sub_agent.value, "verified": call.verified, "verification_method": call.verification_method, "muted": call.muted,
            "callback_id": str(call.callback_id) if call.callback_id else None, "started_at": call.started_at.isoformat(),
            "ended_at": call.ended_at.isoformat() if call.ended_at else None, "duration_seconds": call.duration_seconds,
            "outcome": call.outcome, "summary": call.summary, "extracted_fields": call.extracted_fields,
            "disclosure_at": call.disclosure_at.isoformat() if call.disclosure_at else None,
            "agent": {"stage": (session.state or {}).get("stage") if session else None, "current_node": session.current_node if session else None,
                      "steps": session.steps if session else 0},
            "transcript": [{"seq": x.seq, "role": x.role.value, "text": x.text, "sub_agent": x.sub_agent.value if x.sub_agent else None,
                            "tool": x.tool_name, "is_disclosure": x.is_disclosure, "at": x.created_at.isoformat()} for x in transcript],
        }

    # --- post-call webhook (consumer side) ------------------------------------------------------------------------
    async def process_post_call(self, integration_event_id: uuid.UUID) -> None:
        event = await self.c.session.get(IntegrationEvent, integration_event_id)
        if event is None or event.status != IntegrationStatus.RECEIVED:
            return
        data = event.payload or {}
        dyn = (data.get("conversation_initiation_client_data") or {}).get("dynamic_variables") or data.get("dynamic_variables") or {}
        call = None
        if dyn.get("lifeloop_call_id"):
            try:
                call = await self.c.calls_repo.get(uuid.UUID(str(dyn["lifeloop_call_id"])))
            except ValueError:
                call = None
        if call is None and data.get("conversation_id"):
            call = await self.c.calls_repo.by_provider_id(str(data["conversation_id"]))
        if call is None:
            event.status, event.error, event.processed_at = IntegrationStatus.FAILED, "No matching call session", utcnow()
            return
        call.provider = CallProvider.ELEVENLABS
        call.provider_conversation_id = call.provider_conversation_id or data.get("conversation_id")
        existing = await self.c.calls_repo.transcript(call.id)
        if len(existing) <= 1:
            for turn in data.get("transcript") or []:
                if turn.get("message"):
                    await self._say(call, TranscriptRole.AGENT if turn.get("role") == "agent" else TranscriptRole.RESIDENT, turn["message"])
        agent_turns = [x for x in await self.c.calls_repo.transcript(call.id) if x.role == TranscriptRole.AGENT]
        if not agent_turns or not contains_disclosure(agent_turns[0].text):
            await self.c.events.audit("DisclosureMissing", actor=Actor.provider("ElevenLabs"), case_id=call.case_id, result="VIOLATION",
                                      source=Source.AI_AGENT, details={"call_session_id": str(call.id)})
        analysis = data.get("analysis") or {}
        call.summary = redact_text(analysis.get("transcript_summary"))
        results = analysis.get("data_collection_results") or {}
        call.extracted_fields = redact_value({k: (v.get("value") if isinstance(v, dict) else v) for k, v in results.items()})
        case = await self.c.cases_repo.get(call.case_id) if call.case_id else None
        consent_value = call.extracted_fields.get("consent_callback")
        if case is not None and str(consent_value).lower() in ("true", "yes", "1"):
            user = await self.c.users_repo.get(case.resident_id)
            if user is not None:
                await self.c.consents.capture(case, user, ConsentType.CALLBACK, source="VOICE_TOOL", actor=Actor.provider("ElevenLabs post-call"),
                                              call_session_id=call.id, evidence={"provider_conversation_id": call.provider_conversation_id})
        duration = (data.get("metadata") or {}).get("call_duration_secs")
        if duration:
            call.started_at = call.started_at or utcnow()
        await self._finish(call, "Completed (ElevenLabs post-call webhook)")
        if duration:
            call.duration_seconds = float(duration)
        event.status, event.processed_at, event.case_id = IntegrationStatus.PROCESSED, utcnow(), call.case_id
        if call.case_id:
            await self.c.events.emit("PostCallProcessed", case_id=call.case_id, actor=Actor.provider("ElevenLabs"), source=Source.AI_AGENT,
                                     title="Post-call webhook processed", description="Transcript, consent evidence and extracted fields written to the case.",
                                     payload={"call_session_id": str(call.id), "fields": sorted(call.extracted_fields)},
                                     idempotency_key=f"postcall-processed:{event.id}", i18n={"key": "timeline.postCallProcessed", "params": {}})
