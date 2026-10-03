"""Human handover (H): two failed verifications, SLA stall, consulate stall, distress, approval questions,
disputed records. A named Amer officer receives the case; in a live call the agent warm-transfers."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from app.core.clock import utcnow
from app.core.errors import Conflict, NotFound
from app.events.recorder import Actor
from app.models.call import CallSession
from app.models.case import Case
from app.models.enums import CallState, EscalationReason, EscalationStatus, OfficerDecision, Source
from app.models.officer import Escalation, OfficerReview
from app.models.user import User

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

REASON_LABELS = {
    EscalationReason.TWO_FAILED_VERIFICATIONS: "two failed verifications",
    EscalationReason.SLA_STALL: "stalled past its SLA",
    EscalationReason.CONSULATE_STALL: "consulate step stalled",
    EscalationReason.DISTRESS: "resident in distress",
    EscalationReason.APPROVAL_QUESTION: "question about an approval decision",
    EscalationReason.DISPUTED_RECORD: "disputed record",
    EscalationReason.RESIDENT_REQUEST: "resident asked for a person",
    EscalationReason.ENTITY_REJECTION: "authority did not approve",
    EscalationReason.OFFICER_REFERRAL: "officer referral",
}


class EscalationService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def open(self, case: Case, reason: EscalationReason, *, actor: Actor, node_key: str | None = None, summary: str = "",
                   call: CallSession | None = None, warm_transfer: bool = False) -> Escalation:
        for existing in await self.c.escalations_repo.open_for_case(case.id):
            if existing.reason == reason and existing.node_key == node_key:
                return existing
        officer_id = case.assigned_officer_id
        if officer_id is None:
            officers = await self.c.users_repo.officers(case.organization_id)
            officer_id = officers[0].id if officers else None
        officer = await self.c.users_repo.get(officer_id) if officer_id else None
        esc = Escalation(case_id=case.id, node_key=node_key, reason=reason, status=EscalationStatus.OPEN, assigned_officer_id=officer_id,
                         warm_transfer=warm_transfer, call_session_id=call.id if call else None, summary=summary,
                         opened_by=actor.type.value, opened_at=utcnow())
        self.c.session.add(esc)
        await self.c.session.flush()
        if warm_transfer and call is not None and call.state == CallState.ACTIVE:
            call.state, call.transferred_to_id = CallState.TRANSFERRED, officer_id
            await self.c.events.emit("CallTransferred", case_id=case.id, actor=actor, source=Source.AI_AGENT,
                                     title=f"Call warm-transferred to {officer.full_name if officer else 'an Amer officer'}",
                                     description="The officer receives the case, the transcript and the reason - the resident does not repeat anything.",
                                     payload={"call_session_id": str(call.id), "escalation_id": str(esc.id)},
                                     i18n={"key": "timeline.callTransferred", "params": {"reason": reason.value}})
        await self.c.events.emit("HumanEscalationRequired", case_id=case.id, node_key=node_key, actor=actor,
                                 source=Source.HUMAN_OFFICER if actor.type.value in ("OFFICER", "ADMIN") else Source.AI_AGENT,
                                 title=f"Handed to {officer.full_name if officer else 'an Amer officer'}: {REASON_LABELS[reason]}",
                                 description=summary, payload={"escalation_id": str(esc.id), "reason": reason.value,
                                 "warm_transfer": warm_transfer, "officer": officer.full_name if officer else None},
                                 i18n={"key": "timeline.escalated", "params": {"reason": reason.value}})
        if officer is not None:
            await self.c.notifications.notify_officer(case, "Escalation", f"Case {case.reference}: {REASON_LABELS[reason]}.", officer=officer)
        await self.c.cases.refresh(case)
        return esc

    async def resolve(self, escalation_id: uuid.UUID, officer: User, resolution: str) -> Escalation:
        esc = await self.c.escalations_repo.get(escalation_id)
        if esc is None:
            raise NotFound("Escalation not found")
        case = await self.c.cases_repo.get(esc.case_id)
        assert case is not None
        await self.c.access.officiate(officer, case, "ResolveEscalation")
        if esc.status == EscalationStatus.RESOLVED:
            raise Conflict("Already resolved.")
        esc.status, esc.resolved_at, esc.resolution = EscalationStatus.RESOLVED, utcnow(), resolution
        self.c.session.add(OfficerReview(case_id=case.id, node_key=esc.node_key, officer_id=officer.id, decision=OfficerDecision.RESOLVED,
                                         notes=resolution, details={"escalation_id": str(esc.id)}))
        await self.c.events.emit("EscalationResolved", case_id=case.id, node_key=esc.node_key, actor=Actor.user(officer),
                                 source=Source.HUMAN_OFFICER, title=f"Escalation resolved by {officer.full_name}", description=resolution,
                                 payload={"escalation_id": str(esc.id)},
                                 i18n={"key": "timeline.escalationResolved", "params": {"reason": esc.reason.value}})
        await self.c.cases.refresh(case)
        return esc

    async def take(self, escalation_id: uuid.UUID, officer: User) -> Escalation:
        esc = await self.c.escalations_repo.get(escalation_id)
        if esc is None:
            raise NotFound("Escalation not found")
        case = await self.c.cases_repo.get(esc.case_id)
        assert case is not None
        await self.c.access.officiate(officer, case, "TakeEscalation")
        esc.assigned_officer_id, esc.status = officer.id, EscalationStatus.IN_PROGRESS
        return esc

    async def view(self, esc: Escalation) -> dict[str, Any]:
        officer = await self.c.users_repo.get(esc.assigned_officer_id) if esc.assigned_officer_id else None
        case = await self.c.cases_repo.get(esc.case_id)
        return {"id": str(esc.id), "case_id": str(esc.case_id), "case_reference": case.reference if case else None, "node_key": esc.node_key,
                "reason": esc.reason.value, "reason_label": REASON_LABELS[esc.reason], "status": esc.status.value,
                "warm_transfer": esc.warm_transfer, "summary": esc.summary, "opened_by": esc.opened_by,
                "assigned_officer": {"id": str(officer.id), "full_name": officer.full_name} if officer else None,
                "opened_at": esc.opened_at.isoformat(), "resolved_at": esc.resolved_at.isoformat() if esc.resolved_at else None,
                "resolution": esc.resolution}
