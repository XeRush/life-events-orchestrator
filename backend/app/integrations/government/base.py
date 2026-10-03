"""GovernmentAdapter port and the mock implementation shared by every simulated authority.

MOCK INTEGRATION: no adapter in this package talks to a real UAE government system. Each mock keeps its
application state in the cache (Redis when available) and simulates SUBMITTED -> PROCESSING -> CLEARED and the
failure paths (BLOCKED, DOCUMENT_MISSING, STALLED, REJECTED). Statuses reach the case only through the same
`get_status` contract a real authority would implement.
"""
from __future__ import annotations

import asyncio
import hashlib
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

from app.core.clock import utcnow
from app.integrations.government.contracts import Requirements, StatusResponse, SubmitRequest, SubmitResponse
from app.models.enums import Entity
from app.workflows.birth_expat import CANVAS

if TYPE_CHECKING:
    from app.integrations.cache.cache import CacheManager


class AdapterError(Exception):
    retriable = False


class AdapterTimeout(AdapterError):
    retriable = True


class AdapterUnavailable(AdapterError):
    retriable = True


class MalformedResponse(AdapterError):
    retriable = False


class ApplicationNotFound(AdapterError):
    pass


class FieldsNotAllowed(AdapterError):
    """Raised when more personal data than the authority's form requires is about to cross the boundary."""


class NotSupported(AdapterError):
    pass


class GovernmentAdapter(ABC):
    entity: Entity
    service: str
    request_type: str
    is_mock = True

    @abstractmethod
    async def submit_request(self, request: SubmitRequest) -> SubmitResponse: ...

    @abstractmethod
    async def get_status(self, external_ref: str) -> StatusResponse: ...

    @abstractmethod
    async def get_requirements(self) -> Requirements: ...

    @abstractmethod
    async def get_document_requirements(self) -> list[str]: ...

    @abstractmethod
    async def cancel_request(self, external_ref: str) -> StatusResponse: ...


class MockGovernmentAdapter(GovernmentAdapter):
    prefix = "GOV"
    allowed_fields: tuple[str, ...] = ()
    required_documents: tuple[str, ...] = ()
    sla = ""
    published_fee: str | None = None
    processing_detail = "Application received and queued for review."
    cleared_detail = "Cleared."
    terminal_success = "CLEARED"

    def __init__(self, cache: CacheManager, failures: dict[str, str | None]) -> None:
        self.cache = cache
        self.failures = failures  # shared dict: entity -> None | "timeout" | "unavailable" | "malformed"

    def _key(self, ref: str) -> str:
        return f"mockgov:{self.entity.value}:{ref}"

    def _ref_for(self, idempotency_key: str) -> str:
        digest = int(hashlib.sha256(idempotency_key.encode()).hexdigest()[:8], 16) % 1_000_000
        return f"{self.prefix}-{utcnow().year}-{digest:06d}"

    async def _maybe_fail(self) -> None:
        mode = self.failures.get(self.entity.value) or self.failures.get("*")
        if mode == "timeout":
            await asyncio.sleep(0)
            raise AdapterTimeout(f"{self.entity.value} did not respond in time (simulated)")
        if mode == "unavailable":
            raise AdapterUnavailable(f"{self.entity.value} service unavailable (simulated 503)")
        if mode == "malformed":
            raise MalformedResponse(f"{self.entity.value} returned an unreadable response (simulated)")

    async def submit_request(self, request: SubmitRequest) -> SubmitResponse:
        await self._maybe_fail()
        extra = set(request.fields) - set(self.allowed_fields)
        if extra:
            raise FieldsNotAllowed(f"{self.entity.value} form does not take: {', '.join(sorted(extra))}")
        ref = self._ref_for(request.idempotency_key)
        existing = await self.cache.get(self._key(ref))
        if existing:  # idempotent: the same filing twice is one application
            return SubmitResponse(external_ref=ref, status=existing["status"], detail=existing["detail"], received_at=utcnow(), duplicate=True)
        state = {"status": "SUBMITTED", "detail": "Application received.", "missing": [], "resident_present": False,
                 "case_reference": request.case_reference, "fields": sorted(request.fields), "updated_at": utcnow().isoformat()}
        await self.cache.set(self._key(ref), state, ttl=60 * 60 * 24 * 60)
        return SubmitResponse(external_ref=ref, status="SUBMITTED", detail="Application received.", received_at=utcnow())

    async def get_status(self, external_ref: str) -> StatusResponse:
        await self._maybe_fail()
        state = await self.cache.get(self._key(external_ref))
        if not state:
            raise ApplicationNotFound(f"{self.entity.value} has no application {external_ref}")
        return StatusResponse(external_ref=external_ref, status=state["status"], detail=state["detail"],
                              missing_documents=state.get("missing", []), updated_at=utcnow(),
                              resident_present=state.get("resident_present", False))

    async def get_requirements(self) -> Requirements:
        return Requirements(entity=self.entity.value, service=self.service, required_fields=list(self.allowed_fields),
                            required_documents=list(self.required_documents), published_fee=self.published_fee,
                            fee_source=CANVAS if self.published_fee else None, sla=self.sla)

    async def get_document_requirements(self) -> list[str]:
        return list(self.required_documents)

    async def cancel_request(self, external_ref: str) -> StatusResponse:
        state = await self.cache.get(self._key(external_ref)) or {}
        state.update(status="CANCELLED", detail="Cancelled at the requester's request.", updated_at=utcnow().isoformat())
        await self.cache.set(self._key(external_ref), state, ttl=60 * 60 * 24 * 60)
        return await self.get_status(external_ref)

    # --- simulation hooks (demo control panel / tests only) -----------------------------------------
    async def simulate(self, external_ref: str, status: str, *, detail: str | None = None, missing: list[str] | None = None,
                       resident_present: bool = False) -> dict[str, Any]:
        state = await self.cache.get(self._key(external_ref)) or {"case_reference": "", "fields": []}
        default_detail = {
            "PROCESSING": self.processing_detail, "CLEARED": self.cleared_detail, "COMPLETED": self.cleared_detail,
            "BLOCKED": "The authority has put the application on hold: the record does not match the hospital notification.",
            "DOCUMENT_MISSING": "The authority needs an additional document before it can continue.",
            "STALLED": "No movement from the authority within the expected time.",
            "REJECTED": "The authority did not approve the application.",
            "WAITING_FOR_PARENT": "The applicant must attend in person.",
        }.get(status, "Status updated.")
        state.update(status=status, detail=detail or default_detail, missing=missing or [], resident_present=resident_present,
                     updated_at=utcnow().isoformat())
        await self.cache.set(self._key(external_ref), state, ttl=60 * 60 * 24 * 60)
        return state
