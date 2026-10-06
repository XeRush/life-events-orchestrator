"""Dependency-injection container: one per request / consumer unit of work.

Repositories and services are created lazily, share one AsyncSession (one transaction) and one EventRecorder.
`commit()` is the only commit path: after the transaction commits it pushes SSE notifications and wakes the
outbox relay, so dashboards update and Kafka sees the events within milliseconds.
"""
from __future__ import annotations

from functools import cached_property

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.events.recorder import EventRecorder
from app.events.stream import hub
from app.repositories import repos as r
from app.services.infra import Infra, get_infra


class ServiceContainer:
    def __init__(self, session: AsyncSession, *, infra: Infra | None = None, settings: Settings | None = None,
                 request_id: str | None = None, ip_hash: str | None = None) -> None:
        self.session = session
        self.infra = infra or get_infra()
        self.settings = settings or self.infra.settings
        self.request_id = request_id
        self.ip_hash = ip_hash
        self.events = EventRecorder(self)

    # --- repositories ----------------------------------------------------------------------------------
    @cached_property
    def users_repo(self) -> r.UserRepository: return r.UserRepository(self.session)
    @cached_property
    def tokens_repo(self) -> r.AuthTokenRepository: return r.AuthTokenRepository(self.session)
    @cached_property
    def orgs_repo(self) -> r.OrganizationRepository: return r.OrganizationRepository(self.session)
    @cached_property
    def cases_repo(self) -> r.CaseRepository: return r.CaseRepository(self.session)
    @cached_property
    def nodes_repo(self) -> r.NodeRepository: return r.NodeRepository(self.session)
    @cached_property
    def docs_repo(self) -> r.DocumentRepository: return r.DocumentRepository(self.session)
    @cached_property
    def consents_repo(self) -> r.ConsentRepository: return r.ConsentRepository(self.session)
    @cached_property
    def optouts_repo(self) -> r.OptOutRepository: return r.OptOutRepository(self.session)
    @cached_property
    def timeline_repo(self) -> r.TimelineRepository: return r.TimelineRepository(self.session)
    @cached_property
    def requests_repo(self) -> r.EntityRequestRepository: return r.EntityRequestRepository(self.session)
    @cached_property
    def approvals_repo(self) -> r.ApprovalRepository: return r.ApprovalRepository(self.session)
    @cached_property
    def reviews_repo(self) -> r.ReviewRepository: return r.ReviewRepository(self.session)
    @cached_property
    def escalations_repo(self) -> r.EscalationRepository: return r.EscalationRepository(self.session)
    @cached_property
    def callbacks_repo(self) -> r.CallbackRepository: return r.CallbackRepository(self.session)
    @cached_property
    def calls_repo(self) -> r.CallRepository: return r.CallRepository(self.session)
    @cached_property
    def verifications_repo(self) -> r.VerificationRepository: return r.VerificationRepository(self.session)
    @cached_property
    def notifications_repo(self) -> r.NotificationRepository: return r.NotificationRepository(self.session)
    @cached_property
    def audit_repo(self) -> r.AuditRepository: return r.AuditRepository(self.session)
    @cached_property
    def outbox_repo(self) -> r.OutboxRepository: return r.OutboxRepository(self.session)

    # --- services --------------------------------------------------------------------------------------
    @cached_property
    def auth(self):
        from app.services.auth_service import AuthService
        return AuthService(self)

    @cached_property
    def users(self):
        from app.services.user_service import UserService
        return UserService(self)

    @cached_property
    def access(self):
        from app.services.access import AccessPolicy
        return AccessPolicy(self)

    @cached_property
    def cases(self):
        from app.services.case_service import CaseService
        return CaseService(self)

    @cached_property
    def graph(self):
        from app.services.graph_service import GraphService
        return GraphService(self)

    @cached_property
    def approvals(self):
        from app.services.approval_service import ApprovalService
        return ApprovalService(self)

    @cached_property
    def entities(self):
        from app.services.entity_service import EntityService
        return EntityService(self)

    @cached_property
    def consulate(self):
        from app.services.consulate_service import ConsulateService
        return ConsulateService(self)

    @cached_property
    def consents(self):
        from app.services.consent_service import ConsentService
        return ConsentService(self)

    @cached_property
    def optouts(self):
        from app.services.consent_service import OptOutService
        return OptOutService(self)

    @cached_property
    def verification(self):
        from app.services.verification_service import VerificationService
        return VerificationService(self)

    @cached_property
    def escalations(self):
        from app.services.escalation_service import EscalationService
        return EscalationService(self)

    @cached_property
    def documents(self):
        from app.services.document_service import DocumentService
        return DocumentService(self)

    @cached_property
    def callbacks(self):
        from app.services.callback_service import CallbackService
        return CallbackService(self)

    @cached_property
    def notifications(self):
        from app.services.notification_service import NotificationService
        return NotificationService(self)

    @cached_property
    def calls(self):
        from app.services.call_service import CallService
        return CallService(self)

    @cached_property
    def webhooks(self):
        from app.services.webhook_service import WebhookService
        return WebhookService(self)

    @cached_property
    def knowledge(self):
        from app.services.knowledge_service import KnowledgeService
        return KnowledgeService(self)

    @cached_property
    def analytics(self):
        from app.services.analytics_service import AnalyticsService
        return AnalyticsService(self)

    @cached_property
    def demo(self):
        from app.services.demo_service import DemoService
        return DemoService(self)

    @cached_property
    def tools(self):
        from app.agents.tools import ToolRegistry
        return ToolRegistry(self)

    @cached_property
    def orchestrator(self):
        from app.workflows.case_orchestrator import CaseOrchestrator
        return CaseOrchestrator(self)

    # --- unit of work ------------------------------------------------------------------------------------
    async def commit(self) -> None:
        await self.session.flush()
        notify = self.session.info.pop("notify", [])
        wrote_outbox = self.session.info.pop("outbox_written", False)
        await self.session.commit()
        for message in notify:
            hub.publish(message)
        if wrote_outbox:
            self.infra.broker.wakeup.set()
