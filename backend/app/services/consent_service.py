"""Consent is a first-class object: type, scope, version, source, timestamp, status."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select

from app.models.consent import Consent
from app.models.enums import ActorType, ConsentStatus, ConsentType, DomainEventType
from app.models.life_event_case import LifeEventCase

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

CONSENT_VERSION = "1.0"
DEFAULT_SCOPES = {
    ConsentType.CALLBACK_CONSENT: "LIFELOOP may place voice calls to the resident about this case.",
    ConsentType.SERVICE_INITIATION_CONSENT: "LIFELOOP may submit the workflow's service requests to the responsible authorities on the resident's behalf.",
    ConsentType.DATA_PROCESSING_CONSENT: "LIFELOOP may process the case data needed to coordinate these services.",
}


class ConsentService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def latest(self, case_id: uuid.UUID, consent_type: ConsentType) -> Consent | None:
        return await self.c.session.scalar(
            select(Consent).where(Consent.case_id == case_id, Consent.consent_type == consent_type)
            .order_by(Consent.captured_at.desc(), Consent.created_at.desc())
        )

    async def has_consent(self, case_id: uuid.UUID, consent_type: ConsentType) -> bool:
        latest = await self.latest(case_id, consent_type)
        return bool(latest and latest.status == ConsentStatus.GRANTED)

    async def list_for_case(self, case_id: uuid.UUID) -> list[Consent]:
        return list((await self.c.session.scalars(
            select(Consent).where(Consent.case_id == case_id).order_by(Consent.captured_at)
        )).all())

    async def record(
        self, case: LifeEventCase, consent_type: ConsentType, granted: bool, *, source: str = "voice",
        scope: str | None = None, actor: str = "resident", actor_type: ActorType = ActorType.RESIDENT,
    ) -> Consent:
        status = ConsentStatus.GRANTED if granted else (
            ConsentStatus.REVOKED if await self.latest(case.id, consent_type) else ConsentStatus.DECLINED
        )
        latest = await self.latest(case.id, consent_type)
        if latest and latest.status == status:
            return latest  # idempotent
        consent = Consent(
            user_id=case.user_id, case_id=case.id, consent_type=consent_type, status=status,
            version=CONSENT_VERSION, scope=scope or DEFAULT_SCOPES[consent_type], source=source,
        )
        self.c.session.add(consent)
        await self.c.session.flush()
        await self.c.publisher.case_event(
            DomainEventType.CONSENT_CAPTURED, case, actor=actor, actor_type=actor_type,
            metadata={"consent_type": consent_type.value, "status": status.value, "consent_id": str(consent.id), "source": source},
        )
        return consent
