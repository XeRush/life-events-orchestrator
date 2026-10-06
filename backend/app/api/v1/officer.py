"""Officer dashboard API: queues, case detail, the approval gate, escalations, callbacks, audit, analytics.

Every route requires OFFICER or ADMIN; every case action additionally checks the officer's service centre.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from app.api.deps import STAFF, get_container, require_roles
from app.api.v1.common import page
from app.events.recorder import Actor
from app.models.case import Case
from app.models.enums import ACTIVE_CASE_STATES, ApprovalState, EscalationReason, EscalationStatus, NodeState, UserRole
from app.models.graph import LifeEventNode
from app.models.officer import Approval, Escalation
from app.models.user import User
from app.schemas.cases import EscalateIn, NoteIn, OfficerDecisionIn, RejectIn, RequestDocumentsIn, ResolveIn, TransferIn
from app.services.container import ServiceContainer

router = APIRouter(prefix="/officer", tags=["officer"])
OFFICER = require_roles(*STAFF)


def _org(user: User) -> uuid.UUID | None:
    return None if user.role == UserRole.ADMIN else user.organization_id


async def _case(c: ServiceContainer, user: User, ref: str) -> Case:
    return await c.access.case_for(user, ref)


@router.get("/stats", summary="Queue counts")
async def stats(user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    s, org = c.session, _org(user)

    def scoped(q):
        return q.join(Case, Case.id == LifeEventNode.case_id).where(Case.organization_id == org) if org else q

    pending = await c.approvals_repo.count(c.approvals_repo.pending(org))
    blocked = await s.scalar(scoped(select(func.count(func.distinct(LifeEventNode.case_id))).select_from(LifeEventNode)).where(
        LifeEventNode.state.in_([NodeState.BLOCKED, NodeState.DOCUMENT_MISSING, NodeState.REJECTED])))
    stalled = await s.scalar(scoped(select(func.count(func.distinct(LifeEventNode.case_id))).select_from(LifeEventNode)).where(
        LifeEventNode.state == NodeState.STALLED))
    escalations = await c.escalations_repo.count(c.escalations_repo.queue(org))
    active = await c.cases_repo.count(c.cases_repo.for_staff(org).where(Case.status.in_(ACTIVE_CASE_STATES)))
    return {"pending_approval": pending, "blocked": blocked or 0, "stalled": stalled or 0, "escalations": escalations, "active_cases": active}


@router.get("/cases", summary="Case list with risk, SLA and the officer action needed")
async def cases(queue: str = Query("all", pattern="^(all|pending|blocked|stalled|escalations|active|completed)$"), q: str | None = Query(None, max_length=40),
                limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), user: User = Depends(OFFICER),
                c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    org = _org(user)
    query = c.cases_repo.for_staff(org, q=q)
    if queue == "pending":
        query = query.where(Case.id.in_(select(Approval.case_id).where(Approval.state == ApprovalState.PENDING)))
    elif queue == "blocked":
        query = query.where(Case.id.in_(select(LifeEventNode.case_id).where(
            LifeEventNode.state.in_([NodeState.BLOCKED, NodeState.DOCUMENT_MISSING, NodeState.REJECTED]))))
    elif queue == "stalled":
        query = query.where(Case.id.in_(select(LifeEventNode.case_id).where(LifeEventNode.state == NodeState.STALLED)))
    elif queue == "escalations":
        query = query.where(Case.id.in_(select(Escalation.case_id).where(Escalation.status != EscalationStatus.RESOLVED)))
    elif queue == "active":
        query = query.where(Case.status.in_(ACTIVE_CASE_STATES))
    elif queue == "completed":
        query = query.where(Case.status.notin_(ACTIVE_CASE_STATES))
    items, total = await c.cases_repo.page(query, limit=limit, offset=offset)
    return page([await c.cases.list_view(x) for x in items], total, limit, offset)


@router.get("/cases/{ref}", summary="Everything an officer needs to decide, in one call")
async def case_detail(ref: str, user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(c, user, ref)
    timeline, _ = await c.timeline_repo.page(c.timeline_repo.for_case(case.id), limit=80)
    audit, _ = await c.audit_repo.page(c.audit_repo.search(case_id=case.id), limit=80)
    calls, _ = await c.calls_repo.page(c.calls_repo.for_case(case.id), limit=10)
    callbacks, _ = await c.callbacks_repo.page(c.callbacks_repo.listing(case_id=case.id), limit=30)
    approvals = await c.approvals_repo.for_case(case.id)
    reviews = await c.reviews_repo.for_case(case.id)
    nodes = {n.id: n for n in await c.nodes_repo.for_case(case.id)}
    officers = {u.id: u for u in await c.users_repo.officers(None)}
    from app.models.call import AgentSession

    orchestrator = await c.session.scalar(select(AgentSession).where(AgentSession.thread_id == f"case:{case.id}"))
    await c.events.audit("OfficerCaseOpened", actor=Actor.user(user), case_id=case.id)
    await c.commit()
    return {
        "case": await c.cases.view(case, user),
        "graph": await c.graph.snapshot(case),
        "timeline": [{"id": str(e.id), "event_type": e.event_type, "title": e.title, "description": e.description, "source": e.source.value,
                      "actor": e.actor, "actor_type": e.actor_type.value, "status": e.status, "node_key": e.node_key,
                      "resident_present": e.resident_present, "occurred_at": e.occurred_at.isoformat()} for e in timeline],
        "documents": await c.documents.view(case),
        "calls": [await c.calls.view(x) for x in calls],
        "consents": await c.consents.view(case),
        "opt_outs": [{"active": o.active, "source": o.source, "reason": o.reason, "created_at": o.created_at.isoformat()}
                     for o in await c.optouts_repo.for_case(case.id)],
        "verification": await c.verification.view(case),
        "entity_requests": await c.entities.requests_view(case),
        "approvals": [{"id": str(a.id), "node_key": nodes[a.node_id].key if a.node_id in nodes else None,
                       "node_title": nodes[a.node_id].title if a.node_id in nodes else None, "state": a.state.value, "summary": a.summary,
                       "fields": a.fields, "requested_at": a.requested_at.isoformat(), "requested_by": a.requested_by,
                       "decided_at": a.decided_at.isoformat() if a.decided_at else None,
                       "decided_by": officers[a.decided_by_id].full_name if a.decided_by_id in officers else None, "reason": a.reason}
                      for a in approvals],
        "reviews": [{"decision": r.decision.value, "node_key": r.node_key, "notes": r.notes,
                     "officer": officers[r.officer_id].full_name if r.officer_id in officers else "Administrator",
                     "created_at": r.created_at.isoformat()} for r in reviews],
        "escalations": [await c.escalations.view(e) for e in await c.escalations_repo.for_case(case.id)],
        "callbacks": [c.callbacks.view(cb, case.reference) for cb in callbacks],
        "audit": [{"id": str(a.id), "occurred_at": a.occurred_at.isoformat(), "actor": a.actor_label, "actor_type": a.actor_type.value,
                   "action": a.action, "source": a.source.value, "result": a.result, "node_key": a.node_key, "trace_id": a.trace_id}
                  for a in audit],
        "orchestrator": {"runs": orchestrator.path if orchestrator else [], "steps": orchestrator.steps if orchestrator else 0},
        "extracted_fields": {str(x.id): x.extracted_fields for x in calls if x.extracted_fields},
    }


@router.get("/approvals", summary="Submissions awaiting release")
async def approvals(user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    items, _ = await c.approvals_repo.page(c.approvals_repo.pending(_org(user)), limit=100)
    out = []
    for a in items:
        node = await c.nodes_repo.get(a.node_id)
        case = await c.cases_repo.get(a.case_id)
        out.append({"id": str(a.id), "case_reference": case.reference, "node_key": node.key, "node_title": node.title,
                    "entity_label": node.entity_label, "summary": a.summary, "fields": a.fields, "requested_at": a.requested_at.isoformat(),
                    "risk": case.risk.value, "deadline": c.cases.deadline(case)})
    return out


@router.post("/approvals/{approval_id}/approve", summary="Approve & Release (officer only; audited)")
async def approve(approval_id: uuid.UUID, body: OfficerDecisionIn, user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    approval = await c.approvals.approve(approval_id, user, body.note)
    await c.commit()
    return {"id": str(approval.id), "state": approval.state.value}


@router.post("/approvals/{approval_id}/reject", summary="Reject a prepared submission (officer only; audited)")
async def reject(approval_id: uuid.UUID, body: RejectIn, user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    approval = await c.approvals.reject(approval_id, user, body.reason)
    await c.commit()
    return {"id": str(approval.id), "state": approval.state.value}


@router.post("/cases/{ref}/request-documents", summary="Request documents from the resident")
async def request_documents(ref: str, body: RequestDocumentsIn, user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(c, user, ref)
    node = await c.approvals.request_documents(case, user, body.node_key, [d.upper() for d in body.documents], body.note)
    await c.commit()
    return {"node_key": node.key, "state": node.state.value}


@router.post("/cases/{ref}/escalate", summary="Escalate the case")
async def escalate(ref: str, body: EscalateIn, user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(c, user, ref)
    await c.access.officiate(user, case, "Escalate")
    esc = await c.escalations.open(case, EscalationReason(body.reason), actor=Actor.user(user), node_key=body.node_key, summary=body.note)
    await c.commit()
    return await c.escalations.view(esc)


@router.post("/cases/{ref}/transfer", summary="Transfer the case to another officer")
async def transfer(ref: str, body: TransferIn, user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(c, user, ref)
    await c.approvals.transfer(case, user, uuid.UUID(body.to_officer_id), body.note)
    await c.commit()
    return {"assigned_officer_id": str(case.assigned_officer_id)}


@router.post("/cases/{ref}/notes", summary="Add an officer note")
async def note(ref: str, body: NoteIn, user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(c, user, ref)
    await c.approvals.add_note(case, user, body.note, body.node_key)
    await c.commit()
    return {"ok": True}


@router.post("/cases/{ref}/nodes/{node_key}/retry", summary="Retry a submission that stalled because the authority was down")
async def retry(ref: str, node_key: str, user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(c, user, ref)
    node = await c.entities.node_by_key(case, node_key)
    await c.entities.retry(case, node, user)
    await c.commit()
    return {"node_key": node_key, "state": node.state.value}


@router.post("/cases/{ref}/nodes/{node_key}/prepare", summary="Re-prepare a blocked or rejected node for release")
async def prepare(ref: str, node_key: str, user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(c, user, ref)
    await c.access.officiate(user, case, "PrepareNode")
    node = await c.entities.node_by_key(case, node_key)
    await c.approvals.request(case, node, note=f"Re-prepared by {user.full_name}")
    await c.commit()
    return {"node_key": node_key, "state": node.state.value}


@router.get("/escalations", summary="Open escalations (warm handovers)")
async def escalations(include_resolved: bool = False, user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    items, _ = await c.escalations_repo.page(c.escalations_repo.queue(_org(user), include_resolved=include_resolved), limit=100)
    return [await c.escalations.view(e) for e in items]


@router.post("/escalations/{escalation_id}/take", summary="Take an escalation")
async def take(escalation_id: uuid.UUID, user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    esc = await c.escalations.take(escalation_id, user)
    await c.commit()
    return await c.escalations.view(esc)


@router.post("/escalations/{escalation_id}/resolve", summary="Resolve an escalation")
async def resolve(escalation_id: uuid.UUID, body: ResolveIn, user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    esc = await c.escalations.resolve(escalation_id, user, body.resolution)
    await c.commit()
    return await c.escalations.view(esc)


@router.get("/callbacks", summary="Callbacks across the service centre")
async def callbacks(limit: int = Query(100, ge=1, le=300), user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    case_ids = c.cases_repo.for_staff(_org(user)).with_only_columns(Case.id).order_by(None)
    items, _ = await c.callbacks_repo.page(c.callbacks_repo.listing(case_ids=case_ids), limit=limit)
    refs = {x.id: x.reference for x in (await c.session.scalars(select(Case).where(Case.id.in_([i.case_id for i in items])))).all()} if items else {}
    return [c.callbacks.view(cb, refs.get(cb.case_id)) for cb in items]


@router.get("/audit", summary="Audit log (paginated)")
async def audit(case: str | None = None, action: str | None = Query(None, max_length=80), actor_type: str | None = Query(None, max_length=30),
                limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0), user: User = Depends(OFFICER),
                c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case_id = (await _case(c, user, case)).id if case else None
    query = c.audit_repo.search(case_id=case_id, action=action, actor_type=actor_type)
    if case_id is None and user.role != UserRole.ADMIN:
        query = query.where(c.audit_repo.model.case_id.in_(c.cases_repo.for_staff(user.organization_id).with_only_columns(Case.id).order_by(None)))
    items, total = await c.audit_repo.page(query, limit=limit, offset=offset)
    refs = {x.id: x.reference for x in (await c.session.scalars(select(Case).where(Case.id.in_([i.case_id for i in items if i.case_id])))).all()} if items else {}
    return page([{"id": str(a.id), "occurred_at": a.occurred_at.isoformat(), "actor": a.actor_label, "actor_type": a.actor_type.value,
                  "action": a.action, "case_reference": refs.get(a.case_id), "node_key": a.node_key, "source": a.source.value, "result": a.result,
                  "trace_id": a.trace_id, "request_id": a.request_id, "details": a.details} for a in items], total, limit, offset)


@router.get("/analytics", summary="Canvas KPIs and DEMO / SIMULATED operational metrics")
async def analytics(user: User = Depends(OFFICER), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return await c.analytics.overview(_org(user))
