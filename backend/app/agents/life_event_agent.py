"""The LifeLoop Life Event Assistant.

Two roles:
1. Callback scripting - `compose_callback_script` turns backend-verified updates into what the voice agent says.
2. A backend-driven dialog engine (`respond`) that speaks the same tool contract as the ElevenLabs agent, used for
   the demo voice console and as the fallback when ElevenLabs is not configured. It never states a fact that did
   not come out of a tool call.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from app.agents.journey_planner import detect_life_event
from app.agents.tools import ToolRunner
from app.core.clock import utcnow
from app.core.i18n import detect_language, t
from app.models.conversation import Conversation
from app.models.user import User

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

YES = ("yes", "yeah", "yep", "sure", "please do", "go ahead", "proceed", "okay", "ok", "of course", "i consent", "i agree", "نعم", "أجل", "تمام", "موافق")
NO = ("no", "nope", "not now", "don't proceed", "do not proceed", "stop", "cancel", "لا")
DEFER = ("don't have", "do not have", "not right now", "not yet", "later", "can't find", "cannot find", "don't have it", "لا أملك", "ليس لدي")
PROVIDE = ("i have it", "have the document", "i've got", "i uploaded", "uploaded", "i sent", "here is", "here's the", "submitted", "attached", "it's ready", "i can provide")
STATUS = ("where are we", "status", "update", "progress", "how is", "how's", "where is my", "أين وصلنا", "ما الحالة")
NEXT = ("what's next", "what is next", "what next", "what happens next", "next step")
ACTIONS = ("what do i need", "need to do", "what's required", "what is required", "which document", "what document", "what's needed", "do i need")
TIMELINE = ("what happened", "history", "timeline", "recap")
PAUSE = ("pause", "put on hold")
RESUME = ("resume", "continue my case", "restart")
HUMAN = ("human", "officer", "real person", "speak to someone", "talk to someone", "escalate", "supervisor", "complain")
CALLBACK = ("call me", "call back", "callback", "ring me", "remind me")
CLOSE = ("close the case", "mark it complete", "mark complete", "close my case", "finish the case")
THANKS = ("thank", "thanks", "bye", "goodbye", "that's all", "شكرا", "شكراً")


def has(text: str, words: tuple[str, ...]) -> bool:
    return any(w in text for w in words)


def is_yes(text: str) -> bool:
    tokens = set(text.replace(",", " ").replace(".", " ").split())
    return any((w in tokens) if " " not in w else (w in text) for w in YES)


def is_no(text: str) -> bool:
    tokens = set(text.replace(",", " ").replace(".", " ").split())
    return any((w in tokens) if " " not in w else (w in text) for w in NO) and not has(text, DEFER)


@dataclass
class AgentReply:
    text: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    stage: str = "active"
    case_reference: str | None = None


class LifeEventAgent:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c
        self.tools = ToolRunner(c)

    # ---- outbound scripting --------------------------------------------------------------------
    def compose_callback_script(self, snapshot: dict[str, Any], updates: list[dict[str, Any]], lang: str = "en") -> str:
        parts = [t("cb_intro", lang, ref=snapshot["reference"])]
        parts += [u["text"] for u in updates]
        if snapshot["pending_actions"]:
            parts.append(t("action_needed", lang, action=snapshot["pending_actions"][0]["action"]))
            parts.append(t("cb_close_action", lang))
        else:
            if snapshot["progress"]["total"] and snapshot["status"] != "COMPLETED":
                parts.append(f"{snapshot['progress']['completed']} of {snapshot['progress']['total']} services are complete.")
            parts.append(t("cb_close_done", lang))
        return " ".join(parts)

    async def opening_message(self, user: User, conversation: Conversation, *, callback_script: str | None = None) -> str:
        lang = conversation.language
        if callback_script:
            return callback_script
        case = await self.c.cases.latest_active(user.id)
        if case:
            return f"{t('ai_intro', lang)} I can see your {case.title.lower()} case, {case.reference}. Would you like an update, or is there something new to report?"
        return f"{t('ai_intro', lang)} How can I help today?"

    # ---- dialog engine -------------------------------------------------------------------------
    async def _tool(self, user: User, conv: Conversation, name: str, args: dict[str, Any], calls: list[dict[str, Any]]) -> dict[str, Any]:
        result = await self.tools.run(name, user, args, conv)
        calls.append({"name": name, "args": args, "ok": result.get("ok", False)})
        return result

    async def respond(self, user: User, conv: Conversation, utterance: str) -> AgentReply:
        text = utterance.strip().lower()
        if detect_language(utterance) == "ar":
            conv.language = "ar"
        lang = conv.language
        state: dict[str, Any] = dict(conv.state or {})
        calls: list[dict[str, Any]] = []
        conv.transcript = [*(conv.transcript or []), {"role": "user", "text": utterance, "at": utcnow().isoformat()}]

        reply = await self._route(user, conv, text, utterance, state, calls, lang)
        conv.state = state
        conv.transcript = [*conv.transcript, {"role": "agent", "text": reply.text, "at": utcnow().isoformat(), "tools": [c["name"] for c in calls]}]
        reply.tool_calls = calls
        reply.stage = state.get("stage", "active")
        return reply

    async def _route(self, user, conv, text, raw, state, calls, lang) -> AgentReply:
        # 1) consent answer to a pending proposal
        pending = state.get("pending_event")
        if state.get("stage") == "awaiting_consent" and pending:
            if is_yes(text) and not is_no(text):
                res = await self._tool(user, conv, "create_life_event_case", {**pending, "consent_confirmed": True, "language": lang}, calls)
                state.update(stage="active", pending_event=None)
                return AgentReply(res.get("message", "Something went wrong creating the case."), case_reference=res.get("case_reference"))
            if is_no(text):
                state.update(stage="active", pending_event=None)
                return AgentReply(t("consent_declined", lang))

        # 2) a newly reported life event
        is_question = "?" in raw or has(text, STATUS + NEXT + ACTIONS + TIMELINE + DEFER + PROVIDE)
        detected = None if is_question else detect_life_event(raw, utcnow().date())
        if detected and detected.event_type == "BIRTH":
            child = next((p for p in detected.participants if p["role"] == "child"), {})
            state.update(
                stage="awaiting_consent",
                pending_event={"event_type": detected.event_type, "event_date": detected.event_date.isoformat() if detected.event_date else None,
                               "relationship": child.get("relationship", "child"), "resident_words": raw[:200]},
            )
            return AgentReply(t("consent_prompt", lang))
        if detected:  # other event types: definitions exist, but the prototype does not run them
            return AgentReply(f"I understand this is a {detected.event_type.replace('_', ' ').lower()} event. In this prototype only the birth journey is connected to government services, so I can't start it yet.")

        # 3) questions and actions about the persistent case
        if has(text, CLOSE):
            res = await self._tool(user, conv, "complete_case", {}, calls)
            return AgentReply(res["message"])
        if has(text, HUMAN):
            res = await self._tool(user, conv, "escalate_case", {"reason": "Resident asked for a human officer"}, calls)
            return AgentReply(res.get("message", t("no_case", lang)))
        if has(text, DEFER) or (state.get("awaiting_document") and is_no(text)):
            return await self._defer_document(user, conv, calls, lang)
        if has(text, PROVIDE):
            return await self._provide_document(user, conv, calls, lang)
        if has(text, PAUSE):
            res = await self._tool(user, conv, "pause_case", {}, calls)
            return AgentReply(res["message"])
        if has(text, RESUME):
            res = await self._tool(user, conv, "resume_case", {}, calls)
            return AgentReply(res["message"])
        if has(text, CALLBACK):
            when = "tomorrow" if "tomorrow" in text else "in 2 hours" if "hour" in text else None
            res = await self._tool(user, conv, "request_callback", {"reason": "Resident asked for a callback", "when": when}, calls)
            return AgentReply("Of course. I've scheduled a call for you." if res.get("ok") else res.get("message", t("no_case", lang)))
        if has(text, TIMELINE):
            res = await self._tool(user, conv, "get_case_timeline", {"limit": 5}, calls)
            if not res.get("ok"):
                return AgentReply(t("no_case", lang))
            recent = "; ".join(e["title"] for e in reversed(res["entries"]))
            return AgentReply(f"Here is what has happened most recently: {recent}.")
        if has(text, NEXT):
            res = await self._tool(user, conv, "get_case_status", {}, calls)
            if not res.get("ok"):
                return AgentReply(t("no_case", lang))
            waiting = [s["name"] for s in res["stages"] if s["status"] in {"PENDING", "BLOCKED", "READY"}]
            active = [f"{s['name']} with the {s['entity']}" for s in res["stages"] if s["status"] in {"SUBMITTED", "PROCESSING", "WAITING_FOR_ENTITY"}]
            bits = []
            if active:
                bits.append("Right now: " + ", ".join(active) + ".")
            if waiting:
                bits.append("Next up: " + ", ".join(waiting) + ". These begin automatically once the earlier steps are confirmed.")
            return AgentReply(" ".join(bits) or t("no_confirmed_update", lang))
        if has(text, ACTIONS):
            res = await self._tool(user, conv, "get_pending_actions", {}, calls)
            if not res.get("ok"):
                return AgentReply(t("no_case", lang))
            if res["actions"]:
                state["awaiting_document"] = True
                docs = await self._tool(user, conv, "get_required_documents", {}, calls)
                need = ", ".join(docs.get("outstanding", [])) or res["actions"][0]["action"]
                return AgentReply(f"{res['message']} The authority is asking for: {need}. I can record it as soon as you have it.")
            return AgentReply(res["message"])
        if has(text, STATUS):
            res = await self._tool(user, conv, "get_case_status", {}, calls)
            return AgentReply(res["summary"] if res.get("ok") else t("no_case", lang), case_reference=res.get("case_reference"))
        if has(text, THANKS):
            return AgentReply("You're welcome. I'll call you when something important changes.")
        return AgentReply(t("fallback", lang))

    async def _defer_document(self, user, conv, calls, lang) -> AgentReply:
        case = await self.c.cases.resolve(conv.case_id, user) if conv.case_id else await self.c.cases.latest_active(user.id)
        if not case:
            return AgentReply(t("no_case", lang))
        from app.models.enums import ActorType
        from app.models.enums import DomainEventType as E

        await self.c.publisher.case_event(
            E.RESIDENT_DEFERRED, case, actor="ai:voice-agent", actor_type=ActorType.AI_AGENT,
            metadata={"note": "Resident does not have the requested document yet. Case stays open."},
        )
        await self._tool(user, conv, "request_callback", {"reason": "Follow up on outstanding document", "when": "tomorrow"}, calls)
        return AgentReply(t("defer_doc", lang), case_reference=case.reference)

    async def _provide_document(self, user, conv, calls, lang) -> AgentReply:
        pending = await self._tool(user, conv, "get_required_documents", {}, calls)
        outstanding = [d for d in pending.get("documents", []) if d["status"] == "REQUESTED"]
        if not outstanding:
            return AgentReply("I don't see any outstanding document request on your case right now.")
        names = []
        for d in outstanding:
            res = await self._tool(user, conv, "record_document", {"document_type": d["type"], "name": d["name"]}, calls)
            if res.get("ok"):
                names.append(d["name"])
        return AgentReply(t("doc_recorded", lang, doc=", ".join(names)) if names else t("fallback", lang))
