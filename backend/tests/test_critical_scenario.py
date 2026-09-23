"""The full life-event journey, end to end, on the real engine."""
from sqlalchemy import select

from app.models import Callback, Event, TimelineEvent
from app.models.enums import CallbackStatus, CaseStatus
from app.models.enums import DomainEventType as E
from app.models.enums import TaskStatus as S
from tests.helpers import act, make_case, status_map


async def test_birth_journey_end_to_end(container, resident):
    c = container
    # Birth reported -> consent captured -> case created -> tasks generated
    case = await make_case(c, resident)
    assert case.reference.startswith("L-")
    assert case.status == CaseStatus.IN_PROGRESS
    st = await status_map(c, case)
    assert st["BIRTH_REPORTED"] == S.COMPLETED
    assert st["BIRTH_REGISTRATION"] == S.SUBMITTED  # initiated with the authority
    assert st["BIRTH_CERTIFICATE"] == S.BLOCKED
    assert st["IDENTITY_PROCESS"] == S.BLOCKED
    assert st["HEALTH_PROCESS"] == S.BLOCKED

    # Birth registration completed -> certificate unlocked (and submitted)
    await act(c, case, "complete_birth_registration")
    st = await status_map(c, case)
    assert st["BIRTH_REGISTRATION"] == S.COMPLETED
    assert st["BIRTH_CERTIFICATE"] == S.SUBMITTED
    assert st["IDENTITY_PROCESS"] == S.BLOCKED  # still needs the certificate

    # Certificate completed -> identity + health unlocked in parallel
    await act(c, case, "issue_birth_certificate")
    st = await status_map(c, case)
    assert st["IDENTITY_PROCESS"] == S.SUBMITTED and st["HEALTH_PROCESS"] == S.SUBMITTED
    assert st["ADDITIONAL_SERVICES"] == S.BLOCKED

    # Identity requires a document -> callback generated
    await act(c, case, "start_identity")
    await act(c, case, "require_document")
    st = await status_map(c, case)
    assert st["IDENTITY_PROCESS"] == S.WAITING_FOR_RESIDENT
    callbacks = (await c.session.scalars(select(Callback).where(Callback.case_id == case.id))).all()
    assert any("needs" in cb.reason.lower() for cb in callbacks)

    # Resident submits the document -> identity resumes
    await act(c, case, "submit_document")
    st = await status_map(c, case)
    assert st["IDENTITY_PROCESS"] == S.PROCESSING

    # Identity completes -> next service unlocked
    await act(c, case, "approve_identity")
    st = await status_map(c, case)
    assert st["IDENTITY_PROCESS"] == S.COMPLETED
    assert st["ADDITIONAL_SERVICES"] == S.SUBMITTED

    # Everything else completes -> case completes
    await act(c, case, "complete_health")
    assert case.status == CaseStatus.IN_PROGRESS
    await act(c, case, "complete_additional_services")
    assert case.status == CaseStatus.COMPLETED
    st = await status_map(c, case)
    assert all(v == S.COMPLETED for v in st.values())

    # Callbacks are executed, timeline and audit trail exist
    await c.callbacks.execute_due(force=True)
    await c.commit()
    done = (await c.session.scalars(select(Callback).where(Callback.status == CallbackStatus.COMPLETED))).all()
    assert done and all(cb.duration_seconds for cb in done)
    types = {e.event_type for e in (await c.session.scalars(select(Event).where(Event.case_id == case.id))).all()}
    assert {E.LIFE_EVENT_CREATED, E.CONSENT_CAPTURED, E.TASK_COMPLETED, E.DOCUMENT_REQUIRED, E.DOCUMENT_RECEIVED,
            E.TASK_RESUMED, E.CASE_COMPLETED, E.CALLBACK_COMPLETED, E.DEPENDENCY_RESOLVED} <= types
    titles = [t.title for t in (await c.session.scalars(select(TimelineEvent).where(TimelineEvent.case_id == case.id))).all()]
    assert "Birth certificate issued" in titles and "Case completed" in titles
    snap = await c.cases.snapshot(case)
    assert snap["progress"] == {"completed": 5, "total": 5, "percent": 100}
