"""The human approval gate (canvas box K): the agent only prepares; an Amer officer releases every submission.

Approve & Release, Reject, Request documents, Transfer and officer notes all live here and all require an officer
(or admin) of the case's service centre. The agent's tool registry has no route into this service.
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from app.core.clock import utcnow
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.events.recorder import Actor
from app.models.case import Case
from app.models.enums import ApprovalState, NodeState, OfficerDecision, Source, UserRole
from app.models.graph import LifeEventNode
from app.models.officer import Approval, OfficerReview
from app.models.user import User
from app.workflows.birth_expat import DOCUMENTS

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

REQUESTABLE_FROM = {NodeState.READY, NodeState.DOCUMENT_MISSING, NodeState.BLOCKED, NodeState.REJECTED, NodeState.STALLED}


class ApprovalService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def request(self, case: Case, node: LifeEventNode, *, note: str = "") -> Approval:
        """Prepare a submission and park it for officer release (WAITING_FOR_HUMAN)."""
        existing = await self.c.approvals_repo.pending_for_node(node.id)
        if existing:
            return existing
        if node.state not in REQUESTABLE_FROM:
            raise Conflict(f"{node.title} cannot be prepared from {node.state.value}")
        if node.state == NodeState.STALLED:
            await self.c.graph.transition(node, NodeState.READY, source=Source.SYSTEM, status="Re-preparing after a stall")
        approval = Approval(case_id=case.id, node_id=node.id, state=ApprovalState.PENDING, requested_at=utcnow(),
                            summary=note or f"File {node.title.lower()} with {node.entity_label} (mock).",
                            fields=await self.c.entities.preview_fields(case, node))
        self.c.session.add(approval)
        node.approval_state = ApprovalState.PENDING
        await self.c.session.flush()
        await self.c.graph.transition(node, NodeState.WAITING_FOR_HUMAN, source=Source.AI_AGENT, actor=Actor.agent("LifeLoop orchestrator"),
                                      status="Prepared by LifeLoop - awaiting officer release")
        await self.c.events.emit("ApprovalRequested", case_id=case.id, node_key=node.key, actor=Actor.agent("LifeLoop orchestrator"),
                                 source=Source.AI_AGENT, timeline=False, payload={"approval_id": str(approval.id)})
        await self.c.notifications.notify_officer(case, f"{node.title} ready for release", f"Case {case.reference}: {node.title} is prepared and awaits your release.")
        return approval

    async def _load(self, approval_id: uuid.UUID) -> tuple[Approval, LifeEventNode, Case]:
        approval = await self.c.approvals_repo.get(approval_id)
        if approval is None:
            raise NotFound("Approval not found")
        node = await self.c.nodes_repo.get(approval.node_id)
        case = await self.c.cases_repo.get(approval.case_id)
        assert node is not None and case is not None
        return approval, node, case

    async def approve(self, approval_id: uuid.UUID, officer: User, note: str = "") -> Approval:
        approval, node, case = await self._load(approval_id)
        await self.c.access.officiate(officer, case, "ApproveRelease")
        if approval.state != ApprovalState.PENDING or node.state != NodeState.WAITING_FOR_HUMAN:
            raise Conflict("This submission is no longer awaiting release.", code="not_pending")
        missing = await self.c.documents.missing_for_node(case, node)
        if missing:
            raise Conflict(f"Cannot release: missing {', '.join(d.title for d in missing)}. Request the documents first.", code="documents_missing")
        approval.state, approval.decided_at, approval.decided_by_id, approval.reason = ApprovalState.APPROVED, utcnow(), officer.id, note or None
        node.approval_state = ApprovalState.APPROVED
        self.c.session.add(OfficerReview(case_id=case.id, node_key=node.key, approval_id=approval.id, officer_id=officer.id,
                                         decision=OfficerDecision.APPROVED, notes=note))
        await self.c.events.emit("OfficerApproved", case_id=case.id, node_key=node.key, actor=Actor.user(officer), source=Source.HUMAN_OFFICER,
                                 title=f"{node.title} approved and released by {officer.full_name}", description=note,
                                 payload={"approval_id": str(approval.id)}, i18n={"key": "timeline.officerApproved", "params": {"node": node.key}})
        await self.c.entities.release(case, node, approval, officer)
        return approval

    async def reject(self, approval_id: uuid.UUID, officer: User, reason: str) -> Approval:
        if not reason.strip():
            raise ValidationFailed("Give a reason so the resident and the audit trail can see why.")
        approval, node, case = await self._load(approval_id)
        await self.c.access.officiate(officer, case, "RejectSubmission")
        if approval.state != ApprovalState.PENDING:
            raise Conflict("This submission is no longer awaiting release.", code="not_pending")
        approval.state, approval.decided_at, approval.decided_by_id, approval.reason = ApprovalState.REJECTED, utcnow(), officer.id, reason
        node.approval_state = ApprovalState.REJECTED
        self.c.session.add(OfficerReview(case_id=case.id, node_key=node.key, approval_id=approval.id, officer_id=officer.id,
                                         decision=OfficerDecision.REJECTED, notes=reason))
        await self.c.events.emit("OfficerRejected", case_id=case.id, node_key=node.key, actor=Actor.user(officer), source=Source.HUMAN_OFFICER,
                                 title=f"{node.title} not released by {officer.full_name}", description=reason, payload={"approval_id": str(approval.id)},
                                 i18n={"key": "timeline.officerRejected", "params": {"node": node.key}})
        await self.c.graph.transition(node, NodeState.BLOCKED, source=Source.HUMAN_OFFICER, actor=Actor.user(officer),
                                      reason=f"Officer did not release: {reason}")
        return approval

    async def request_documents(self, case: Case, officer: User, node_key: str, doc_types: list[str], note: str = "") -> LifeEventNode:
        await self.c.access.officiate(officer, case, "RequestDocuments")
        node = await self.c.nodes_repo.by_key(case.id, node_key)
        if node is None:
            raise NotFound("Node not found")
        unknown = [d for d in doc_types if d not in DOCUMENTS]
        if not doc_types or unknown:
            raise ValidationFailed("Choose at least one known document type.")
        pending = await self.c.approvals_repo.pending_for_node(node.id)
        if pending:
            pending.state, pending.decided_at, pending.decided_by_id = ApprovalState.CANCELLED, utcnow(), officer.id
            node.approval_state = None
        titles = await self.c.documents.mark_missing(case, doc_types, note or f"Requested by {officer.full_name}")
        self.c.session.add(OfficerReview(case_id=case.id, node_key=node.key, officer_id=officer.id, decision=OfficerDecision.DOCUMENTS_REQUESTED,
                                         notes=note, details={"documents": doc_types}))
        await self.c.events.emit("OfficerRequestedDocuments", case_id=case.id, node_key=node.key, actor=Actor.user(officer),
                                 source=Source.HUMAN_OFFICER, title=f"Officer requested: {', '.join(titles)}", description=note,
                                 payload={"documents": doc_types},
                                 i18n={"key": "timeline.documentsRequested", "params": {"node": node.key, "docs": ",".join(doc_types)}})
        if node.state != NodeState.DOCUMENT_MISSING:
            await self.c.graph.transition(node, NodeState.DOCUMENT_MISSING, source=Source.HUMAN_OFFICER, actor=Actor.user(officer),
                                          reason=", ".join(titles), i18n_params={"docs": ",".join(doc_types)})
        return node

    async def transfer(self, case: Case, officer: User, to_officer_id: uuid.UUID, note: str = "") -> Case:
        await self.c.access.officiate(officer, case, "TransferCase")
        target = await self.c.users_repo.get(to_officer_id)
        if target is None or target.role not in (UserRole.OFFICER, UserRole.ADMIN) or not target.is_active:
            raise ValidationFailed("Transfer to an active officer.")
        case.assigned_officer_id = target.id
        if target.organization_id:
            case.organization_id = target.organization_id
        self.c.session.add(OfficerReview(case_id=case.id, officer_id=officer.id, decision=OfficerDecision.TRANSFERRED, notes=note,
                                         details={"to": str(target.id)}))
        await self.c.events.emit("CaseTransferred", case_id=case.id, actor=Actor.user(officer), source=Source.HUMAN_OFFICER,
                                 title=f"Case transferred to {target.full_name}", description=note, payload={"to_officer_id": str(target.id)},
                                 i18n={"key": "timeline.caseTransferred", "params": {}})
        return case

    async def add_note(self, case: Case, officer: User, note: str, node_key: str | None = None) -> OfficerReview:
        await self.c.access.officiate(officer, case, "OfficerNote")
        review = OfficerReview(case_id=case.id, node_key=node_key, officer_id=officer.id, decision=OfficerDecision.NOTE, notes=note)
        self.c.session.add(review)
        await self.c.events.audit("OfficerNote", actor=Actor.user(officer), case_id=case.id, node_key=node_key, source=Source.HUMAN_OFFICER)
        return review
