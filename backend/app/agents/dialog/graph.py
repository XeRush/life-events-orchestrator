"""Conversation graph for the simulated voice channel (LangGraph), mirroring the ElevenLabs Agent Workflow.

    (call start) DISCLOSURE  - fixed, non-skippable first utterance, written to the transcript
    each turn:   START -> EXCEPTION -> [handled] END
                                    -> ROUTER -> LANGUAGE | INTAKE | VERIFY | STATUS -> END

EXCEPTION is the Exception sub-agent (stop calling, distress, approval questions, disputed records, human request);
INTAKE and STATUS are the Intake and Status sub-agents; ROUTER is the Agent Workflows state router. Every fact the
agent states comes from a tool result - the graph never composes a status itself.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from app.agents.dialog import nlu
from app.agents.tools import ToolContext
from app.core.i18n import LANGUAGE_NAMES, normalise_lang, t
from app.models.enums import CallDirection, NodeState, SubAgent

if TYPE_CHECKING:
    from app.models.call import CallSession
    from app.models.user import User
    from app.services.container import ServiceContainer

INTAKE_STEPS = ("confirm_birth", "birth_date", "child_name", "emirate", "hospital", "father_name", "father_eid", "mother_name",
                "mother_eid", "nationality", "marriage", "consent_filing", "consent_callback")
PROMPTS = {"confirm_birth": "intake_open", "birth_date": "ask_birth_date", "child_name": "ask_child_name", "emirate": "ask_emirate",
           "hospital": "ask_hospital", "father_name": "ask_father_name", "father_eid": "ask_father_eid", "mother_name": "ask_mother_name",
           "mother_eid": "ask_mother_eid", "nationality": "ask_nationality", "marriage": "ask_marriage_certificate",
           "consent_filing": "ask_consent_filing", "consent_callback": "ask_consent"}


class DialogState(TypedDict, total=False):
    lang: str
    stage: str
    intake_step: str
    slots: dict[str, Any]
    verify_step: str
    awaiting: str | None
    utterance: str
    reply: list[str]
    tools: list[dict[str, Any]]
    sub_agent: str
    ended: bool
    transferred: bool
    handled: bool
    path: list[str]


@dataclass
class Engine:
    c: ServiceContainer
    call: CallSession
    user: User
    tool_log: list[dict[str, Any]] = field(default_factory=list)

    @property
    def ctx(self) -> ToolContext:
        return ToolContext(user=self.user, call=self.call, channel="SIMULATED")

    async def tool(self, name: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
        result = await self.c.tools.run(name, self.ctx, args or {})
        self.tool_log.append({"name": name, "ok": result.get("ok"), "error": result.get("error")})
        return result

    @property
    def eid_key(self) -> str:
        return f"intake:eid:{self.call.id}"


def _engine(config: RunnableConfig) -> Engine:
    return config["configurable"]["engine"]


def _say(state: DialogState, *parts: str) -> list[str]:
    return [*state.get("reply", []), *[p for p in parts if p]]


async def exception_node(state: DialogState, config: RunnableConfig) -> DialogState:
    e = _engine(config)
    u, lang = state["utterance"], state.get("lang", "en")
    s = nlu.exception_signals(u)
    has_case = e.call.case_id is not None
    path = [*state.get("path", []), "EXCEPTION"]
    if state.get("awaiting") in ("father_eid", "mother_eid") and not s.stop_calling:
        return {"handled": False, "path": path}
    if s.stop_calling:
        if has_case:
            r = await e.tool("cancel_callbacks", {"stop_calling": True})
            return {"handled": True, "ended": True, "reply": _say(state, r.get("say") or t("opt_out_done", lang, ref="")),
                    "sub_agent": SubAgent.EXCEPTION.value, "path": path}
        return {"handled": True, "ended": True, "reply": _say(state, t("consent_declined", lang)), "sub_agent": SubAgent.EXCEPTION.value, "path": path}
    reason, opener = None, None
    if s.distress:
        reason, opener = "DISTRESS", t("distress", lang)
    elif s.approval_question and state.get("stage") != "LANGUAGE":
        reason, opener = "APPROVAL_QUESTION", t("approval_question", lang)
    elif s.dispute and has_case and state.get("stage") == "STATUS":
        reason, opener = "DISPUTED_RECORD", t("disputed_record", lang)
    elif s.human:
        reason, opener = "RESIDENT_REQUEST", ""
    if reason is None:
        return {"handled": False, "path": path}
    if not has_case:
        return {"handled": True, "reply": _say(state, opener, t("no_case_transfer", lang)), "sub_agent": SubAgent.EXCEPTION.value, "path": path}
    r = await e.tool("request_human_transfer", {"reason": reason, "summary": f"Resident said: {u[:200]}"})
    return {"handled": True, "transferred": True, "ended": True, "reply": _say(state, opener, r.get("say", "")),
            "sub_agent": SubAgent.EXCEPTION.value, "path": path}


def route(state: DialogState) -> str:
    if state.get("handled"):
        return END
    return {"LANGUAGE": "LANGUAGE", "INTAKE": "INTAKE", "VERIFY": "VERIFY"}.get(state.get("stage", "STATUS"), "STATUS")


async def language_node(state: DialogState, config: RunnableConfig) -> DialogState:
    e = _engine(config)
    u = state["utterance"]
    chosen = nlu.language_choice(u)
    lang = normalise_lang(chosen or state.get("lang"))
    e.call.language = lang
    reply = [t("language_confirmed", lang, language=LANGUAGE_NAMES[lang])]
    content = not (chosen and len(u.split()) <= 3)  # "Arabic please" only picks a language; longer answers carry content
    path = [*state.get("path", []), "ROUTER", "LANGUAGE"]  # ROUTER = Agent Workflows state router
    if e.call.direction == CallDirection.OUTBOUND or (e.call.case_id and not e.call.verified):
        return {"lang": lang, "stage": "VERIFY", "verify_step": "dob", "reply": [*reply, t("verify_intro", lang), t("verify_q_dob", lang)],
                "sub_agent": SubAgent.ROUTER.value, "path": path}
    if e.call.case_id:
        status = await e.tool("get_case_status")
        return {"lang": lang, "stage": "STATUS", "reply": [*reply, status.get("summary", ""), t("anything_else", lang)],
                "sub_agent": SubAgent.STATUS.value, "path": path}
    if content and (nlu.has(u, "baby") or nlu.birth_date(u)):
        return await intake_node({**state, "lang": lang, "stage": "INTAKE", "intake_step": "confirm_birth", "reply": reply,
                                  "utterance": u, "path": path}, config)
    return {"lang": lang, "stage": "INTAKE", "intake_step": "confirm_birth", "reply": [*reply, t("intake_open", lang)],
            "sub_agent": SubAgent.INTAKE.value, "path": path}


def _next_step(slots: dict[str, Any], after: str | None) -> str | None:
    filled = {"birth_date": "dob", "child_name": "child_name", "emirate": "emirate", "hospital": "hospital", "father_name": "father_name",
              "father_eid": "father_eid_ok", "mother_name": "mother_name", "mother_eid": "mother_eid_ok", "nationality": "nationality",
              "marriage": "marriage_attested", "consent_filing": "consent_filing", "consent_callback": "consent_callback"}
    start = INTAKE_STEPS.index(after) + 1 if after in INTAKE_STEPS else 1
    for step in INTAKE_STEPS[start:]:
        if slots.get(filled[step]) is None:
            return step
    return None


async def intake_node(state: DialogState, config: RunnableConfig) -> DialogState:
    e = _engine(config)
    u, lang = state["utterance"], state.get("lang", "en")
    slots = dict(state.get("slots") or {})
    step = state.get("intake_step") or "confirm_birth"
    reply = list(state.get("reply", []))
    path = [*state.get("path", []), "INTAKE"]
    # opportunistic slot filling ("my daughter Aisha was born yesterday at Latifa Hospital in Dubai")
    if slots.get("dob") is None and (d := nlu.birth_date(u)) is not None:
        slots["dob"] = d.isoformat()
    if slots.get("emirate") is None and (em := nlu.emirate(u)):
        slots["emirate"] = em
    if slots.get("hospital") is None and (h := nlu.hospital(u)):
        slots["hospital"] = h
    advanced = True
    if step == "confirm_birth":
        yn = nlu.yes_no(u)
        if yn is False and not nlu.has(u, "baby"):
            return {"slots": slots, "stage": "STATUS", "reply": [*reply, t("intake_not_birth", lang)], "sub_agent": SubAgent.INTAKE.value, "path": path}
        reply.append(t("intake_congrats", lang))
    elif step == "birth_date":
        advanced = slots.get("dob") is not None
        if not advanced:
            reply.append(t("bad_birth_date", lang))
    elif step == "child_name":
        name = nlu.person_name(u)
        advanced = bool(name)
        slots["child_name"] = name
    elif step == "emirate":
        advanced = slots.get("emirate") is not None
    elif step == "hospital":
        slots["hospital"] = slots.get("hospital") or (u.strip().title()[:120] if len(u.strip()) > 2 else None)
        advanced = slots.get("hospital") is not None
    elif step in ("father_name", "mother_name"):
        slots[step] = nlu.person_name(u)
        advanced = bool(slots[step])
    elif step in ("father_eid", "mother_eid"):
        value = nlu.eid(u)
        if value:
            stored = await e.c.infra.cache.memory.get(e.eid_key) or {}
            stored[step.split("_")[0]] = value
            # Process memory only (never Redis, so never the append-only file), 30-minute TTL, never in the transcript or agent state.
            await e.c.infra.cache.memory.set(e.eid_key, stored, ttl=1800)
            slots[f"{step}_ok"] = True
            reply.append(t("eid_recorded", lang))
        else:
            advanced = False
            reply.append(t("eid_invalid", lang))
    elif step == "nationality":
        slots["nationality"] = nlu.nationality(u)
        advanced = bool(slots["nationality"])
    elif step == "marriage":
        yn = nlu.yes_no(u)
        advanced = yn is not None
        if yn is not None:
            slots["marriage_attested"] = yn
            if yn is False:
                reply.append(t("marriage_certificate_missing", lang))
    elif step == "consent_filing":
        yn = nlu.yes_no(u)
        advanced = yn is not None
        if yn is False:
            return {"slots": slots, "stage": "ENDED", "ended": True, "reply": [*reply, t("consent_filing_declined", lang)],
                    "sub_agent": SubAgent.INTAKE.value, "path": path}
        slots["consent_filing"] = yn
    elif step == "consent_callback":
        yn = nlu.yes_no(u)
        advanced = yn is not None
        if yn is not None:
            slots["consent_callback"] = yn
            if yn is False:
                reply.append(t("consent_declined", lang))
    if not advanced:
        if step not in ("father_eid", "mother_eid", "birth_date"):
            reply.append(t(PROMPTS[step], lang))
        return {"slots": slots, "intake_step": step, "reply": reply, "awaiting": step if step.endswith("_eid") else None,
                "sub_agent": SubAgent.INTAKE.value, "path": path}
    nxt = _next_step(slots, step)
    if nxt is not None:
        reply.append(t(PROMPTS[nxt], lang))
        return {"slots": slots, "intake_step": nxt, "reply": reply, "awaiting": nxt if nxt.endswith("_eid") else None,
                "sub_agent": SubAgent.INTAKE.value, "path": path}
    # BUILD_CASE: hand over to the orchestrator through the create_case tool
    eids = await e.c.infra.cache.memory.get(e.eid_key) or {}
    result = await e.tool("create_case", {
        "child_full_name_en": slots["child_name"], "child_date_of_birth": slots["dob"], "place_of_birth": slots["hospital"],
        "emirate": slots["emirate"], "child_nationality": slots["nationality"], "father_full_name": slots.get("father_name"),
        "mother_full_name": slots.get("mother_name"), "father_emirates_id": eids.get("father"), "mother_emirates_id": eids.get("mother"),
        "marriage_certificate_attested": slots.get("marriage_attested"), "consent_callback": bool(slots.get("consent_callback")),
        "consent_service_filing": True, "consent_data_processing": True, "language": lang,
    })
    await e.c.infra.cache.memory.delete(e.eid_key)
    if not result.get("ok"):
        return {"slots": slots, "stage": "INTAKE", "intake_step": "confirm_birth", "reply": [*reply, result.get("message", t("fallback", lang))],
                "sub_agent": SubAgent.INTAKE.value, "path": [*path, "BUILD_CASE"]}
    deadline = result["deadline"]
    nxt_action = t("plan_next_waiting_officer", lang) if slots.get("marriage_attested") is not False else t("plan_next_marriage", lang)
    reply += [result["say"], t("plan_next", lang, next=nxt_action),
              t("deadline", lang, date=deadline["deadline_date"], days=deadline["days_remaining"])]
    return {"slots": {k: v for k, v in slots.items() if not k.endswith("_ok")}, "stage": "STATUS", "intake_step": "done", "reply": reply,
            "sub_agent": SubAgent.INTAKE.value, "path": [*path, "BUILD_CASE"]}


async def verify_node(state: DialogState, config: RunnableConfig) -> DialogState:
    e = _engine(config)
    u, lang = state["utterance"], state.get("lang", "en")
    path = [*state.get("path", []), "ROUTER", "VERIFY"]
    if nlu.has(u, "uae_pass"):
        r = await e.tool("verify_callback", {"method": "UAE_PASS"})
        return await _after_verify(state, e, r, path, prefix=[t("uae_pass_sent", lang)])
    if state.get("verify_step") == "dob":
        await e.c.infra.cache.set(f"verify:dob:{e.call.id}", u[:60], ttl=600)
        return {"verify_step": "hospital", "reply": _say(state, t("verify_q_hospital", lang)), "sub_agent": SubAgent.ROUTER.value, "path": path}
    dob = await e.c.infra.cache.get(f"verify:dob:{e.call.id}") or ""
    await e.c.infra.cache.delete(f"verify:dob:{e.call.id}")
    r = await e.tool("verify_callback", {"method": "KNOWLEDGE_FACTS", "date_of_birth": dob, "hospital": u[:160]})
    return await _after_verify(state, e, r, path)


async def _after_verify(state: DialogState, e: Engine, r: dict[str, Any], path: list[str], prefix: list[str] | None = None) -> DialogState:
    lang = state.get("lang", "en")
    reply = _say(state, *(prefix or []), r.get("say", ""))
    if r.get("verified"):
        if e.call.callback_id:
            cb = await e.c.callbacks.get(e.call.callback_id)
            case = await e.c.cases_repo.get(cb.case_id)
            reply.append(e.c.callbacks.compose(case, cb.reasons, lang))
            if any(x["reason"] == "PARENT_INPUT" for x in cb.reasons):
                reply.append(t("consulate_ask", lang))
        else:
            status = await e.tool("get_case_status")
            reply.append(status.get("summary", ""))
        reply.append(t("anything_else", lang))
        return {"stage": "STATUS", "verify_step": "done", "reply": reply, "sub_agent": SubAgent.STATUS.value, "path": path}
    if r.get("escalated"):
        return {"stage": "ENDED", "ended": True, "transferred": True, "reply": reply, "sub_agent": SubAgent.EXCEPTION.value, "path": path}
    return {"verify_step": "dob", "reply": [*reply, t("verify_q_dob", lang)], "sub_agent": SubAgent.ROUTER.value, "path": path}


async def status_node(state: DialogState, config: RunnableConfig) -> DialogState:
    e = _engine(config)
    u, lang = state["utterance"], state.get("lang", "en")
    path = [*state.get("path", []), "ROUTER", "STATUS"]
    out: DialogState = {"sub_agent": SubAgent.STATUS.value, "path": path, "awaiting": None}
    if state.get("awaiting") == "passport_number":
        if nlu.yes_no(u) is True:
            r = await e.tool("report_consulate_milestone", {"milestone": "PASSPORT_ISSUED", "passport_number_present": True})
            return {**out, "reply": _say(state, r.get("say") or r.get("message", ""), t("anything_else", lang))}
        return {**out, "reply": _say(state, t("passport_number_later", lang), t("anything_else", lang))}
    milestone = nlu.consulate_milestone(u)
    if milestone:
        if milestone == "PASSPORT_ISSUED":
            return {**out, "awaiting": "passport_number", "reply": _say(state, t("ask_passport_number_present", lang))}
        r = await e.tool("report_consulate_milestone", {"milestone": milestone})
        return {**out, "reply": _say(state, r.get("say") or r.get("message", ""), t("anything_else", lang))}
    if nlu.has(u, "goodbye") and not nlu.has(u, "status"):
        return {**out, "ended": True, "reply": _say(state, t("goodbye", lang))}
    if nlu.has(u, "callback"):
        r = await e.tool("schedule_callback")
        return {**out, "reply": _say(state, t("callback_scheduled", lang) if r.get("ok") else r.get("message", ""))}
    if nlu.has(u, "fee"):
        r = await e.tool("get_knowledge_document", {"query": u})
        fee = r.get("fee")
        say = t("fee_known", lang, service=fee["label"], fee=fee["amount"], source=fee["source"]) if fee else t("fee_unknown", lang)
        return {**out, "reply": _say(state, say)}
    if nlu.has(u, "deadline"):
        r = await e.tool("get_case_status")
        if r.get("ok"):
            d = r["deadline"]
            return {**out, "reply": _say(state, t("deadline", lang, date=d["deadline_date"], days=d["days_remaining"]))}
        return {**out, "reply": _say(state, r.get("say") or r.get("message", ""))}
    if nlu.has(u, "documents"):
        r = await e.tool("get_required_documents")
        return {**out, "reply": _say(state, r.get("say") or r.get("message", ""))}
    if nlu.has(u, "next"):
        r = await e.tool("get_next_required_action")
        return {**out, "reply": _say(state, r.get("say") or r.get("message", ""))}
    if nlu.has(u, "consulate"):
        r = await e.tool("get_entity_status", {"node_key": "CONSULATE_PASSPORT"})
        say = r.get("say") or r.get("message", "")
        node = await e.c.nodes_repo.by_key(e.call.case_id, "CONSULATE_PASSPORT") if e.call.case_id else None
        if node is not None and node.state == NodeState.WAITING_FOR_PARENT:
            say = f"{say} {t('consulate_ask', lang)}"
        return {**out, "reply": _say(state, say)}
    if nlu.has(u, "timeline"):
        r = await e.tool("get_case_timeline", {"limit": 3})
        items = "; ".join(ev["title"] for ev in r.get("events", []))
        return {**out, "reply": _say(state, items or t("fallback", lang))}
    if nlu.has(u, "status") or nlu.has(u, "baby"):
        r = await e.tool("get_case_status")
        return {**out, "reply": _say(state, r.get("summary") or r.get("say") or r.get("message", ""))}
    return {**out, "reply": _say(state, t("fallback", lang))}


def build_graph():
    g = StateGraph(DialogState)
    g.add_node("EXCEPTION", exception_node)
    g.add_node("LANGUAGE", language_node)
    g.add_node("INTAKE", intake_node)
    g.add_node("VERIFY", verify_node)
    g.add_node("STATUS", status_node)
    g.add_edge(START, "EXCEPTION")
    g.add_conditional_edges("EXCEPTION", route, [END, "LANGUAGE", "INTAKE", "VERIFY", "STATUS"])
    for n in ("LANGUAGE", "INTAKE", "VERIFY", "STATUS"):
        g.add_edge(n, END)
    return g.compile()


GRAPH = build_graph()
