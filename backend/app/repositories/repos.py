"""Aggregate repositories."""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import Select, func, or_, select

from app.models.audit import AuditLog
from app.models.call import AgentSession, CallSession, Transcript
from app.models.callback import Callback
from app.models.case import Case, Child, Parent
from app.models.case_event import CaseEvent
from app.models.consent import Consent, OptOut
from app.models.document import Document
from app.models.entity import EntityRequest, EntityStatus
from app.models.enums import (
    ApprovalState,
    CallbackStatus,
    CaseStatus,
    ConsentStatus,
    ConsentType,
    EscalationStatus,
    NodeState,
    UserRole,
)
from app.models.graph import LifeEventEdge, LifeEventNode
from app.models.notification import Notification
from app.models.officer import Approval, Escalation, OfficerReview
from app.models.organization import Organization
from app.models.outbox import OutboxEvent
from app.models.user import AuthToken, User
from app.models.verification import VerificationAttempt
from app.repositories.base import Repository


class UserRepository(Repository[User]):
    model = User

    async def by_email(self, email: str) -> User | None:
        return await self.first(select(User).where(func.lower(User.email) == email.strip().lower()))

    def search(self, *, role: UserRole | None = None, organization_id: uuid.UUID | None = None, q: str | None = None) -> Select:
        query = select(User).order_by(User.created_at.desc())
        if role:
            query = query.where(User.role == role)
        if organization_id:
            query = query.where(User.organization_id == organization_id)
        if q:
            like = f"%{q.lower()}%"
            query = query.where(or_(func.lower(User.email).like(like), func.lower(User.full_name).like(like)))
        return query

    async def officers(self, organization_id: uuid.UUID | None) -> Sequence[User]:
        query = select(User).where(User.role == UserRole.OFFICER, User.is_active.is_(True)).order_by(User.created_at)
        if organization_id:
            query = query.where(User.organization_id == organization_id)
        return await self.scalars(query)


class AuthTokenRepository(Repository[AuthToken]):
    model = AuthToken

    async def by_hash(self, token_hash: str) -> AuthToken | None:
        return await self.first(select(AuthToken).where(AuthToken.token_hash == token_hash))


class OrganizationRepository(Repository[Organization]):
    model = Organization

    async def by_code(self, code: str) -> Organization | None:
        return await self.first(select(Organization).where(Organization.code == code))

    async def all(self) -> Sequence[Organization]:
        return await self.scalars(select(Organization).order_by(Organization.name))


class CaseRepository(Repository[Case]):
    model = Case

    async def by_reference(self, reference: str) -> Case | None:
        return await self.first(select(Case).where(Case.reference == reference.upper()))

    async def by_idempotency(self, key: str) -> Case | None:
        return await self.first(select(Case).where(Case.idempotency_key == key))

    def for_resident(self, resident_id: uuid.UUID) -> Select:
        return select(Case).where(Case.resident_id == resident_id).order_by(Case.created_at.desc())

    def for_staff(self, organization_id: uuid.UUID | None, *, status: CaseStatus | None = None, q: str | None = None) -> Select:
        query = select(Case).order_by(Case.last_activity_at.desc().nullslast(), Case.created_at.desc())
        if organization_id:
            query = query.where(Case.organization_id == organization_id)
        if status:
            query = query.where(Case.status == status)
        if q:
            query = query.where(Case.reference.ilike(f"%{q}%"))
        return query

    async def child(self, case_id: uuid.UUID) -> Child | None:
        return await self.first(select(Child).where(Child.case_id == case_id))

    async def parents(self, case_id: uuid.UUID) -> Sequence[Parent]:
        return (await self.session.scalars(select(Parent).where(Parent.case_id == case_id).order_by(Parent.role))).all()

    async def next_sequence(self, year: int) -> int:
        prefix = f"LL-{year}-"
        count = await self.session.scalar(select(func.count()).select_from(Case).where(Case.reference.like(f"{prefix}%")))
        return int(count or 0) + 1


class NodeRepository(Repository[LifeEventNode]):
    model = LifeEventNode

    async def for_case(self, case_id: uuid.UUID) -> list[LifeEventNode]:
        return list((await self.session.scalars(
            select(LifeEventNode).where(LifeEventNode.case_id == case_id).order_by(LifeEventNode.sort_order))).all())

    async def by_key(self, case_id: uuid.UUID, key: str) -> LifeEventNode | None:
        return await self.first(select(LifeEventNode).where(LifeEventNode.case_id == case_id, LifeEventNode.key == key))

    async def edges(self, case_id: uuid.UUID) -> list[LifeEventEdge]:
        return list((await self.session.scalars(select(LifeEventEdge).where(LifeEventEdge.case_id == case_id))).all())

    async def in_states(self, states: set[NodeState]) -> list[LifeEventNode]:
        return list((await self.session.scalars(select(LifeEventNode).where(LifeEventNode.state.in_(states)))).all())


class DocumentRepository(Repository[Document]):
    model = Document

    async def for_case(self, case_id: uuid.UUID) -> list[Document]:
        return list((await self.session.scalars(
            select(Document).where(Document.case_id == case_id).order_by(Document.category, Document.title))).all())

    async def by_type(self, case_id: uuid.UUID, doc_type: str) -> Document | None:
        return await self.first(select(Document).where(Document.case_id == case_id, Document.doc_type == doc_type))


class ConsentRepository(Repository[Consent]):
    model = Consent

    async def active(self, case_id: uuid.UUID, consent_type: ConsentType) -> Consent | None:
        return await self.first(select(Consent).where(
            Consent.case_id == case_id, Consent.consent_type == consent_type, Consent.status == ConsentStatus.GRANTED,
        ).order_by(Consent.captured_at.desc()))

    async def for_case(self, case_id: uuid.UUID) -> Sequence[Consent]:
        return await self.scalars(select(Consent).where(Consent.case_id == case_id).order_by(Consent.captured_at.desc()))


class OptOutRepository(Repository[OptOut]):
    model = OptOut

    async def active(self, case_id: uuid.UUID) -> OptOut | None:
        return await self.first(select(OptOut).where(OptOut.case_id == case_id, OptOut.active.is_(True)))

    async def for_case(self, case_id: uuid.UUID) -> Sequence[OptOut]:
        return await self.scalars(select(OptOut).where(OptOut.case_id == case_id).order_by(OptOut.created_at.desc()))


class TimelineRepository(Repository[CaseEvent]):
    model = CaseEvent

    def for_case(self, case_id: uuid.UUID) -> Select:
        return select(CaseEvent).where(CaseEvent.case_id == case_id).order_by(CaseEvent.occurred_at.desc(), CaseEvent.id.desc())

    def recent(self, case_ids: Select | None = None) -> Select:
        query = select(CaseEvent).order_by(CaseEvent.occurred_at.desc())
        if case_ids is not None:
            query = query.where(CaseEvent.case_id.in_(case_ids))
        return query

    async def resident_present_count(self, case_id: uuid.UUID) -> int:
        return await self.count(select(CaseEvent).where(CaseEvent.case_id == case_id, CaseEvent.resident_present.is_(True)))


class EntityRequestRepository(Repository[EntityRequest]):
    model = EntityRequest

    async def latest_for_node(self, node_id: uuid.UUID) -> EntityRequest | None:
        return await self.first(select(EntityRequest).where(EntityRequest.node_id == node_id).order_by(EntityRequest.created_at.desc()))

    async def by_idempotency(self, key: str) -> EntityRequest | None:
        return await self.first(select(EntityRequest).where(EntityRequest.idempotency_key == key))

    async def for_case(self, case_id: uuid.UUID) -> Sequence[EntityRequest]:
        return await self.scalars(select(EntityRequest).where(EntityRequest.case_id == case_id).order_by(EntityRequest.created_at.desc()))

    async def pollable(self, older_than: datetime) -> Sequence[EntityRequest]:
        return await self.scalars(select(EntityRequest).where(
            EntityRequest.state.in_(["SUBMITTED", "PROCESSING", "WAITING_FOR_PARENT"]), EntityRequest.external_ref.is_not(None),
            or_(EntityRequest.last_polled_at.is_(None), EntityRequest.last_polled_at < older_than)).limit(50))

    async def statuses(self, case_id: uuid.UUID) -> Sequence[EntityStatus]:
        return (await self.session.scalars(select(EntityStatus).where(EntityStatus.case_id == case_id)
                                           .order_by(EntityStatus.received_at.desc()).limit(100))).all()


class ApprovalRepository(Repository[Approval]):
    model = Approval

    async def pending_for_node(self, node_id: uuid.UUID) -> Approval | None:
        return await self.first(select(Approval).where(Approval.node_id == node_id, Approval.state == ApprovalState.PENDING))

    def pending(self, organization_id: uuid.UUID | None = None) -> Select:
        query = select(Approval).where(Approval.state == ApprovalState.PENDING).order_by(Approval.requested_at)
        if organization_id:
            query = query.join(Case, Case.id == Approval.case_id).where(Case.organization_id == organization_id)
        return query

    async def for_case(self, case_id: uuid.UUID) -> Sequence[Approval]:
        return await self.scalars(select(Approval).where(Approval.case_id == case_id).order_by(Approval.requested_at.desc()))


class ReviewRepository(Repository[OfficerReview]):
    model = OfficerReview

    async def for_case(self, case_id: uuid.UUID) -> Sequence[OfficerReview]:
        return await self.scalars(select(OfficerReview).where(OfficerReview.case_id == case_id).order_by(OfficerReview.created_at.desc()))


class EscalationRepository(Repository[Escalation]):
    model = Escalation

    async def open_for_case(self, case_id: uuid.UUID) -> Sequence[Escalation]:
        return await self.scalars(select(Escalation).where(Escalation.case_id == case_id, Escalation.status != EscalationStatus.RESOLVED))

    async def for_case(self, case_id: uuid.UUID) -> Sequence[Escalation]:
        return await self.scalars(select(Escalation).where(Escalation.case_id == case_id).order_by(Escalation.opened_at.desc()))

    def queue(self, organization_id: uuid.UUID | None = None, *, include_resolved: bool = False) -> Select:
        query = select(Escalation).order_by(Escalation.opened_at.desc())
        if not include_resolved:
            query = query.where(Escalation.status != EscalationStatus.RESOLVED)
        if organization_id:
            query = query.join(Case, Case.id == Escalation.case_id).where(Case.organization_id == organization_id)
        return query


class CallbackRepository(Repository[Callback]):
    model = Callback

    async def open_for_case(self, case_id: uuid.UUID) -> Sequence[Callback]:
        return await self.scalars(select(Callback).where(
            Callback.case_id == case_id, Callback.status.in_([CallbackStatus.SCHEDULED, CallbackStatus.DIALING])))

    async def due(self, now: datetime) -> Sequence[Callback]:
        return await self.scalars(select(Callback).where(Callback.status == CallbackStatus.SCHEDULED, Callback.scheduled_for <= now)
                                  .order_by(Callback.scheduled_for).limit(20))

    async def ringing_before(self, cutoff: datetime) -> Sequence[Callback]:
        return await self.scalars(select(Callback).where(Callback.status == CallbackStatus.DIALING, Callback.dialed_at < cutoff))

    def listing(self, case_ids: Select | None = None, case_id: uuid.UUID | None = None) -> Select:
        query = select(Callback).order_by(Callback.scheduled_for.desc())
        if case_id:
            query = query.where(Callback.case_id == case_id)
        elif case_ids is not None:
            query = query.where(Callback.case_id.in_(case_ids))
        return query


class CallRepository(Repository[CallSession]):
    model = CallSession

    async def by_provider_id(self, conversation_id: str) -> CallSession | None:
        return await self.first(select(CallSession).where(CallSession.provider_conversation_id == conversation_id))

    def for_case(self, case_id: uuid.UUID) -> Select:
        return select(CallSession).where(CallSession.case_id == case_id).order_by(CallSession.started_at.desc())

    def for_user(self, user_id: uuid.UUID) -> Select:
        return select(CallSession).where(CallSession.user_id == user_id).order_by(CallSession.started_at.desc())

    async def transcript(self, call_id: uuid.UUID) -> list[Transcript]:
        return list((await self.session.scalars(select(Transcript).where(Transcript.call_session_id == call_id).order_by(Transcript.seq))).all())

    async def next_seq(self, call_id: uuid.UUID) -> int:
        return int(await self.session.scalar(select(func.coalesce(func.max(Transcript.seq), 0)).where(Transcript.call_session_id == call_id)) or 0) + 1

    async def agent_session(self, call_id: uuid.UUID) -> AgentSession | None:
        return await self.first(select(AgentSession).where(AgentSession.call_session_id == call_id))


class VerificationRepository(Repository[VerificationAttempt]):
    model = VerificationAttempt

    async def failures(self, case_id: uuid.UUID, call_id: uuid.UUID | None) -> int:
        query = select(VerificationAttempt).where(VerificationAttempt.case_id == case_id, VerificationAttempt.success.is_(False))
        if call_id:
            query = query.where(VerificationAttempt.call_session_id == call_id)
        return await self.count(query)

    async def for_case(self, case_id: uuid.UUID) -> Sequence[VerificationAttempt]:
        return await self.scalars(select(VerificationAttempt).where(VerificationAttempt.case_id == case_id)
                                  .order_by(VerificationAttempt.created_at.desc()))


class NotificationRepository(Repository[Notification]):
    model = Notification

    def for_user(self, user_id: uuid.UUID, unread_only: bool = False) -> Select:
        query = select(Notification).where(Notification.user_id == user_id).order_by(Notification.created_at.desc())
        if unread_only:
            query = query.where(Notification.read_at.is_(None))
        return query


class AuditRepository(Repository[AuditLog]):
    model = AuditLog

    def search(self, *, case_id: uuid.UUID | None = None, action: str | None = None, actor_type: str | None = None) -> Select:
        query = select(AuditLog).order_by(AuditLog.occurred_at.desc())
        if case_id:
            query = query.where(AuditLog.case_id == case_id)
        if action:
            query = query.where(AuditLog.action == action)
        if actor_type:
            query = query.where(AuditLog.actor_type == actor_type)
        return query


class OutboxRepository(Repository[OutboxEvent]):
    model = OutboxEvent

    async def counts(self) -> dict[str, int]:
        rows = (await self.session.execute(select(OutboxEvent.status, func.count()).group_by(OutboxEvent.status))).all()
        return {status.value if hasattr(status, "value") else str(status): int(n) for status, n in rows}

    def recent(self, case_id: uuid.UUID | None = None) -> Select:
        query = select(OutboxEvent).order_by(OutboxEvent.created_at.desc())
        if case_id:
            query = query.where(OutboxEvent.case_id == case_id)
        return query
