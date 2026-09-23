"""Government-entity adapter contract + a database-backed mock implementation.

Real authorities would implement `GovernmentAdapter` against their own APIs. The mock keeps its own
"system of record" (`mock_applications`) so LIFELOOP only ever learns outcomes by *asking* or by being
*told* (webhook) - it never decides them.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import utcnow
from app.models.government_entity import MockApplication


# ---- errors -----------------------------------------------------------------------------------
class AdapterError(Exception):
    transient = False


class EntityTimeout(AdapterError):
    transient = True


class EntityRateLimited(AdapterError):
    transient = True


class EntityUnavailable(AdapterError):
    transient = True


class MalformedResponse(AdapterError):
    transient = False


class SubmissionRejected(AdapterError):
    """The authority refused to even accept the submission (permanent)."""


class ApplicationNotFound(AdapterError):
    pass


class EntityConflict(AdapterError):
    pass


# ---- DTOs -------------------------------------------------------------------------------------
@dataclass
class ServiceDefinition:
    code: str
    name: str
    description: str
    typical_days: int = 1
    required_documents: list[dict[str, str]] = field(default_factory=list)


@dataclass
class SubmissionRequest:
    idempotency_key: str
    case_reference: str
    service_code: str
    applicant: dict[str, Any] = field(default_factory=dict)
    documents: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class SubmissionResult:
    reference: str
    status: str
    duplicate: bool = False


@dataclass
class EntityStatus:
    reference: str
    entity_code: str
    service_code: str
    status: str
    required_documents: list[dict[str, str]]
    history: list[dict[str, Any]]
    submitted_at: datetime
    resolved_at: datetime | None


@dataclass
class EntityWebhook:
    """What an authority would push to LIFELOOP when its own state changes."""

    entity_code: str
    reference: str
    kind: str  # ACKNOWLEDGED | COMPLETED | DELAYED | REJECTED | DOCUMENT_REQUIRED
    idempotency_key: str
    payload: dict[str, Any] = field(default_factory=dict)


class GovernmentAdapter(ABC):
    entity_code: str
    slug: str
    name: str
    description: str
    catalog: list[ServiceDefinition]

    @abstractmethod
    async def submit(self, session: AsyncSession, request: SubmissionRequest) -> SubmissionResult: ...

    @abstractmethod
    async def get_status(self, session: AsyncSession, reference: str) -> EntityStatus: ...

    @abstractmethod
    async def forward_documents(self, session: AsyncSession, reference: str, documents: list[dict]) -> EntityStatus: ...


class MockGovernmentAdapter(GovernmentAdapter):
    """Shared behaviour of the four mock authorities."""

    ref_prefix = "GOV"
    avg_processing_hours = 24.0

    # ---- authority-facing API -----------------------------------------------------------------
    def service(self, code: str) -> ServiceDefinition:
        for item in self.catalog:
            if item.code == code:
                return item
        raise SubmissionRejected(f"{self.name} does not offer service {code}")

    async def submit(self, session: AsyncSession, request: SubmissionRequest) -> SubmissionResult:
        existing = await session.scalar(
            select(MockApplication).where(MockApplication.idempotency_key == request.idempotency_key)
        )
        if existing:  # duplicate request -> same application, never a second one
            return SubmissionResult(existing.reference, existing.status, duplicate=True)
        self.service(request.service_code)
        now = utcnow()
        count = await session.scalar(
            select(func.count()).select_from(MockApplication).where(MockApplication.entity_code == self.entity_code)
        )
        number = (count or 0) + 1
        reference = f"{self.ref_prefix}-{now.year}-{number:06d}"
        while await session.scalar(select(MockApplication.id).where(MockApplication.reference == reference)):
            number += 1
            reference = f"{self.ref_prefix}-{now.year}-{number:06d}"
        app = MockApplication(
            entity_code=self.entity_code,
            service_code=request.service_code,
            reference=reference,
            case_reference=request.case_reference,
            idempotency_key=request.idempotency_key,
            status="RECEIVED",
            applicant=request.applicant,
            history=[{"at": now.isoformat(), "status": "RECEIVED", "note": "Application received"}],
            submitted_at=now,
        )
        session.add(app)
        await session.flush()
        return SubmissionResult(reference, "RECEIVED")

    async def _get(self, session: AsyncSession, reference: str) -> MockApplication:
        app = await session.scalar(
            select(MockApplication).where(
                MockApplication.reference == reference, MockApplication.entity_code == self.entity_code
            )
        )
        if not app:
            raise ApplicationNotFound(f"Application {reference} not found at {self.name}")
        return app

    async def find(self, session: AsyncSession, case_reference: str, service_code: str) -> MockApplication:
        app = await session.scalar(
            select(MockApplication)
            .where(
                MockApplication.entity_code == self.entity_code,
                MockApplication.case_reference == case_reference,
                MockApplication.service_code == service_code,
            )
            .order_by(MockApplication.created_at.desc())
        )
        if not app:
            raise ApplicationNotFound(f"No {service_code} application for case {case_reference} at {self.name}")
        return app

    @staticmethod
    def _to_status(app: MockApplication) -> EntityStatus:
        return EntityStatus(
            reference=app.reference, entity_code=app.entity_code, service_code=app.service_code,
            status=app.status, required_documents=list(app.required_documents or []),
            history=list(app.history or []), submitted_at=app.submitted_at, resolved_at=app.resolved_at,
        )

    async def get_status(self, session: AsyncSession, reference: str) -> EntityStatus:
        return self._to_status(await self._get(session, reference))

    async def forward_documents(self, session: AsyncSession, reference: str, documents: list[dict]) -> EntityStatus:
        app = await self._get(session, reference)
        if app.status == "COMPLETED":
            return self._to_status(app)
        self._transition(app, "PROCESSING", "Additional documents received; review resumed")
        app.required_documents = []
        await session.flush()
        return self._to_status(app)

    # ---- authority-side simulation (what a caseworker's system would do) ----------------------
    @staticmethod
    def _transition(app: MockApplication, status: str, note: str) -> None:
        now = utcnow()
        app.status = status
        app.history = [*(app.history or []), {"at": now.isoformat(), "status": status, "note": note}]
        if status in {"COMPLETED", "REJECTED"}:
            app.resolved_at = now

    def _webhook(self, app: MockApplication, kind: str, payload: dict | None = None, *, repeatable: bool = False) -> EntityWebhook:
        suffix = f":{len(app.history or [])}" if repeatable else ""
        return EntityWebhook(
            entity_code=self.entity_code,
            reference=app.reference,
            kind=kind,
            idempotency_key=f"entity:{app.reference}:{kind}{suffix}",
            payload=payload or {},
        )

    async def acknowledge(self, session: AsyncSession, app: MockApplication) -> EntityWebhook:
        if app.status == "RECEIVED":
            self._transition(app, "PROCESSING", "Application accepted for processing")
        await session.flush()
        return self._webhook(app, "ACKNOWLEDGED")

    async def complete(self, session: AsyncSession, app: MockApplication) -> EntityWebhook:
        if app.status not in {"COMPLETED"}:
            self._transition(app, "COMPLETED", f"{self.service(app.service_code).name} approved by {self.name}")
        await session.flush()
        return self._webhook(app, "COMPLETED", {"decision": "approved_by_authority"})

    async def delay(self, session: AsyncSession, app: MockApplication, hours: int = 24, reason: str = "Queue backlog") -> EntityWebhook:
        self._guard_open(app)
        self._transition(app, "DELAYED", f"Delayed by {hours}h: {reason}")
        await session.flush()
        return self._webhook(app, "DELAYED", {"delay_hours": hours, "reason": reason}, repeatable=True)

    async def reject(self, session: AsyncSession, app: MockApplication, reason: str, retryable: bool = False, reason_code: str = "REJECTED") -> EntityWebhook:
        self._guard_open(app)
        self._transition(app, "REJECTED", reason)
        await session.flush()
        return self._webhook(
            app, "REJECTED", {"reason": reason, "retryable": retryable, "reason_code": reason_code}, repeatable=True
        )

    async def require_documents(self, session: AsyncSession, app: MockApplication, documents: list[dict] | None = None) -> EntityWebhook:
        self._guard_open(app)
        docs = documents or self.service(app.service_code).required_documents
        if not docs:
            raise EntityConflict(f"{self.name} has no document requirement configured for {app.service_code}")
        app.required_documents = docs
        self._transition(app, "DOCUMENT_REQUIRED", "Additional information required from applicant")
        await session.flush()
        return self._webhook(app, "DOCUMENT_REQUIRED", {"documents": docs}, repeatable=True)

    @staticmethod
    def _guard_open(app: MockApplication) -> None:
        if app.status == "COMPLETED":
            raise EntityConflict(f"Application {app.reference} is already completed")
