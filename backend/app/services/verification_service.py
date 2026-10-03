"""Caller verification without secrets (canvas box K).

UAE Pass one-tap when available (simulated in this prototype and labelled as such); otherwise two non-secret facts
already in the case file: the child's date of birth and the hospital of birth. Never an Emirates ID number, never a
password. Two failures in one call trigger a warm transfer to an Amer officer.
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from app.core.dates import parse_spoken_date
from app.events.recorder import Actor
from app.models.call import CallSession
from app.models.case import Case
from app.models.enums import EscalationReason, Source, VerificationMethod
from app.models.verification import VerificationAttempt

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

FACTS = ("child_date_of_birth", "place_of_birth")
STOP = {"hospital", "the", "of", "in", "at", "medical", "centre", "center", "clinic", "مستشفى", "अस्पताल", "ہسپتال", "ആശുപത്രി", "ospital"}


def _tokens(text: str) -> set[str]:
    return {w for w in re.findall(r"\w+", (text or "").lower()) if w not in STOP and len(w) > 2}


class VerificationService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def _record(self, case: Case, call: CallSession | None, method: VerificationMethod, success: bool, reason: str | None) -> int:
        failures = await self.c.verifications_repo.failures(case.id, call.id if call else None)
        self.c.session.add(VerificationAttempt(case_id=case.id, call_session_id=call.id if call else None, method=method,
                                               success=success, attempt_no=failures + 1,
                                               facts_checked=list(FACTS) if method == VerificationMethod.KNOWLEDGE_FACTS else [],
                                               failure_reason=reason))
        if call is not None:
            await self.c.infra.cache.set(f"verify:{call.id}", {"failures": failures + (0 if success else 1), "verified": success}, ttl=3600)
        return failures + (0 if success else 1)

    async def check_facts(self, case: Case, call: CallSession | None, *, date_of_birth: str, hospital: str) -> dict[str, Any]:
        child = await self.c.cases_repo.child(case.id)
        dob_ok = bool(child and parse_spoken_date(date_of_birth) == child.date_of_birth)
        expected = _tokens(child.place_of_birth if child else "")
        hospital_ok = bool(expected and expected & _tokens(hospital))
        success = dob_ok and hospital_ok
        failures = await self._record(case, call, VerificationMethod.KNOWLEDGE_FACTS, success, None if success else "Facts did not match the case file")
        return await self._outcome(case, call, success, failures, VerificationMethod.KNOWLEDGE_FACTS)

    async def uae_pass(self, case: Case, call: CallSession | None, *, approved: bool = True) -> dict[str, Any]:
        """UAE Pass one-tap (SIMULATED in this prototype: a production build would use the UAE Pass mobile approval flow)."""
        failures = await self._record(case, call, VerificationMethod.UAE_PASS, approved, None if approved else "UAE Pass request declined")
        return await self._outcome(case, call, approved, failures, VerificationMethod.UAE_PASS)

    async def _outcome(self, case: Case, call: CallSession | None, success: bool, failures: int, method: VerificationMethod) -> dict[str, Any]:
        actor = Actor.agent()
        if success:
            if call is not None:
                call.verified, call.verification_method = True, method.value
            await self.c.events.emit("VerificationSucceeded", case_id=case.id, actor=actor, source=Source.AI_AGENT,
                                     title="Caller verified", description=f"Method: {'UAE Pass (simulated)' if method == VerificationMethod.UAE_PASS else 'two facts from the case file'}",
                                     payload={"method": method.value}, i18n={"key": "timeline.verified", "params": {"method": method.value}})
            return {"verified": True, "failures": failures, "escalated": False, "method": method.value}
        await self.c.events.emit("VerificationFailed", case_id=case.id, actor=actor, source=Source.AI_AGENT,
                                 title=f"Verification failed (attempt {failures})", payload={"method": method.value, "failures": failures},
                                 i18n={"key": "timeline.verificationFailed", "params": {"attempt": str(failures), "method": method.value}})
        escalated = False
        if failures >= 2:
            await self.c.escalations.open(case, EscalationReason.TWO_FAILED_VERIFICATIONS, actor=actor, call=call, warm_transfer=call is not None,
                                          summary="Two failed verification attempts on a call. No case details were shared.")
            escalated = True
        return {"verified": False, "failures": failures, "escalated": escalated, "method": method.value}

    async def view(self, case: Case) -> list[dict[str, Any]]:
        return [{"id": str(v.id), "method": v.method.value, "success": v.success, "attempt_no": v.attempt_no, "facts_checked": v.facts_checked,
                 "failure_reason": v.failure_reason, "call_session_id": str(v.call_session_id) if v.call_session_id else None,
                 "created_at": v.created_at.isoformat()} for v in await self.c.verifications_repo.for_case(case.id)]
