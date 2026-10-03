"""Scoped agent tools - the ONLY way the voice agent (ElevenLabs or the simulated engine) touches the system.

Every tool: validates input (Pydantic), authorises (the call is bound to one resident and one case; case-revealing
tools require a verified caller on callbacks), logs, traces (Langfuse/local), audits (AgentToolCalled), and returns
structured output. There is deliberately no approve / release / reject tool: those belong to officers only.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel, Field, ValidationError

from app.core.errors import DomainError, Forbidden
from app.core.i18n import normalise_lang, t
from app.events.recorder import Actor
from app.models.call import CallSession
from app.models.case import Case
from app.models.enums import DONE_STATES, ConsentType, EscalationReason, NodeState, NodeType, Source, UserRole
from app.models.user import User
from app.observability import metrics
from app.observability.logging import get_logger

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

log = get_logger("lifeloop.tools")


class NoArgs(BaseModel):
    pass


class NodeArg(BaseModel):
    node_key: Literal["BIRTH_CERTIFICATE", "MOFA_ATTESTATION", "CONSULATE_PASSPORT", "RESIDENCE_VISA", "EMIRATES_ID", "INSURANCE"]


class DocsArg(BaseModel):
    node_key: str | None = None


class CreateCaseArgs(BaseModel):
    child_full_name_en: str = Field(min_length=2, max_length=160)
    child_date_of_birth: date
    place_of_birth: str = Field(min_length=2, max_length=160)
    emirate: str = "DUBAI"
    child_nationality: str = Field(min_length=2, max_length=60)
    father_full_name: str | None = Field(default=None, max_length=160)
    mother_full_name: str | None = Field(default=None, max_length=160)
    father_emirates_id: str | None = Field(default=None, max_length=24)
    mother_emirates_id: str | None = Field(default=None, max_length=24)
    marriage_certificate_attested: bool | None = None
    consent_callback: bool = False
    consent_service_filing: bool = True
    consent_data_processing: bool = True
    language: str = "en"


class ConsentArgs(BaseModel):
    consent_type: Literal["CALLBACK", "DATA_PROCESSING", "SERVICE_FILING"] = "CALLBACK"


class VerifyArgs(BaseModel):
    method: Literal["UAE_PASS", "KNOWLEDGE_FACTS"]
    date_of_birth: str | None = Field(default=None, max_length=60)
    hospital: str | None = Field(default=None, max_length=160)
    uae_pass_approved: bool = True


class ConsulateArgs(BaseModel):
    milestone: Literal["APPOINTMENT_BOOKED", "APPLICATION_SUBMITTED", "PASSPORT_ISSUED", "DELAYED"]
    passport_number_present: bool = False
    appointment_date: date | None = None
    notes: str | None = Field(default=None, max_length=500)


class TransferArgs(BaseModel):
    reason: Literal["DISTRESS", "APPROVAL_QUESTION", "DISPUTED_RECORD", "RESIDENT_REQUEST"] = "RESIDENT_REQUEST"
    summary: str = Field(default="", max_length=500)


class TimelineArgs(BaseModel):
    limit: int = Field(default=5, ge=1, le=20)


class KnowledgeArgs(BaseModel):
    query: str = Field(min_length=2, max_length=200)


class StopArgs(BaseModel):
    stop_calling: bool = True


@dataclass
class ToolContext:
    user: User
    call: CallSession | None
    channel: str  # SIMULATED | ELEVENLABS | WEB
    case: Case | None = None

    @property
    def lang(self) -> str:
        return normalise_lang(self.call.language if self.call else self.user.preferred_language)


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    args: type[BaseModel]
    needs_case: bool
    needs_verified: bool
    handler: str


SPECS: tuple[ToolSpec, ...] = (
    ToolSpec("get_case_status", "Where the case stands: every node's state and its source. Never improvise a status.", NoArgs, True, True, "_status"),
    ToolSpec("get_next_required_action", "The single next action and who owns it (parent, officer, authority).", NoArgs, True, True, "_next"),
    ToolSpec("get_required_documents", "Documents still needed, optionally for one node.", DocsArg, True, True, "_documents"),
    ToolSpec("create_case", "Create the case once intake is confirmed. Emirates IDs are hashed; never repeat them.", CreateCaseArgs, False, False, "_create_case"),
    ToolSpec("capture_consent", "Record consent (CALLBACK issues the token the callback engine needs).", ConsentArgs, True, False, "_consent"),
    ToolSpec("verify_callback", "Verify the caller: UAE Pass one-tap, or child's date of birth + hospital. Never ask for ID numbers.", VerifyArgs, True, False, "_verify"),
    ToolSpec("submit_birth_certificate_request", "Prepare the birth certificate filing for officer release.", NoArgs, True, True, "_prep_bc"),
    ToolSpec("submit_mofa_request", "Prepare the MOFA attestation filing for officer release.", NoArgs, True, True, "_prep_mofa"),
    ToolSpec("submit_visa_request", "Prepare the residence visa filing for officer release.", NoArgs, True, True, "_prep_visa"),
    ToolSpec("submit_emirates_id_request", "Prepare the Emirates ID filing for officer release.", NoArgs, True, True, "_prep_eid"),
    ToolSpec("submit_insurance_request", "Prepare the insurance endorsement for officer release.", NoArgs, True, True, "_prep_ins"),
    ToolSpec("get_entity_status", "The authority's last confirmed status for one node (consulate: parent-reported only).", NodeArg, True, True, "_entity_status"),
    ToolSpec("report_consulate_milestone", "Record what the PARENT reports about the consulate passport. Never claim it yourself.", ConsulateArgs, True, True, "_consulate"),
    ToolSpec("schedule_callback", "Schedule a status callback (consent and opt-out are enforced).", NoArgs, True, False, "_callback"),
    ToolSpec("cancel_callbacks", "'Stop calling': opt out, cancel callbacks, switch the case to SMS-only. Always allowed.", StopArgs, True, False, "_stop"),
    ToolSpec("request_human_transfer", "Warm transfer to the case's Amer officer (distress, approval questions, disputes).", TransferArgs, True, False, "_transfer"),
    ToolSpec("get_case_timeline", "The most recent case events with their source.", TimelineArgs, True, True, "_timeline"),
    ToolSpec("get_knowledge_document", "Search the read-only knowledge base (requirements, sourced fees, the 120-day rule).", KnowledgeArgs, False, False, "_knowledge"),
)
BY_NAME = {s.name: s for s in SPECS}
PREP_NODES = {"_prep_bc": "BIRTH_CERTIFICATE", "_prep_mofa": "MOFA_ATTESTATION", "_prep_visa": "RESIDENCE_VISA",
              "_prep_eid": "EMIRATES_ID", "_prep_ins": "INSURANCE"}


class ToolRegistry:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    @staticmethod
    def catalog() -> list[dict[str, Any]]:
        return [{"name": s.name, "description": s.description, "parameters": s.args.model_json_schema(),
                 "requires_case": s.needs_case, "requires_verified_caller": s.needs_verified} for s in SPECS]

    async def run(self, name: str, ctx: ToolContext, args: dict[str, Any] | None = None) -> dict[str, Any]:
        spec = BY_NAME.get(name)
        actor = Actor.agent("ElevenLabs voice agent" if ctx.channel == "ELEVENLABS" else "LifeLoop voice agent")
        if spec is None:
            await self.c.events.audit("AgentToolDenied", actor=actor, result="DENIED", source=Source.AI_AGENT, details={"tool": name})
            metrics.TOOL_CALLS.labels(name[:40], "unknown").inc()
            return {"ok": False, "error": "unknown_tool", "message": "That action is not available to the agent."}
        if ctx.user.role != UserRole.RESIDENT and ctx.call is None:
            raise Forbidden("Agent tools act on behalf of a resident in a call")
        try:
            data = spec.args.model_validate(args or {})
        except ValidationError as exc:
            metrics.TOOL_CALLS.labels(name, "invalid").inc()
            return {"ok": False, "error": "invalid_arguments", "message": exc.errors(include_url=False)[0]["msg"]}
        case = ctx.case
        if case is None and ctx.call is not None and ctx.call.case_id:
            case = await self.c.cases_repo.get(ctx.call.case_id)
        if spec.needs_case:
            if case is None:
                return {"ok": False, "error": "no_case", "message": "There is no case on this call yet."}
            if case.resident_id != ctx.user.id:
                await self.c.events.audit("AgentToolDenied", actor=actor, case_id=case.id, result="DENIED", details={"tool": name, "why": "ownership"})
                return {"ok": False, "error": "forbidden", "message": "This call is not authorised for that case."}
        if spec.needs_verified and ctx.call is not None and not ctx.call.verified:
            metrics.TOOL_CALLS.labels(name, "needs_verification").inc()
            return {"ok": False, "error": "verification_required", "say": t("verify_intro", ctx.lang)}
        ctx.case = case
        with self.c.infra.tracer.span(f"tool.{name}", kind="tool", case_id=str(case.id) if case else None,
                                      session_id=str(ctx.call.id) if ctx.call else None, input=data.model_dump(mode="json"),
                                      metadata={"tool": name, "channel": ctx.channel}) as span:
            try:
                handler: Callable[[ToolContext, Any], Awaitable[dict[str, Any]]] = getattr(self, spec.handler)
                result = {"ok": True, **await handler(ctx, data)}
                outcome = "ok"
            except DomainError as exc:
                result = {"ok": False, "error": exc.code, "message": exc.message}
                outcome = "error"
            span.update(output={k: v for k, v in result.items() if k in ("ok", "error", "state", "reference")})
        metrics.TOOL_CALLS.labels(name, outcome).inc()
        await self.c.events.emit("AgentToolCalled", case_id=ctx.case.id if ctx.case else None, actor=actor, source=Source.AI_AGENT,
                                 timeline=False, payload={"tool": name, "ok": result["ok"], "channel": ctx.channel,
                                 "arguments": sorted((args or {}).keys()), "call_session_id": str(ctx.call.id) if ctx.call else None})
        log.info("agent_tool_called", tool=name, ok=result["ok"], channel=ctx.channel)
        return result

    # --- handlers -------------------------------------------------------------------------------------------
    async def _status(self, ctx: ToolContext, _: NoArgs) -> dict[str, Any]:
        case = ctx.case
        nodes = await self.c.nodes_repo.for_case(case.id)
        return {
            "reference": case.reference, "summary": await self.c.cases.summary_sentence(case, ctx.lang),
            "progress": {"done": sum(1 for n in nodes if n.state in DONE_STATES), "total": len(nodes)},
            "deadline": self.c.cases.deadline(case),
            "nodes": [{"key": n.key, "title": n.title, "state": n.state.value, "status": n.status, "source": n.status_source.value,
                       "entity": n.entity_label, "official": n.type == NodeType.ENTITY_FILING and n.status_source == Source.GOVERNMENT_MOCK}
                      for n in nodes],
            "rules": "Only describe states listed here. CLEARED/COMPLETED from GOVERNMENT_MOCK are the authority's (mock) confirmations; "
                     "PARENT_REPORTED is what the parent told LifeLoop; anything else is not cleared yet.",
        }

    async def _next(self, ctx: ToolContext, _: NoArgs) -> dict[str, Any]:
        view = await self.c.cases.view(ctx.case, ctx.user, ctx.lang)
        action = view["next_action"]
        say = t("action_needed", ctx.lang, action=action["text"]) if action and action["owner"] == "PARENT" else t("no_action", ctx.lang)
        return {"next_action": action, "outstanding_documents": view["outstanding_documents"], "say": say}

    async def _documents(self, ctx: ToolContext, data: DocsArg) -> dict[str, Any]:
        docs = await self.c.docs_repo.for_case(ctx.case.id)
        if data.node_key:
            node = await self.c.nodes_repo.by_key(ctx.case.id, data.node_key)
            wanted = set(node.required_documents) if node else set()
            docs = [d for d in docs if d.doc_type in wanted]
        outstanding = [d.title for d in docs if d.required and d.status.value in ("MISSING", "EXPIRED")]
        return {"documents": [{"title": d.title, "status": d.status.value, "required": d.required} for d in docs],
                "outstanding": outstanding,
                "say": t("documents_needed", ctx.lang, docs=", ".join(outstanding)) if outstanding else t("documents_none", ctx.lang)}

    async def _create_case(self, ctx: ToolContext, data: CreateCaseArgs) -> dict[str, Any]:
        from app.schemas.cases import IntakeIn

        intake = IntakeIn(**data.model_dump())
        case, created = await self.c.cases.create_from_intake(ctx.user, intake, channel="VOICE", actor=Actor.agent(),
                                                             call_session_id=ctx.call.id if ctx.call else None)
        if ctx.call is not None:
            ctx.call.case_id = case.id
        ctx.case = case
        return {"reference": case.reference, "created": created, "deadline": self.c.cases.deadline(case),
                "say": t("intake_summary", ctx.lang, ref=case.reference) + " " + t("plan_explained", ctx.lang)}

    async def _consent(self, ctx: ToolContext, data: ConsentArgs) -> dict[str, Any]:
        consent = await self.c.consents.capture(ctx.case, ctx.user, ConsentType(data.consent_type), source="VOICE_TOOL", actor=Actor.agent(),
                                                call_session_id=ctx.call.id if ctx.call else None,
                                                evidence={"call_session_id": str(ctx.call.id)} if ctx.call else None)
        return {"consent_type": data.consent_type, "token_issued": bool(consent.token), "captured_at": consent.captured_at.isoformat()}

    async def _verify(self, ctx: ToolContext, data: VerifyArgs) -> dict[str, Any]:
        if data.method == "UAE_PASS":
            result = await self.c.verification.uae_pass(ctx.case, ctx.call, approved=data.uae_pass_approved)
        else:
            result = await self.c.verification.check_facts(ctx.case, ctx.call, date_of_birth=data.date_of_birth or "", hospital=data.hospital or "")
        say = t("verify_ok", ctx.lang) if result["verified"] else (t("verify_failed_transfer", ctx.lang) if result["escalated"] else t("verify_retry", ctx.lang))
        return {**result, "say": say}

    async def _prepare(self, ctx: ToolContext, key: str) -> dict[str, Any]:
        node = await self.c.nodes_repo.by_key(ctx.case.id, key)
        if node.state in (NodeState.READY, NodeState.DOCUMENT_MISSING) and not await self.c.documents.missing_for_node(ctx.case, node):
            await self.c.approvals.request(ctx.case, node)
        elif node.state == NodeState.PENDING:
            deps = [d.title for d in await self.c.graph.dependencies(node) if d.state not in DONE_STATES]
            return {"state": node.state.value, "filed": False, "say": f"{node.title} can't start until {', '.join(deps)} is cleared."}
        return {"state": node.state.value, "filed": False, "awaiting_officer_release": node.state == NodeState.WAITING_FOR_HUMAN,
                "say": f"{node.title}: {node.status}. An Amer officer releases every submission; I can't approve or send it myself."}

    async def _prep_bc(self, ctx, _): return await self._prepare(ctx, "BIRTH_CERTIFICATE")
    async def _prep_mofa(self, ctx, _): return await self._prepare(ctx, "MOFA_ATTESTATION")
    async def _prep_visa(self, ctx, _): return await self._prepare(ctx, "RESIDENCE_VISA")
    async def _prep_eid(self, ctx, _): return await self._prepare(ctx, "EMIRATES_ID")
    async def _prep_ins(self, ctx, _): return await self._prepare(ctx, "INSURANCE")

    async def _entity_status(self, ctx: ToolContext, data: NodeArg) -> dict[str, Any]:
        node = await self.c.nodes_repo.by_key(ctx.case.id, data.node_key)
        if node.type == NodeType.PARENT_REPORTED:
            info = await self.c.consulate.status_for_agent(ctx.case)
            report = info["last_report"]
            say = (t("consulate_status_reported", ctx.lang, date=report["reported_at"][:10], milestone=report["label"]) if report
                   else t("consulate_status_unknown", ctx.lang))
            return {**info, "say": say}
        request = await self.c.requests_repo.latest_for_node(node.id)
        confirmed = node.state in DONE_STATES and node.status_source == Source.GOVERNMENT_MOCK
        return {"node": data.node_key, "state": node.state.value, "status": node.status, "source": node.status_source.value,
                "external_ref": request.external_ref if request else None, "confirmed_by_authority": confirmed,
                "say": node.status if node.state not in (NodeState.SUBMITTED, NodeState.PROCESSING) else t("no_confirmed_update", ctx.lang)}

    async def _consulate(self, ctx: ToolContext, data: ConsulateArgs) -> dict[str, Any]:
        report = await self.c.consulate.report(ctx.case, data.milestone, actor=Actor(Actor.user(ctx.user).type, f"{ctx.user.full_name} (parent, by voice)", ctx.user.id),
                                               channel="VOICE", appointment_date=data.appointment_date,
                                               passport_number_present=data.passport_number_present, notes=data.notes)
        say = t("consulate_passport_issued", ctx.lang) if data.milestone == "PASSPORT_ISSUED" else t("consulate_recorded", ctx.lang, milestone=report["label"].lower())
        return {"recorded": True, "source": "PARENT_REPORTED", "milestone": data.milestone, "say": say}

    async def _callback(self, ctx: ToolContext, _: NoArgs) -> dict[str, Any]:
        cb = await self.c.callbacks.trigger_now(ctx.case, ctx.user)
        return {"status": cb.status.value if cb else None}

    async def _stop(self, ctx: ToolContext, data: StopArgs) -> dict[str, Any]:
        await self.c.optouts.opt_out(ctx.case, ctx.user, source="VOICE", actor=Actor.user(ctx.user))
        return {"opted_out": True, "channel_mode": "SMS_ONLY", "say": t("opt_out_done", ctx.lang, ref=ctx.case.reference)}

    async def _transfer(self, ctx: ToolContext, data: TransferArgs) -> dict[str, Any]:
        esc = await self.c.escalations.open(ctx.case, EscalationReason(data.reason), actor=Actor.agent(), call=ctx.call,
                                            warm_transfer=ctx.call is not None, summary=data.summary)
        officer = await self.c.users_repo.get(esc.assigned_officer_id) if esc.assigned_officer_id else None
        org = await self.c.orgs_repo.get(officer.organization_id) if officer and officer.organization_id else None
        say = (t("transfer", ctx.lang, officer=officer.full_name, org=org.name if org else "Amer") if officer
               else t("transfer_queued", ctx.lang, ref=ctx.case.reference))
        return {"escalation_id": str(esc.id), "officer": officer.full_name if officer else None, "warm_transfer": esc.warm_transfer, "say": say}

    async def _timeline(self, ctx: ToolContext, data: TimelineArgs) -> dict[str, Any]:
        items, _ = await self.c.timeline_repo.page(self.c.timeline_repo.for_case(ctx.case.id), limit=data.limit)
        return {"events": [{"title": e.title, "source": e.source.value, "at": e.occurred_at.isoformat()} for e in items]}

    async def _knowledge(self, ctx: ToolContext, data: KnowledgeArgs) -> dict[str, Any]:
        docs = await self.c.knowledge.search(data.query)
        fee = await self.c.knowledge.fee_for(data.query)
        return {"documents": [{"id": d["id"], "title": d["title"], "source": d["source"], "excerpt": d["body"][:700], "fees": d["fees"]} for d in docs],
                "fee": fee, "rule": "Quote a fee only if it appears in `fee` or a document's `fees`, with its source."}
