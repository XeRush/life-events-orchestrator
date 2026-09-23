"""Dependency-injection container: one per request / worker unit of work."""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.life_event_agent import LifeEventAgent
from app.core.config import Settings, get_settings
from app.events import handlers as _handlers  # noqa: F401  (registers domain-event handlers)
from app.events.bus import PostgresEventBus
from app.events.publisher import EventPublisher
from app.events.stream import hub
from app.integrations.elevenlabs.callbacks import OutboundCaller, build_caller
from app.integrations.elevenlabs.conversation import ConversationManager
from app.integrations.government import AdapterRegistry
from app.services.callback_service import CallbackService
from app.services.case_service import CaseService
from app.services.consent_service import ConsentService
from app.services.demo_service import DemoService
from app.services.dependency_service import DependencyService
from app.services.document_service import DocumentService
from app.services.orchestration_service import OrchestrationService
from app.services.replanning_service import ReplanningService
from app.services.storage import FileStorage, LocalFileStorage
from app.services.timeline_service import TimelineService
from app.services.workflow_service import WorkflowService


class ServiceContainer:
    def __init__(
        self, session: AsyncSession, *, settings: Settings | None = None, adapters: AdapterRegistry | None = None,
        caller: OutboundCaller | None = None, storage: FileStorage | None = None,
    ) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.adapters = adapters or AdapterRegistry()
        self.caller = caller or build_caller(self.settings)
        self.storage = storage or LocalFileStorage(self.settings.storage_dir)
        self.bus = PostgresEventBus(session, self)
        self.publisher = EventPublisher(self.bus)
        self.workflows = WorkflowService(self)
        self.timeline = TimelineService(self)
        self.consents = ConsentService(self)
        self.dependencies = DependencyService(self)
        self.documents = DocumentService(self)
        self.orchestration = OrchestrationService(self)
        self.replanning = ReplanningService(self)
        self.callbacks = CallbackService(self)
        self.cases = CaseService(self)
        self.agent = LifeEventAgent(self)
        self.voice = ConversationManager(self)
        self.demo = DemoService(self)

    async def settle(self) -> None:
        """Run all queued event handlers (and any events they publish) inside the current transaction."""
        await self.bus.drain()

    async def commit(self) -> None:
        """Settle events, commit the transaction, then notify live dashboards (only after commit)."""
        await self.settle()
        await self.session.commit()
        for message in self.session.info.pop("notify", []):
            hub.publish(message)

    def notify_payload(self) -> list[dict[str, Any]]:
        return list(self.session.info.get("notify", []))
