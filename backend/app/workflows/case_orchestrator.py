"""Case orchestration as a LangGraph state machine.

    START -> CHECK_DEPENDENCIES -> PLAN_NEXT_ACTION -> ENTITY_ACTION -> EVALUATE_STATE
          -> ESCALATE? -> CALLBACK? -> COMPLETE? | ADVANCE -> WAIT_FOR_EVENT -> END

It runs once per relevant domain event (consumed from Kafka / the in-memory broker). It is deterministic: no LLM
is involved and no node mutates state directly - every action goes through a typed service (GraphService,
ApprovalService, EscalationService, the callback topic). "WAIT_FOR_EVENT" parks the case until the next event.
The conversation graph (INTAKE / VERIFY / STATUS / EXCEPTION sub-agents) hands over to this graph at BUILD_CASE.
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any, TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from app.core.clock import utcnow
from app.events.catalog import NODE_EVENT_NAMES
from app.events.recorder import Actor
from app.models.call import AgentSession
from app.models.enums import DONE_STATES, CaseStatus, EscalationReason, NodeState, NodeType, Source
from app.observability.logging import get_logger

if TYPE_CHECKING:
    from app.events.consumers import Message
    from app.services.container import ServiceContainer

log = get_logger("lifeloop.orchestrator")


class OrchestratorState(TypedDict, total=False):
    case_id: str
    trigger: str
    trigger_id: str
    node_key: str | None
    to_state: str | None
    stall_kind: str | None
    warm_transfer: bool
    unlockable: list[str]
    plan: list[dict[str, str]]
    actions: list[str]
    escalate: str | None
    callback: dict[str, Any] | None
    complete: bool
    path: list[str]


def _c(config: RunnableConfig) -> ServiceContainer:
    return config["configurable"]["c"]


def _traced(name: str):
    def wrap(fn):
        async def node(state: OrchestratorState, config: RunnableConfig) -> OrchestratorState:
            c = _c(config)
            with c.infra.tracer.span(f"langgraph.orchestrator.{name}", kind="chain", case_id=state.get("case_id"),
                                     metadata={"node": name, "trigger": state.get("trigger")}) as span:
                update = await fn(state, c)
                span.update(output={k: v for k, v in update.items() if k in ("unlockable", "plan", "actions", "escalate", "complete")})
            return {**update, "path": [*state.get("path", []), name]}
        return node
    return wrap


@_traced("CHECK_DEPENDENCIES")
async def check_dependencies(state: OrchestratorState, c: ServiceContainer) -> OrchestratorState:
    case = await c.cases_repo.get(uuid.UUID(state["case_id"]))
    if case is None or case.status in (CaseStatus.CLOSED, CaseStatus.INTAKE):
        return {"unlockable": []}
    return {"unlockable": [n.key for n in await c.graph.unlockable(case)]}


@_traced("PLAN_NEXT_ACTION")
async def plan_next_action(state: OrchestratorState, c: ServiceContainer) -> OrchestratorState:
    case = await c.cases_repo.get(uuid.UUID(state["case_id"]))
    plan = []
    for key in state.get("unlockable", []):
        node = await c.nodes_repo.by_key(case.id, key)
        if node is None:
            continue
        if node.type == NodeType.PARENT_REPORTED:
            plan.append({"node": key, "action": "ASK_PARENT"})
        elif await c.documents.missing_for_node(case, node):
            plan.append({"node": key, "action": "DOCUMENT_MISSING"})
        else:  # every filing is released by an officer in this design (canvas box K)
            plan.append({"node": key, "action": "PREPARE_FOR_OFFICER"})
    return {"plan": plan}


@_traced("ENTITY_ACTION")
async def entity_action(state: OrchestratorState, c: ServiceContainer) -> OrchestratorState:
    case = await c.cases_repo.get(uuid.UUID(state["case_id"]))
    actions = []
    agent = Actor.agent("LifeLoop orchestrator")
    for step in state.get("plan", []):
        node = await c.nodes_repo.by_key(case.id, step["node"])
        if node is None or node.state != NodeState.PENDING:
            continue
        if step["action"] == "ASK_PARENT":
            await c.graph.transition(node, NodeState.WAITING_FOR_PARENT, source=Source.AI_AGENT, actor=agent,
                                     status="Waiting for the parent - the consulate has no API, SLA or status feed")
        elif step["action"] == "DOCUMENT_MISSING":
            missing = await c.documents.missing_for_node(case, node)
            await c.graph.transition(node, NodeState.DOCUMENT_MISSING, source=Source.AI_AGENT, actor=agent,
                                     reason=", ".join(d.title for d in missing), i18n_params={"docs": ",".join(d.doc_type for d in missing)})
        else:
            await c.graph.transition(node, NodeState.READY, source=Source.AI_AGENT, actor=agent)
            await c.approvals.request(case, node)
        actions.append(f"{step['action']}:{step['node']}")
    return {"actions": actions}


@_traced("EVALUATE_STATE")
async def evaluate_state(state: OrchestratorState, c: ServiceContainer) -> OrchestratorState:
    case = await c.cases_repo.get(uuid.UUID(state["case_id"]))
    trigger, to_state, key = state.get("trigger"), state.get("to_state"), state.get("node_key")
    node = await c.nodes_repo.by_key(case.id, key) if key else None
    callback: dict[str, Any] | None = None
    escalate: str | None = None
    if trigger in NODE_EVENT_NAMES and node is not None and to_state:
        filing = node.type == NodeType.ENTITY_FILING
        base = {"node_key": node.key, "node_title": node.title, "entity": node.entity_label}
        if to_state in ("CLEARED", "COMPLETED") and filing and node.state.value == to_state:
            callback = {**base, "reason": "CLEARED" if to_state == "CLEARED" else "COMPLETED"}
        elif to_state == "BLOCKED":
            callback = {**base, "reason": "BLOCKED", "detail": node.blocked_reason}
        elif to_state == "DOCUMENT_MISSING":
            callback = {**base, "reason": "DOCUMENT_MISSING", "detail": node.blocked_reason}
        elif to_state == "STALLED" and state.get("stall_kind") == "SLA":
            escalate = EscalationReason.SLA_STALL.value
            callback = {**base, "reason": "STALLED"}
        elif to_state == "REJECTED":
            escalate = EscalationReason.ENTITY_REJECTION.value
            callback = {**base, "reason": "BLOCKED", "detail": node.blocked_reason}
        elif to_state == "WAITING_FOR_PARENT" and node.state == NodeState.WAITING_FOR_PARENT:
            callback = {**base, "reason": "PARENT_INPUT" if node.key == "CONSULATE_PASSPORT" else "BIOMETRICS"}
    elif trigger == "HumanEscalationRequired" and not state.get("warm_transfer"):
        callback = {"reason": "HUMAN_ESCALATION"}
    nodes = await c.nodes_repo.for_case(case.id)
    complete = bool(nodes) and all(n.state in DONE_STATES for n in nodes) and trigger != "CaseCompleted"
    if trigger == "CaseCompleted":
        callback = {"reason": "CASE_COMPLETE"}
    return {"callback": callback, "escalate": escalate, "complete": complete}


@_traced("ESCALATE")
async def escalate(state: OrchestratorState, c: ServiceContainer) -> OrchestratorState:
    case = await c.cases_repo.get(uuid.UUID(state["case_id"]))
    await c.escalations.open(case, EscalationReason(state["escalate"]), node_key=state.get("node_key"), actor=Actor.agent("LifeLoop orchestrator"),
                             summary=f"{state.get('node_key')} needs an officer: {state.get('to_state')}.")
    return {"actions": [*state.get("actions", []), f"ESCALATE:{state['escalate']}"]}


@_traced("CALLBACK")
async def callback(state: OrchestratorState, c: ServiceContainer) -> OrchestratorState:
    cb = state["callback"] or {}
    await c.events.emit("CallbackRequired", case_id=uuid.UUID(state["case_id"]), node_key=cb.get("node_key"), source=Source.AI_AGENT,
                        actor=Actor.agent("LifeLoop orchestrator"), timeline=False, payload={**cb, "trigger": state.get("trigger")},
                        idempotency_key=f"cbreq:{state['trigger_id']}" if state.get("trigger_id") else None)
    return {"actions": [*state.get("actions", []), f"CALLBACK:{cb.get('reason')}"]}


@_traced("COMPLETE")
async def complete(state: OrchestratorState, c: ServiceContainer) -> OrchestratorState:
    case = await c.cases_repo.get(uuid.UUID(state["case_id"]))
    await c.cases.refresh(case)  # emits CaseCompleted exactly once (idempotency key)
    return {"actions": [*state.get("actions", []), "COMPLETE"]}


@_traced("ADVANCE")
async def advance(state: OrchestratorState, c: ServiceContainer) -> OrchestratorState:
    return {}


@_traced("WAIT_FOR_EVENT")
async def wait_for_event(state: OrchestratorState, c: ServiceContainer) -> OrchestratorState:
    return {}


def _after_evaluate(state: OrchestratorState) -> str:
    if state.get("escalate"):
        return "ESCALATE"
    if state.get("callback"):
        return "CALLBACK"
    if state.get("complete"):
        return "COMPLETE"
    return "ADVANCE"


def _after_escalate(state: OrchestratorState) -> str:
    return "CALLBACK" if state.get("callback") else "WAIT_FOR_EVENT"


def _after_callback(state: OrchestratorState) -> str:
    return "COMPLETE" if state.get("complete") else "WAIT_FOR_EVENT"


def build_graph():
    g = StateGraph(OrchestratorState)
    for name, fn in (("CHECK_DEPENDENCIES", check_dependencies), ("PLAN_NEXT_ACTION", plan_next_action), ("ENTITY_ACTION", entity_action),
                     ("EVALUATE_STATE", evaluate_state), ("ESCALATE", escalate), ("CALLBACK", callback), ("COMPLETE", complete),
                     ("ADVANCE", advance), ("WAIT_FOR_EVENT", wait_for_event)):
        g.add_node(name, fn)
    g.add_edge(START, "CHECK_DEPENDENCIES")
    g.add_edge("CHECK_DEPENDENCIES", "PLAN_NEXT_ACTION")
    g.add_edge("PLAN_NEXT_ACTION", "ENTITY_ACTION")
    g.add_edge("ENTITY_ACTION", "EVALUATE_STATE")
    g.add_conditional_edges("EVALUATE_STATE", _after_evaluate, ["ESCALATE", "CALLBACK", "COMPLETE", "ADVANCE"])
    g.add_conditional_edges("ESCALATE", _after_escalate, ["CALLBACK", "WAIT_FOR_EVENT"])
    g.add_conditional_edges("CALLBACK", _after_callback, ["COMPLETE", "WAIT_FOR_EVENT"])
    g.add_edge("COMPLETE", "WAIT_FOR_EVENT")
    g.add_edge("ADVANCE", "WAIT_FOR_EVENT")
    g.add_edge("WAIT_FOR_EVENT", END)
    return g.compile()


GRAPH = build_graph()
ORCHESTRATOR_TRIGGERS = frozenset({"IntakeCompleted", "HumanEscalationRequired", "CaseCompleted"}) | NODE_EVENT_NAMES


class CaseOrchestrator:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def run(self, message: Message) -> OrchestratorState:
        state: OrchestratorState = {
            "case_id": str(message.case_id), "trigger": message.event_type, "node_key": message.node_key,
            "to_state": message.payload.get("to"), "stall_kind": message.payload.get("stall_kind"),
            "warm_transfer": bool(message.payload.get("warm_transfer")), "path": [], "actions": [], "trigger_id": str(message.id),
        }
        result: OrchestratorState = await GRAPH.ainvoke(state, config={"configurable": {"c": self.c}})
        await self._record(message, result)
        return result

    async def _record(self, message: Message, result: OrchestratorState) -> None:
        thread = f"case:{message.case_id}"
        from sqlalchemy import select

        session = await self.c.session.scalar(select(AgentSession).where(AgentSession.thread_id == thread, AgentSession.graph == "orchestrator"))
        run = {"at": utcnow().isoformat(), "trigger": message.event_type, "node": message.node_key, "path": result.get("path", []),
               "actions": result.get("actions", [])}
        if session is None:
            session = AgentSession(case_id=message.case_id, graph="orchestrator", thread_id=thread, state={}, path=[], steps=0)
            self.c.session.add(session)
        session.current_node = "WAIT_FOR_EVENT"
        session.steps += len(result.get("path", []))
        session.path = [run, *(session.path or [])][:40]
        session.state = {"last_trigger": message.event_type, "last_actions": result.get("actions", [])}

    @staticmethod
    def describe() -> dict[str, Any]:
        return {
            "nodes": ["START", "CHECK_DEPENDENCIES", "PLAN_NEXT_ACTION", "ENTITY_ACTION", "EVALUATE_STATE", "ESCALATE", "CALLBACK",
                      "COMPLETE", "ADVANCE", "WAIT_FOR_EVENT", "END"],
            "edges": [["START", "CHECK_DEPENDENCIES"], ["CHECK_DEPENDENCIES", "PLAN_NEXT_ACTION"], ["PLAN_NEXT_ACTION", "ENTITY_ACTION"],
                      ["ENTITY_ACTION", "EVALUATE_STATE"], ["EVALUATE_STATE", "ESCALATE"], ["EVALUATE_STATE", "CALLBACK"],
                      ["EVALUATE_STATE", "COMPLETE"], ["EVALUATE_STATE", "ADVANCE"], ["ESCALATE", "CALLBACK"], ["ESCALATE", "WAIT_FOR_EVENT"],
                      ["CALLBACK", "COMPLETE"], ["CALLBACK", "WAIT_FOR_EVENT"], ["COMPLETE", "WAIT_FOR_EVENT"], ["ADVANCE", "WAIT_FOR_EVENT"],
                      ["WAIT_FOR_EVENT", "END"]],
            "deterministic": True, "llm_mutates_state": False,
        }
