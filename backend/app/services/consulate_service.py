"""The consulate node: NO API, NO SLA, NO status feed. LifeLoop asks; the parent reports; LifeLoop never claims.

Every milestone is stored with reported_at, reported_by, reported_status, passport_number_present (never the
number), appointment_date, notes and source = PARENT_REPORTED, and the graph moves on that basis only. When the
parent reports the passport issued, the downstream visa filing is re-planned immediately (canvas box N).
"""
from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING, Any

from app.core.clock import utcnow
from app.core.errors import Conflict, ValidationFailed
from app.core.pii import redact_text
from app.events.recorder import Actor
from app.models.case import Case
from app.models.enums import DONE_STATES, DocumentStatus, EscalationReason, NodeState, Source

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

MILESTONES: dict[str, dict[str, Any]] = {
    "APPOINTMENT_BOOKED": {"label": "Consulate appointment booked", "state": NodeState.WAITING_FOR_PARENT},
    "APPLICATION_SUBMITTED": {"label": "Passport application submitted at the consulate", "state": NodeState.PROCESSING},
    "PASSPORT_ISSUED": {"label": "Passport issued", "state": NodeState.COMPLETED},
    "DELAYED": {"label": "Parent reports no progress at the consulate", "state": NodeState.STALLED},
}
OPEN_STATES = {NodeState.WAITING_FOR_PARENT, NodeState.PROCESSING, NodeState.STALLED}


class ConsulateService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def report(self, case: Case, milestone: str, *, actor: Actor, channel: str, appointment_date: date | None = None,
                     passport_number_present: bool = False, notes: str | None = None) -> dict[str, Any]:
        milestone = milestone.upper()
        if milestone not in MILESTONES:
            raise ValidationFailed(f"Unknown milestone. Use one of: {', '.join(MILESTONES)}")
        node = await self.c.nodes_repo.by_key(case.id, "CONSULATE_PASSPORT")
        if node is None or node.state in DONE_STATES:
            raise Conflict("The consulate step is already complete.", code="consulate_complete")
        if node.state not in OPEN_STATES:
            raise Conflict("The consulate step opens after MOFA attestation clears.", code="consulate_not_open")
        if milestone == "PASSPORT_ISSUED" and not passport_number_present:
            raise ValidationFailed("Confirm the passport number is available (LifeLoop does not store the number itself).",
                                   code="passport_number_required")
        spec = MILESTONES[milestone]
        report = {
            "reported_at": utcnow().isoformat(), "reported_by": actor.label, "reported_status": milestone, "label": spec["label"],
            "passport_number_present": passport_number_present, "appointment_date": appointment_date.isoformat() if appointment_date else None,
            "notes": redact_text(notes) if notes else None, "source": "PARENT_REPORTED", "channel": channel,
        }
        history = list((node.parent_report or {}).get("history", []))
        history.append({k: v for k, v in report.items() if k != "history"})
        node.parent_report = {**report, "history": history}
        await self.c.events.emit(
            "ConsulateMilestoneReported", case_id=case.id, node_key=node.key, actor=actor, source=Source.PARENT_REPORTED,
            title=f"Parent reported: {spec['label'].lower()}",
            description="Recorded as parent-reported. LifeLoop cannot verify consulate status.",
            resident_present=milestone == "APPLICATION_SUBMITTED", payload={k: v for k, v in report.items() if k != "notes"},
            i18n={"key": f"consulate.{milestone}", "params": {}},
        )
        target: NodeState = spec["state"]
        if milestone == "DELAYED":
            await self.c.graph.transition(node, NodeState.STALLED, source=Source.PARENT_REPORTED, actor=actor,
                                          reason="Parent reports no progress at the consulate", payload={"stall_kind": "CONSULATE"})
            await self.c.escalations.open(case, EscalationReason.CONSULATE_STALL, node_key=node.key, actor=actor,
                                          summary="Parent reports the consulate passport is not progressing.")
        elif target != node.state:
            await self.c.graph.transition(node, target, source=Source.PARENT_REPORTED, actor=actor, status=f"Parent-reported: {spec['label'].lower()}")
        if milestone == "PASSPORT_ISSUED":
            doc = await self.c.docs_repo.by_type(case.id, "CHILD_PASSPORT")
            if doc and doc.status in (DocumentStatus.REQUIRED, DocumentStatus.MISSING):
                doc.status, doc.declared_available = DocumentStatus.REQUIRED, True
                doc.notes = "Parent reports the passport is issued; bring it for the residence visa."
        return report

    async def status_for_agent(self, case: Case) -> dict[str, Any]:
        node = await self.c.nodes_repo.by_key(case.id, "CONSULATE_PASSPORT")
        report = (node.parent_report or {}) if node else {}
        return {"source": "PARENT_REPORTED", "has_api": False, "has_sla": False, "has_status_feed": False,
                "node_state": node.state.value if node else None, "last_report": {k: v for k, v in report.items() if k != "history"} or None,
                "rule": "Never claim a consulate status. Only repeat what the parent reported, and say it is parent-reported."}
