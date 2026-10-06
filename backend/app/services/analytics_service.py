"""Analytics: the canvas KPIs (baseline vs target) and measured DEMO / SIMULATED metrics from this database.

Nothing here is a production result. Baselines and targets come from the Idea Canvas (boxes D and M); the measured
figures come from demo cases running against mock authorities and are labelled as such.
"""
from __future__ import annotations

from collections import Counter
from typing import TYPE_CHECKING, Any

from sqlalchemy import func, select

from app.models.call import CallSession
from app.models.callback import Callback
from app.models.case import Case
from app.models.case_event import CaseEvent
from app.models.consent import OptOut
from app.models.enums import DONE_STATES, ApprovalState, NodeType
from app.models.graph import LifeEventNode
from app.models.officer import Approval, Escalation
from app.models.verification import VerificationAttempt

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

CANVAS_KPIS = [
    {"id": "entities", "label": "Entities the family contacts and tracks itself, per birth", "baseline": 6, "target": 1,
     "target_note": "The agent; the consulate appointment stays with the family.",
     "measured_by": "Distinct entity contacts logged per closed case", "source": "Idea Canvas boxes D and M"},
    {"id": "visits", "label": "Separate visits or portal sessions per family, birth to Emirates ID", "baseline": 7, "target": 2,
     "target_note": "Consulate appointment and ICP biometrics.", "measured_by": "Case-timeline events flagged 'resident present'",
     "source": "Idea Canvas boxes D and M"},
    {"id": "reentry", "label": "Re-entries of the same parent and child details across the chain", "baseline": 6, "target": 1,
     "target_note": "Captured once on call one.", "measured_by": "Fields written on call one vs re-collected later (passport write log)",
     "source": "Idea Canvas boxes D and M"},
]


class AnalyticsService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def overview(self, organization_id=None) -> dict[str, Any]:
        s = self.c.session
        case_q = select(Case)
        if organization_id:
            case_q = case_q.where(Case.organization_id == organization_id)
        cases = list((await s.scalars(case_q)).all())
        ids = [c.id for c in cases]
        nodes = list((await s.scalars(select(LifeEventNode).where(LifeEventNode.case_id.in_(ids)))).all()) if ids else []
        present = dict((await s.execute(select(CaseEvent.case_id, func.count()).where(CaseEvent.case_id.in_(ids), CaseEvent.resident_present.is_(True))
                                         .group_by(CaseEvent.case_id))).all()) if ids else {}
        n = max(len(cases), 1)
        family_entities = sum(1 for x in nodes if x.type == NodeType.PARENT_REPORTED) / n
        visits = sum(present.values()) / n
        entry_sessions = sum(len({(v or {}).get("source") for v in (c.passport or {}).values()} or {"-"}) + c.re_entry_count for c in cases) / n
        measured = {"entities": round(family_entities, 2), "visits": round(visits, 2), "reentry": round(entry_sessions, 2)}
        callbacks = Counter(cb.status.value for cb in (await s.scalars(select(Callback).where(Callback.case_id.in_(ids)))).all()) if ids else Counter()
        escalations = Counter(e.reason.value for e in (await s.scalars(select(Escalation).where(Escalation.case_id.in_(ids)))).all()) if ids else Counter()
        durations: dict[str, list[float]] = {}
        for x in nodes:
            if x.state in DONE_STATES and x.submitted_at and x.cleared_at:
                durations.setdefault(x.key, []).append((x.cleared_at - x.submitted_at).total_seconds() / 3600)
        verifications = list((await s.scalars(select(VerificationAttempt).where(VerificationAttempt.case_id.in_(ids)))).all()) if ids else []
        bottlenecks = await self.c.infra.neo4j.bottlenecks()
        bottleneck_source = "neo4j"
        if bottlenecks is None:
            bottleneck_source = "postgres"
            counts = Counter((x.key, x.entity.value, x.state.value) for x in nodes
                             if x.state.value in ("STALLED", "BLOCKED", "DOCUMENT_MISSING", "REJECTED", "WAITING_FOR_PARENT"))
            bottlenecks = [{"key": k, "entity": e, "state": st, "cases": v} for (k, e, st), v in counts.most_common()]
        return {
            "label": "DEMO / SIMULATED - measured on demo cases against mock authorities; not production results",
            "kpis": [{**k, "measured": measured[k["id"]]} for k in CANVAS_KPIS],
            "cases": {"total": len(cases), "by_status": dict(Counter(c.status.value for c in cases)), "by_risk": dict(Counter(c.risk.value for c in cases))},
            "nodes": {"by_state": dict(Counter(x.state.value for x in nodes)),
                      "by_key_state": {k: dict(Counter(x.state.value for x in nodes if x.key == k)) for k in {x.key for x in nodes}}},
            "avg_hours_to_clear": {k: round(sum(v) / len(v), 1) for k, v in durations.items()},
            "callbacks": dict(callbacks), "escalations": dict(escalations),
            "approvals_pending": await s.scalar(select(func.count()).select_from(Approval).where(Approval.state == ApprovalState.PENDING,
                                                                                              Approval.case_id.in_(ids))) if ids else 0,
            "opt_outs": await s.scalar(select(func.count()).select_from(OptOut).where(OptOut.case_id.in_(ids), OptOut.active.is_(True))) if ids else 0,
            "calls": await s.scalar(select(func.count()).select_from(CallSession).where(CallSession.case_id.in_(ids))) if ids else 0,
            "verification": {"attempts": len(verifications), "succeeded": sum(1 for v in verifications if v.success)},
            "bottlenecks": {"source": bottleneck_source, "items": bottlenecks},
        }
