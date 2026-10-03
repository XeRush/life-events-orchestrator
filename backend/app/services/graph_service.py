"""Life-Event Graph: construction, validated transitions, dependency resolution, impact analysis, snapshots.

This is the only code that changes a node's state. Every transition is validated by the state machine, stamps its
timestamps (submitted / cleared / stalled / SLA due), sets who owns the next action, and records one domain event.
"""
from __future__ import annotations

from collections import deque
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from app.core.clock import utcnow
from app.core.i18n import node_title, normalise_lang
from app.events.catalog import STATE_PHRASES, node_event_name
from app.events.recorder import Actor
from app.models.case import Case
from app.models.enums import DONE_STATES, ApprovalState, NodeState, NodeType, Source
from app.models.graph import LifeEventEdge, LifeEventNode
from app.workflows.birth_expat import BY_KEY, TEMPLATE, edges, entity_for, entity_label
from app.workflows.state_machine import assert_transition
from app.workflows.step_text import step_text

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

ENTITY_SHORT = {"DHA": "DHA", "MOHAP": "MOHAP", "DOH": "DOH", "MOFA": "MOFA", "GDRFA": "GDRFA-Dubai", "ICP": "ICP"}
_STATE_ACTION = {NodeState.READY: ("next_ready", "AGENT"), NodeState.WAITING_FOR_HUMAN: ("next_officer", "OFFICER"),
                 NodeState.BLOCKED: ("next_blocked", "OFFICER"), NodeState.STALLED: ("next_stalled", "OFFICER"),
                 NodeState.REJECTED: ("next_rejected", "OFFICER")}


def entity_short(node: LifeEventNode, lang: str = "en") -> str:
    """Short spoken name of the authority handling a node ("GDRFA-Dubai", "the consulate")."""
    return ENTITY_SHORT.get(node.entity.value) or step_text(f"entity_{node.entity.value}", lang) or node.entity_label


def next_action(node: LifeEventNode, lang: str = "en") -> tuple[str | None, str | None]:
    """Who acts next on a node and what they do, phrased in `lang`. The node row stores the English form."""
    s = node.state
    if s == NodeState.PENDING:
        deps = [node_title(d, lang, BY_KEY[d].title) for d in BY_KEY[node.key].depends_on]
        return (step_text("next_after", lang, steps=", ".join(deps)) if deps else step_text("next_waiting", lang)), "SYSTEM"
    if s in (NodeState.SUBMITTING, NodeState.SUBMITTED, NodeState.PROCESSING):
        return step_text("next_with", lang, entity=entity_short(node, lang)), "ENTITY"
    if s == NodeState.DOCUMENT_MISSING:
        return step_text("next_provide", lang, doc=node.blocked_reason or step_text("next_missing_doc", lang)), "PARENT"
    if s == NodeState.WAITING_FOR_PARENT:
        return step_text("next_consulate" if node.key == "CONSULATE_PASSPORT" else "next_biometrics", lang), "PARENT"
    if s in _STATE_ACTION:
        key, owner = _STATE_ACTION[s]
        return step_text(key, lang), owner
    return None, None


def status_line(node: LifeEventNode, lang: str) -> str:
    """A node's status in `lang`. English keeps the stored line (often the authority's own wording); other languages
    get the state phrased for residents, or the latest parent-reported consulate milestone."""
    if lang == "en":
        return node.status
    report = node.parent_report or {}
    if node.type == NodeType.PARENT_REPORTED and report.get("reported_status"):
        return step_text(f"milestone_{report['reported_status']}", lang) or node.status
    line = step_text(f"status_{node.state.value}", lang, entity=entity_short(node, lang)) or node.status
    if node.type == NodeType.ENTITY_FILING and node.state not in (NodeState.PENDING, NodeState.READY, NodeState.WAITING_FOR_HUMAN):
        line += step_text("status_mock_suffix", lang) or ""
    return line


class GraphService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def build(self, case: Case, nationality: str | None) -> list[LifeEventNode]:
        nodes: dict[str, LifeEventNode] = {}
        for order, tpl in enumerate(TEMPLATE):
            entity = entity_for(tpl.key, case.emirate)
            node = LifeEventNode(
                case_id=case.id, key=tpl.key, title=tpl.title, entity=entity, entity_label=entity_label(entity, nationality),
                type=tpl.type, state=NodeState.PENDING, sort_order=order, required_documents=list(tpl.required_documents),
                form_fields=list(tpl.form_fields), human_approval_required=tpl.human_approval_required,
                resident_present_required=tpl.resident_present_required, success_state=tpl.success_state, sla_hours=tpl.sla_hours,
                fee_note=tpl.fee_note, status="Waiting for an earlier step" if tpl.depends_on else "Ready to start",
                status_source=Source.SYSTEM,
            )
            node.next_action, node.next_action_owner = next_action(node)
            self.c.session.add(node)
            nodes[tpl.key] = node
        await self.c.session.flush()
        for src, dst in edges():
            self.c.session.add(LifeEventEdge(case_id=case.id, from_node_id=nodes[src].id, to_node_id=nodes[dst].id))
        await self.c.session.flush()
        return list(nodes.values())

    # --- transitions -----------------------------------------------------------------------------------------
    async def transition(self, node: LifeEventNode, target: NodeState, *, source: Source, actor: Actor | None = None,
                         status: str | None = None, reason: str | None = None, payload: dict[str, Any] | None = None,
                         resident_present: bool = False, title: str | None = None, idempotency_key: str | None = None,
                         i18n_params: dict[str, str] | None = None) -> bool:
        """Apply a validated transition. Returns False (and records nothing) when the node is already in `target`.

        `i18n_params` adds structured codes (never English text or PII) to the timeline entry's translation params,
        e.g. {"docs": "FATHER_PASSPORT,CHILD_PHOTO"} for DOCUMENT_MISSING.
        """
        if node.state == target and not reason:
            return False
        assert_transition(node.state, target, node.key)
        previous = node.state
        now = utcnow()
        node.state = target
        node.status_source = source
        if target in (NodeState.SUBMITTED,) and not node.submitted_at:
            node.submitted_at = now
        if target == NodeState.SUBMITTED and node.sla_hours:
            node.sla_due_at = now + timedelta(hours=node.sla_hours)
        if target in DONE_STATES:
            node.cleared_at = now
            node.blocked_reason = None
            node.stalled_since = None
            node.sla_due_at = None
        if target == NodeState.STALLED:
            node.stalled_since = node.stalled_since or now
        elif previous == NodeState.STALLED:
            node.stalled_since = None
        if target in (NodeState.BLOCKED, NodeState.DOCUMENT_MISSING, NodeState.STALLED, NodeState.REJECTED):
            node.blocked_reason = reason or node.blocked_reason
        elif target not in DONE_STATES and reason is None:
            node.blocked_reason = None
        node.status = (status or self._status_line(node))[:240]
        node.next_action, node.next_action_owner = next_action(node)
        case = await self.c.cases_repo.get(node.case_id)
        name = node_event_name(node.key, target)
        await self.c.events.emit(
            name, case_id=node.case_id, node_key=node.key, actor=actor or Actor.system(), source=source,
            title=title or self._timeline_title(node, target), description=node.status if node.status != self._timeline_title(node, target) else "",
            status=target.value, resident_present=resident_present, idempotency_key=idempotency_key,
            payload={"node_key": node.key, "from": previous.value, "to": target.value, "entity": node.entity.value,
                     "reason": reason, **(payload or {})},
            i18n={"key": self._i18n_key(node, target), "params": {"node": node.key, "entity": node.entity.value, **(i18n_params or {})}},
        )
        if case is not None:
            await self.c.cases.refresh(case)
        return True

    def _status_line(self, node: LifeEventNode) -> str:
        who = entity_short(node)
        s = node.state
        mock = " (mock)" if node.type == NodeType.ENTITY_FILING else ""
        if s == NodeState.SUBMITTED:
            return f"Submitted to {who}{mock}"
        if s == NodeState.PROCESSING:
            return f"{who}{mock} is processing"
        if s == NodeState.CLEARED:
            return f"Cleared by {who}{mock}"
        if s == NodeState.COMPLETED:
            return "Parent-reported: passport issued" if node.type == NodeType.PARENT_REPORTED else f"Completed by {who}{mock}"
        if s in (NodeState.BLOCKED, NodeState.DOCUMENT_MISSING, NodeState.STALLED, NodeState.REJECTED) and node.blocked_reason:
            return f"{STATE_PHRASES[s].capitalize()}: {node.blocked_reason}"
        return STATE_PHRASES[s].capitalize()

    @staticmethod
    def _i18n_key(node: LifeEventNode, target: NodeState) -> str:
        """Translation key for a node transition. Mirrors `_timeline_title`: parent-reported steps read differently."""
        if node.type == NodeType.PARENT_REPORTED and target in (NodeState.PROCESSING, NodeState.STALLED, NodeState.COMPLETED):
            return f"node.{target.value}.PARENT_REPORTED"
        return f"node.{target.value}"

    def _timeline_title(self, node: LifeEventNode, target: NodeState) -> str:
        who = entity_short(node)
        if node.type == NodeType.PARENT_REPORTED and target in (NodeState.PROCESSING, NodeState.STALLED):
            return (f"{node.title}: application in progress (parent-reported)" if target == NodeState.PROCESSING
                    else f"{node.title}: parent reports no progress")
        titles = {
            NodeState.READY: f"{node.title} ready to prepare",
            NodeState.WAITING_FOR_HUMAN: f"{node.title} prepared - awaiting officer release",
            NodeState.SUBMITTING: f"{node.title} released for filing",
            NodeState.SUBMITTED: f"{node.title} request submitted to {who}",
            NodeState.PROCESSING: f"{node.title} being processed by {who}",
            NodeState.CLEARED: f"{node.title} cleared by {who}",
            NodeState.COMPLETED: f"{node.title} completed" if node.type != NodeType.PARENT_REPORTED else f"{node.title} reported as issued",
            NodeState.BLOCKED: f"{node.title} blocked",
            NodeState.DOCUMENT_MISSING: f"{node.title}: document missing",
            NodeState.STALLED: f"{node.title} stalled - not cleared yet",
            NodeState.WAITING_FOR_PARENT: f"{node.title} waiting for the parent",
            NodeState.REJECTED: f"{node.title} not approved by {who}",
            NodeState.PENDING: f"{node.title} waiting for an earlier step",
        }
        return titles[target]

    # --- dependencies ------------------------------------------------------------------------------------------
    async def dependencies(self, node: LifeEventNode) -> list[LifeEventNode]:
        nodes = {n.id: n for n in await self.c.nodes_repo.for_case(node.case_id)}
        return [nodes[e.from_node_id] for e in await self.c.nodes_repo.edges(node.case_id) if e.to_node_id == node.id]

    async def unlockable(self, case: Case) -> list[LifeEventNode]:
        nodes = await self.c.nodes_repo.for_case(case.id)
        by_id = {n.id: n for n in nodes}
        deps: dict[Any, list[LifeEventNode]] = {n.id: [] for n in nodes}
        for e in await self.c.nodes_repo.edges(case.id):
            deps[e.to_node_id].append(by_id[e.from_node_id])
        return [n for n in nodes if n.state == NodeState.PENDING and all(d.state in DONE_STATES for d in deps[n.id])]

    async def downstream(self, case: Case, key: str) -> list[LifeEventNode]:
        nodes = {n.id: n for n in await self.c.nodes_repo.for_case(case.id)}
        out: dict[Any, list[Any]] = {}
        for e in await self.c.nodes_repo.edges(case.id):
            out.setdefault(e.from_node_id, []).append(e.to_node_id)
        start = next((n for n in nodes.values() if n.key == key), None)
        if start is None:
            return []
        seen, queue, result = {start.id}, deque(out.get(start.id, [])), []
        while queue:
            nid = queue.popleft()
            if nid in seen:
                continue
            seen.add(nid)
            result.append(nodes[nid])
            queue.extend(out.get(nid, []))
        return result

    async def impact(self, case: Case, key: str) -> dict[str, Any]:
        node = await self.c.nodes_repo.by_key(case.id, key)
        source = "postgres"
        held: list[dict[str, Any]] | None = None
        if node and self.c.infra.neo4j.available:
            held = await self.c.infra.neo4j.downstream(str(node.id))
            source = "neo4j" if held is not None else "postgres"
        if held is None:
            held = [{"key": n.key, "state": n.state.value, "entity": n.entity.value} for n in await self.downstream(case, key)]
        return {"node_key": key, "held_downstream": held, "source": source}

    async def project(self, case: Case) -> bool:
        nodes = await self.c.nodes_repo.for_case(case.id)
        by_id = {n.id: n for n in nodes}
        return await self.c.infra.neo4j.project_case(
            {"id": str(case.id), "reference": case.reference, "status": case.status.value, "emirate": case.emirate},
            [{"id": str(n.id), "key": n.key, "state": n.state.value, "entity": n.entity.value, "updated_at": n.updated_at.isoformat()} for n in nodes],
            [(str(by_id[e.from_node_id].id), str(by_id[e.to_node_id].id)) for e in await self.c.nodes_repo.edges(case.id)],
        )

    # --- views -------------------------------------------------------------------------------------------------
    def node_view(self, n: LifeEventNode, deps: list[str], lang: str = "en") -> dict[str, Any]:
        """One node for the API. Resident-facing step text is phrased in `lang`; the stored English stays authoritative."""
        tpl = BY_KEY[n.key]
        action, owner = next_action(n, lang)
        report = dict(n.parent_report) if n.parent_report else None
        if report and report.get("reported_status"):
            report["label"] = step_text(f"milestone_{report['reported_status']}", lang) or report.get("label")
        sla_breached = bool(n.sla_due_at and n.sla_due_at < utcnow() and n.state not in DONE_STATES)
        return {
            "id": str(n.id), "case_id": str(n.case_id), "key": n.key, "title": n.title, "entity": n.entity.value,
            "entity_label": n.entity_label, "type": n.type.value, "state": n.state.value, "status": status_line(n, lang),
            "status_source": n.status_source.value, "dependencies": deps, "required_documents": n.required_documents,
            "form_fields": n.form_fields, "form_field_labels": [step_text(f"field_{f}", lang) or f for f in n.form_fields], "human_approval_required": n.human_approval_required,
            "approval_state": n.approval_state.value if n.approval_state else None,
            "resident_present_required": n.resident_present_required, "resident_present_reason": step_text(f"present_{n.key}", lang) if tpl.resident_present_reason else None,
            "submitted_at": n.submitted_at.isoformat() if n.submitted_at else None, "updated_at": n.updated_at.isoformat(),
            "cleared_at": n.cleared_at.isoformat() if n.cleared_at else None, "blocked_reason": n.blocked_reason,
            "sla": {"hours": n.sla_hours, "label": step_text(f"sla_{n.key}", lang), "due_at": n.sla_due_at.isoformat() if n.sla_due_at else None,
                    "breached": sla_breached, "source": tpl.sources[0]},
            "next_action": action, "next_action_owner": owner, "fee_note": step_text(f"fee_{n.key}", lang) if n.fee_note else None,
            "parent_report": report, "lifeloop_does": step_text(f"does_{n.key}", lang), "parent_does": step_text(f"parent_{n.key}", lang),
            "is_mock": n.type == NodeType.ENTITY_FILING, "attempts": n.attempts,
        }

    async def snapshot(self, case: Case, lang: str | None = None) -> dict[str, Any]:
        lang = normalise_lang(lang)
        nodes = await self.c.nodes_repo.for_case(case.id)
        by_id = {n.id: n for n in nodes}
        edge_rows = await self.c.nodes_repo.edges(case.id)
        deps: dict[Any, list[str]] = {n.id: [] for n in nodes}
        for e in edge_rows:
            deps[e.to_node_id].append(by_id[e.from_node_id].key)
        return {
            "case_id": str(case.id), "reference": case.reference, "source": "postgres",
            "projection": self.c.infra.neo4j.mode,
            "nodes": [self.node_view(n, deps[n.id], lang) for n in nodes],
            "edges": [{"from": by_id[e.from_node_id].key, "to": by_id[e.to_node_id].key, "kind": e.kind} for e in edge_rows],
        }

    async def set_approval_state(self, node: LifeEventNode, state: ApprovalState | None) -> None:
        node.approval_state = state
