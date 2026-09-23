from sqlalchemy import func, select

from app.integrations.government import AdapterRegistry
from app.integrations.government.base import (
    EntityTimeout,
    EntityUnavailable,
    EntityWebhook,
    SubmissionRejected,
)
from app.integrations.government.identity import IdentityAdapter
from app.models import Callback, Event, ServiceTask
from app.models.enums import CallbackStatus, ConsentType
from app.models.enums import DomainEventType as E
from app.models.enums import TaskStatus as S
from app.services.container import ServiceContainer
from tests.helpers import act, make_case, status_map


async def _callbacks(c, case):
    return list((await c.session.scalars(select(Callback).where(Callback.case_id == case.id))).all())


async def test_processing_and_blocked_never_trigger_calls(container, resident):
    case = await make_case(container, resident)
    assert await _callbacks(container, case) == []  # case creation + submission: silent
    await act(container, case, "complete_birth_registration")  # milestone -> 1 call
    assert len(await _callbacks(container, case)) == 1
    await container.callbacks.execute_due(force=True)
    await container.commit()
    # acknowledging (PROCESSING) is silent
    task = next(t for t in await container.cases.tasks(case.id) if t.key == "BIRTH_CERTIFICATE")
    await container.demo.simulate(task, "acknowledge")
    await container.commit()
    assert len(await _callbacks(container, case)) == 1


async def test_milestones_are_coalesced_into_one_call(container, resident):
    case = await make_case(container, resident)
    await act(container, case, "complete_birth_registration")
    await act(container, case, "issue_birth_certificate")
    cbs = await _callbacks(container, case)
    assert len(cbs) == 1 and len(cbs[0].payload["updates"]) == 2
    await container.callbacks.execute_due(force=True)
    await container.commit()
    cb = (await _callbacks(container, case))[0]
    assert cb.status == CallbackStatus.COMPLETED and cb.provider == "simulated" and cb.duration_seconds > 0
    script = cb.payload["script"]
    assert "AI assistant" in script and "Birth Registration" in script and "Birth Certificate" in script


async def test_no_callback_without_consent(container, resident):
    case = await make_case(container, resident, consents={
        ConsentType.SERVICE_INITIATION_CONSENT: True, ConsentType.DATA_PROCESSING_CONSENT: True})
    await act(container, case, "complete_birth_registration")
    assert await _callbacks(container, case) == []
    from app.models import TimelineEvent

    titles = [t.title for t in (await container.session.scalars(select(TimelineEvent).where(TimelineEvent.case_id == case.id))).all()]
    assert "Callback not placed" in titles  # recorded, not silent


async def test_paused_case_holds_callbacks(container, resident):
    case = await make_case(container, resident)
    await container.cases.pause(case)
    await container.commit()
    await act(container, case, "complete_birth_registration")
    assert await _callbacks(container, case) == []


async def test_duplicate_entity_events_are_idempotent(container, resident):
    case = await make_case(container, resident)
    task = next(t for t in await container.cases.tasks(case.id) if t.key == "BIRTH_REGISTRATION")
    entity = await container.orchestration.entity_of(task)
    adapter = container.adapters.get(entity.code)
    app = await adapter._get(container.session, task.external_ref)
    hook = await adapter.complete(container.session, app)
    first = await container.orchestration.ingest_entity_event(hook)
    await container.commit()
    second = await container.orchestration.ingest_entity_event(hook)  # exact duplicate delivery
    third = await container.orchestration.ingest_entity_event(EntityWebhook(hook.entity_code, hook.reference, "COMPLETED", "different-key-123456"))
    await container.commit()
    assert first.applied and second.duplicate and third.duplicate
    completed = await container.session.scalar(select(func.count()).select_from(Event).where(
        Event.task_id == task.id, Event.event_type == E.TASK_COMPLETED))
    assert completed == 1
    assert len(await _callbacks(container, case)) == 1
    certs = await container.session.scalar(select(func.count()).select_from(ServiceTask).where(
        ServiceTask.case_id == case.id, ServiceTask.key == "BIRTH_CERTIFICATE"))
    assert certs == 1


async def test_service_submission_is_idempotent(container, resident):
    case = await make_case(container, resident)
    task = next(t for t in await container.cases.tasks(case.id) if t.key == "BIRTH_REGISTRATION")
    ref = task.external_ref
    entity = await container.orchestration.entity_of(task)
    adapter = container.adapters.get(entity.code)
    from app.integrations.government.base import SubmissionRequest

    again = await adapter.submit(container.session, SubmissionRequest(task.idempotency_key, case.reference, "BIRTH_REGISTRATION"))
    assert again.duplicate and again.reference == ref
    from app.models import MockApplication

    count = await container.session.scalar(select(func.count()).select_from(MockApplication).where(MockApplication.case_reference == case.reference))
    assert count == 1
    # initiating an already-submitted service through the agent tool does not resubmit
    result = await container.agent.tools.run("initiate_service", resident, {"service_key": "BIRTH_REGISTRATION", "case_reference": case.reference})
    assert result["ok"] and result["reference"] == ref


class FlakyIdentity(IdentityAdapter):
    def __init__(self, failures: int, error):
        self.failures, self.error = failures, error

    async def submit(self, session, request):
        if self.failures > 0:
            self.failures -= 1
            raise self.error("simulated")
        return await super().submit(session, request)


async def _container_with(session, settings, adapter) -> ServiceContainer:
    registry = AdapterRegistry()
    registry.register(adapter)
    from app.integrations.elevenlabs.callbacks import SimulatedCaller

    return ServiceContainer(session, settings=settings, adapters=registry, caller=SimulatedCaller())


async def test_transient_adapter_errors_are_retried(session, test_settings, resident):
    c = await _container_with(session, test_settings, FlakyIdentity(2, EntityTimeout))
    case = await make_case(c, resident)
    await act(c, case, "complete_birth_registration")
    await act(c, case, "issue_birth_certificate")
    assert (await status_map(c, case))["IDENTITY_PROCESS"] == S.SUBMITTED  # succeeded on 3rd attempt


async def test_persistent_outage_defers_then_worker_retries(session, test_settings, resident):
    flaky = FlakyIdentity(3, EntityUnavailable)  # 3 failures == all in-line attempts
    c = await _container_with(session, test_settings, flaky)
    case = await make_case(c, resident)
    await act(c, case, "complete_birth_registration")
    await act(c, case, "issue_birth_certificate")
    task = next(t for t in await c.cases.tasks(case.id) if t.key == "IDENTITY_PROCESS")
    assert task.status == S.READY and "deferred" in task.status_reason  # not lost, not silent
    from app.models import TimelineEvent

    titles = [t.title for t in (await session.scalars(select(TimelineEvent).where(TimelineEvent.case_id == case.id))).all()]
    assert any("unavailable" in t for t in titles)
    assert await c.orchestration.retry_deferred_submissions() == 1
    await c.commit()
    assert task.status == S.SUBMITTED


async def test_permanent_adapter_error_fails_and_escalates(session, test_settings, resident):
    c = await _container_with(session, test_settings, FlakyIdentity(99, SubmissionRejected))
    case = await make_case(c, resident)
    await act(c, case, "complete_birth_registration")
    await act(c, case, "issue_birth_certificate")
    task = next(t for t in await c.cases.tasks(case.id) if t.key == "IDENTITY_PROCESS")
    assert task.status == S.FAILED
    assert case.status.value == "ESCALATED"
