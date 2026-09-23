"""Backend functions exposed to the ElevenLabs voice agent (and used by the demo dialog engine).

Every tool reads or writes persistent case state through the service layer. The agent never answers case
questions from memory: it calls a tool. Tools return small JSON-safe dicts with `ok`, `message` and data.
"""
from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from app.core.clock import utcnow
from app.core.errors import DomainError, NotFound
from app.core.i18n import t
from app.integrations.elevenlabs.schemas import ToolSpec
from app.models.conversation import Conversation
from app.models.enums import ActorType, CaseStatus, ConsentType
from app.models.enums import TaskStatus as S
from app.models.life_event_case import LifeEventCase
from app.models.service_task import ServiceTask
from app.models.user import User
from app.services.case_service import CreateCaseInput

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

CASE_REF = {"type": "string", "description": "Case reference such as L-49281. Omit to use the resident's current case."}
SERVICE_KEY = {"type": "string", "description": "Service key such as IDENTITY_PROCESS."}

TOOL_SPECS: list[ToolSpec] = [
    ToolSpec(
        name="create_life_event_case",
        description="Create a life-event case and start its workflow. ONLY call after the resident has clearly said yes to your consent question.",
        parameters={
            "event_type": {"type": "string", "description": "BIRTH, MARRIAGE, MOVE or BUSINESS_START."},
            "event_date": {"type": "string", "description": "ISO date (YYYY-MM-DD) or words like 'yesterday'."},
            "child_name": {"type": "string", "description": "Child's name if the resident gave it."},
            "relationship": {"type": "string", "description": "daughter, son or child."},
            "consent_confirmed": {"type": "boolean", "description": "True only if the resident explicitly consented."},
            "callback_consent": {"type": "boolean", "description": "False if the resident does not want proactive calls."},
            "language": {"type": "string", "description": "en or ar."},
        },
        required=["event_type", "consent_confirmed"],
    ),
    ToolSpec(name="get_case_status", description="Get the verified status of the resident's case in plain language.", parameters={"case_reference": CASE_REF}),
    ToolSpec(name="get_case_timeline", description="Get the most recent timeline entries for the case.",
             parameters={"case_reference": CASE_REF, "limit": {"type": "integer", "description": "Max entries (default 8)."}}),
    ToolSpec(name="get_pending_actions", description="Get what, if anything, the resident must do next.", parameters={"case_reference": CASE_REF}),
    ToolSpec(name="get_workflow_graph", description="Get the services in the case and what each one is waiting for.", parameters={"case_reference": CASE_REF}),
    ToolSpec(
        name="submit_consent", description="Record a consent decision for the case.",
        parameters={"case_reference": CASE_REF,
                    "consent_type": {"type": "string", "description": "CALLBACK_CONSENT, SERVICE_INITIATION_CONSENT or DATA_PROCESSING_CONSENT."},
                    "granted": {"type": "boolean", "description": "True if granted, false if declined or revoked."}},
        required=["consent_type", "granted"],
    ),
    ToolSpec(name="initiate_service", description="Start a service that is ready. Safe to repeat; never creates a duplicate application.",
             parameters={"case_reference": CASE_REF, "service_key": SERVICE_KEY}, required=["service_key"]),
    ToolSpec(name="get_service_status", description="Get the confirmed status of one service.", parameters={"case_reference": CASE_REF, "service_key": SERVICE_KEY}, required=["service_key"]),
    ToolSpec(name="get_required_documents", description="List documents an authority has requested, and whether they were received.",
             parameters={"case_reference": CASE_REF, "service_key": SERVICE_KEY}),
    ToolSpec(
        name="record_document", description="Record that the resident is providing a requested document.",
        parameters={"case_reference": CASE_REF, "document_type": {"type": "string", "description": "Document type code, e.g. PROOF_OF_ADDRESS."},
                    "name": {"type": "string", "description": "Human-friendly document name."}, "service_key": SERVICE_KEY},
        required=["document_type"],
    ),
    ToolSpec(name="request_callback", description="Schedule a callback to the resident.",
             parameters={"case_reference": CASE_REF, "reason": {"type": "string", "description": "Why the resident wants a call."},
                         "when": {"type": "string", "description": "'tomorrow', 'in 3 hours' or an ISO datetime."}}),
    ToolSpec(name="pause_case", description="Pause the case at the resident's request.", parameters={"case_reference": CASE_REF, "reason": {"type": "string", "description": "Reason."}}),
    ToolSpec(name="resume_case", description="Resume a paused case.", parameters={"case_reference": CASE_REF}),
    ToolSpec(name="escalate_case", description="Hand the case to a human officer.", parameters={"case_reference": CASE_REF, "reason": {"type": "string", "description": "Reason."}}, required=["reason"]),
    ToolSpec(name="complete_case", description="Ask the backend to close the case. It refuses unless every authority has confirmed completion.", parameters={"case_reference": CASE_REF}),
]

STATUS_TEXT = {
    S.PENDING: "not started yet",
    S.BLOCKED: "waiting for earlier services to finish",
    S.READY: "ready to be submitted",
    S.SUBMITTED: "submitted to {entity}, awaiting acceptance",
    S.PROCESSING: "being processed by {entity}",
    S.WAITING_FOR_ENTITY: "delayed at {entity}",
    S.WAITING_FOR_RESIDENT: "on hold until you provide something",
    S.COMPLETED: "confirmed as completed by {entity}",
    S.REJECTED: "not approved by {entity}",
    S.FAILED: "could not be submitted",
    S.CANCELLED: "cancelled",
}


def parse_when(value: str | None) -> datetime:
    now = utcnow()
    if not value:
        return now + timedelta(days=1)
    text = value.strip().lower()
    if text in {"tomorrow", "later"}:
        return now.replace(hour=9, minute=0, second=0, microsecond=0) + timedelta(days=1)
    m = re.match(r"in (\d+)\s*(hour|hours|minute|minutes|day|days)", text)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        return now + (timedelta(hours=n) if unit.startswith("hour") else timedelta(minutes=n) if unit.startswith("minute") else timedelta(days=n))
    try:
        parsed = datetime.fromisoformat(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=now.tzinfo)
    except ValueError:
        return now + timedelta(days=1)


def parse_event_date(value: Any) -> date | None:
    from app.agents.journey_planner import extract_date

    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return extract_date(str(value), utcnow().date())


class ToolRunner:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c
        self._tools: dict[str, Callable[[User, dict[str, Any], Conversation | None], Awaitable[dict[str, Any]]]] = {
            spec.name: getattr(self, f"tool_{spec.name}") for spec in TOOL_SPECS
        }

    async def run(self, name: str, user: User, args: dict[str, Any], conversation: Conversation | None = None) -> dict[str, Any]:
        tool = self._tools.get(name)
        if not tool:
            return {"ok": False, "error": "unknown_tool", "message": f"There is no tool named {name}."}
        try:
            result = await tool(user, args or {}, conversation)
            await self.c.bus.drain()
            return result
        except DomainError as exc:
            return {"ok": False, "error": exc.code, "message": exc.message}

    # ---- helpers -------------------------------------------------------------------------------
    async def _case(self, user: User, args: dict[str, Any], conv: Conversation | None = None) -> LifeEventCase:
        """Explicit reference > the case this conversation is about > the resident's newest open case > newest case."""
        ref = args.get("case_reference")
        if ref:
            return await self.c.cases.resolve(ref, user)
        if conv is not None and conv.case_id:
            return await self.c.cases.resolve(conv.case_id, user)
        case = await self.c.cases.latest_active(user.id) or await self.c.cases.latest_case(user.id)
        if not case:
            raise NotFound("The resident has no case yet", code="no_case")
        return case

    async def _task(self, case: LifeEventCase, key: str | None) -> ServiceTask:
        tasks = await self.c.cases.tasks(case.id)
        if key:
            match = next((tk for tk in tasks if tk.key == key.upper()), None)
            if match:
                return match
            raise NotFound(f"No service '{key}' in this case", code="unknown_service")
        raise NotFound("A service key is required", code="unknown_service")

    def _lang(self, user: User, conversation: Conversation | None, args: dict[str, Any] | None = None) -> str:
        return (args or {}).get("language") or (conversation.language if conversation else None) or user.preferred_language

    # ---- tools ---------------------------------------------------------------------------------
    async def tool_create_life_event_case(self, user: User, args: dict[str, Any], conv: Conversation | None) -> dict[str, Any]:
        lang = self._lang(user, conv, args)
        if not args.get("consent_confirmed"):
            return {"ok": False, "error": "consent_required", "message": "Ask the resident for consent first, then call again with consent_confirmed=true."}
        event_type = str(args.get("event_type", "BIRTH")).upper()
        event_date = parse_event_date(args.get("event_date"))
        existing = await self.c.cases.latest_active(user.id, event_type)
        if existing and (existing.event_date == event_date or event_date is None):
            snap = await self.c.cases.snapshot(existing)
            return {"ok": True, "already_exists": True, "case_reference": existing.reference, "message": t("case_exists", lang, ref=existing.reference), "summary": snap["summary"]}
        participants: list[dict[str, Any]] = [{"role": "parent", "name": user.full_name}]
        if event_type == "BIRTH":
            participants.append({"role": "child", "relationship": args.get("relationship") or "child", "name": args.get("child_name") or "Newborn"})
        callback_ok = args.get("callback_consent", True) is not False
        data = CreateCaseInput(
            event_type=event_type, event_date=event_date, participants=participants, preferences={"language": lang},
            memory={"reported_via": "voice", "resident_words": args.get("resident_words")} if args.get("resident_words") else {"reported_via": "voice"},
            consents={
                ConsentType.SERVICE_INITIATION_CONSENT: True, ConsentType.DATA_PROCESSING_CONSENT: True,
                ConsentType.CALLBACK_CONSENT: callback_ok,
            },
            source="voice", idempotency_key=f"voice:{conv.id}:{event_type}" if conv else None,
        )
        case, created = await self.c.cases.create_case(user, data, actor="ai:voice-agent", actor_type=ActorType.AI_AGENT)
        await self.c.bus.drain()  # runs activation: tasks + first submissions
        if conv:
            conv.case_id = case.id
        snap = await self.c.cases.snapshot(case)
        return {"ok": True, "created": created, "case_reference": case.reference, "message": t("case_created", lang, ref=case.reference), "summary": snap["summary"], "status": snap["status"]}

    async def tool_get_case_status(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        snap = await self.c.cases.snapshot(case)
        return {"ok": True, "case_reference": case.reference, "status": snap["status"], "progress": snap["progress"], "summary": snap["summary"],
                "stages": [{"name": s["name"], "status": s["status"], "entity": s["entity"]} for s in snap["stages"]]}

    async def tool_get_case_timeline(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        entries, total = await self.c.timeline.list_for_case(case.id, limit=int(args.get("limit") or 8))
        return {"ok": True, "case_reference": case.reference, "total": total,
                "entries": [{"when": e.occurred_at.isoformat(), "title": e.title, "description": e.description} for e in entries]}

    async def tool_get_pending_actions(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        snap = await self.c.cases.snapshot(case)
        lang = self._lang(user, conv)
        return {"ok": True, "case_reference": case.reference, "actions": snap["pending_actions"],
                "message": t("no_action", lang) if not snap["pending_actions"] else t("action_needed", lang, action=snap["pending_actions"][0]["action"])}

    async def tool_get_workflow_graph(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        graph = await self.c.workflows.case_graph(case)
        return {"ok": True, "case_reference": case.reference,
                "services": [{"key": n["key"], "name": n["name"], "status": n["status"], "waits_for": n["dependencies"], "entity": (n["entity"] or {}).get("name")}
                             for n in graph["nodes"] if not n["is_system"]]}

    async def tool_submit_consent(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        try:
            ctype = ConsentType(str(args.get("consent_type", "")).upper())
        except ValueError:
            return {"ok": False, "error": "invalid_consent_type", "message": "Unknown consent type."}
        consent = await self.c.consents.record(case, ctype, bool(args.get("granted")), source="voice", actor="ai:voice-agent", actor_type=ActorType.AI_AGENT)
        return {"ok": True, "case_reference": case.reference, "consent_type": ctype.value, "status": consent.status.value}

    async def tool_initiate_service(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        task = await self._task(case, args.get("service_key"))
        if case.status != CaseStatus.IN_PROGRESS:
            return {"ok": False, "error": "case_not_active", "message": f"The case is {case.status.value.lower().replace('_', ' ')}, so services cannot be started."}
        if task.status == S.READY:
            await self.c.orchestration.submit_ready_tasks(case)
        elif task.status in {S.PENDING, S.BLOCKED}:
            tasks, deps = await self.c.dependencies.graph(case.id)
            unmet = [tasks[d].name for d in deps[task.id] if tasks[d].status != S.COMPLETED]
            return {"ok": False, "error": "not_actionable", "message": f"{task.name} cannot start yet. It is waiting for: {', '.join(unmet)}."}
        return {"ok": True, "service": task.name, "status": task.status.value, "reference": task.external_ref}

    async def tool_get_service_status(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        task = await self._task(case, args.get("service_key"))
        entity = await self.c.orchestration.entity_of(task)
        text = STATUS_TEXT[task.status].format(entity=entity.name if entity else "the authority")
        return {"ok": True, "service": task.name, "status": task.status.value, "description": f"{task.name} is {text}.",
                "confirmed_by_authority": task.status == S.COMPLETED, "reference": task.external_ref, "resident_action": task.resident_action,
                "note": None if task.status in {S.COMPLETED, S.PROCESSING, S.WAITING_FOR_RESIDENT} else t("no_confirmed_update", self._lang(user, conv))}

    async def tool_get_required_documents(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        docs = await self.c.documents.list_for_case(case.id)
        if args.get("service_key"):
            task = await self._task(case, args["service_key"])
            docs = [d for d in docs if d.task_id == task.id]
        return {"ok": True, "documents": [{"type": d.doc_type, "name": d.name, "status": d.status.value} for d in docs],
                "outstanding": [d.name for d in docs if d.status.value == "REQUESTED"]}

    async def tool_record_document(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        task_id = (await self._task(case, args["service_key"])).id if args.get("service_key") else None
        doc = await self.c.documents.record(
            case, doc_type=str(args.get("document_type", "")).upper(), name=args.get("name"), task_id=task_id, source="voice",
            actor="ai:voice-agent", actor_type=ActorType.AI_AGENT,
        )
        return {"ok": True, "document": doc.name, "status": doc.status.value, "message": t("doc_recorded", self._lang(user, conv), doc=doc.name)}

    async def tool_request_callback(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        when = parse_when(args.get("when"))
        cb = await self.c.callbacks.schedule_for_resident(case, reason=args.get("reason") or "Resident requested a follow-up call", when=when)
        return {"ok": True, "callback_id": str(cb.id), "scheduled_for": when.isoformat()}

    async def tool_pause_case(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        await self.c.cases.pause(case, reason=args.get("reason") or "Paused at the resident's request.", actor="ai:voice-agent", actor_type=ActorType.AI_AGENT)
        return {"ok": True, "case_reference": case.reference, "status": case.status.value, "message": t("paused", self._lang(user, conv), ref=case.reference)}

    async def tool_resume_case(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        await self.c.cases.resume(case, actor="ai:voice-agent", actor_type=ActorType.AI_AGENT)
        return {"ok": True, "case_reference": case.reference, "status": case.status.value, "message": t("resumed", self._lang(user, conv), ref=case.reference)}

    async def tool_escalate_case(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        await self.c.cases.escalate(case, reason=args.get("reason") or "Resident asked for a human officer", actor="ai:voice-agent", actor_type=ActorType.AI_AGENT)
        return {"ok": True, "case_reference": case.reference, "status": case.status.value, "message": t("escalated", self._lang(user, conv), ref=case.reference)}

    async def tool_complete_case(self, user, args, conv) -> dict[str, Any]:
        case = await self._case(user, args, conv)
        lang = self._lang(user, conv)
        if case.status == CaseStatus.COMPLETED:
            return {"ok": True, "status": "COMPLETED", "message": t("completed_case", lang)}
        if await self.c.cases.try_complete(case):
            return {"ok": True, "status": "COMPLETED", "message": t("completed_case", lang)}
        return {"ok": False, "error": "not_all_services_confirmed", "message": t("cannot_complete", lang)}

