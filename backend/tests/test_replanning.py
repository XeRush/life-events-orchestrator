from sqlalchemy import select

from app.models import Callback, Event
from app.models.enums import CaseStatus
from app.models.enums import DomainEventType as E
from app.models.enums import TaskStatus as S
from tests.helpers import act, make_case, status_map


async def _to_identity(c, user):
    case = await make_case(c, user)
    await act(c, case, "complete_birth_registration")
    await act(c, case, "issue_birth_certificate")
    await act(c, case, "start_identity")
    return case


async def _callbacks(c, case):
    return list((await c.session.scalars(select(Callback).where(Callback.case_id == case.id))).all())


async def test_delay_keeps_dependants_blocked_without_calling_resident(container, resident):
    case = await _to_identity(container, resident)
    before = len(await _callbacks(container, case))
    await act(container, case, "delay_identity")
    st = await status_map(container, case)
    assert st["IDENTITY_PROCESS"] == S.WAITING_FOR_ENTITY
    assert st["ADDITIONAL_SERVICES"] == S.BLOCKED
    assert len(await _callbacks(container, case)) == before  # ordinary delay: no call
    held = (await container.session.scalars(select(Event).where(Event.event_type == E.DEPENDENCY_BLOCKED))).all()
    assert held and "Additional Services" in held[0].event_metadata["held"]


async def test_significant_delay_does_call(container, resident):
    case = await _to_identity(container, resident)
    await container.callbacks.execute_due(force=True)  # earlier milestone calls have been placed
    await container.commit()
    task = next(t for t in await container.cases.tasks(case.id) if t.key == "IDENTITY_PROCESS")
    before = len(await _callbacks(container, case))
    await container.demo.simulate(task, "delay", hours=96, reason="Backlog")
    await container.commit()
    cbs = await _callbacks(container, case)
    assert len(cbs) == before + 1 and "delayed" in cbs[-1].reason.lower()


async def test_document_required_then_deferred_keeps_case_open(container, resident):
    case = await _to_identity(container, resident)
    await act(container, case, "require_document")
    tasks = {t.key: t for t in await container.cases.tasks(case.id)}
    assert tasks["IDENTITY_PROCESS"].resident_action.startswith("Provide")
    assert case.status == CaseStatus.IN_PROGRESS
    # Resident says "I don't have it right now" -> nothing is marked complete
    user = resident
    from app.models.conversation import Conversation

    conv = Conversation(user_id=user.id, case_id=case.id, state={})
    container.session.add(conv)
    await container.session.flush()
    reply = await container.agent.respond(user, conv, "I don't have it right now")
    await container.commit()
    assert "keep the case open" in reply.text
    assert (await status_map(container, case))["IDENTITY_PROCESS"] == S.WAITING_FOR_RESIDENT
    assert case.status == CaseStatus.IN_PROGRESS
    types = {e.event_type for e in (await container.session.scalars(select(Event).where(Event.case_id == case.id))).all()}
    assert E.RESIDENT_DEFERRED in types


async def test_retryable_rejection_is_retried_silently(container, resident):
    case = await _to_identity(container, resident)
    task = next(t for t in await container.cases.tasks(case.id) if t.key == "IDENTITY_PROCESS")
    first_ref = task.external_ref
    before = len(await _callbacks(container, case))
    await container.demo.simulate(task, "reject", reason="Temporary registry error", retryable=True)
    await container.commit()
    assert task.status == S.SUBMITTED and task.external_ref != first_ref and task.attempts == 2
    assert task.replanned
    assert len(await _callbacks(container, case)) == before  # internal retry: resident not bothered


async def test_non_retryable_rejection_uses_alternative_path_and_rewires(container, resident):
    case = await _to_identity(container, resident)
    await act(container, case, "reject_identity")
    st = await status_map(container, case)
    assert st["IDENTITY_PROCESS"] == S.CANCELLED
    assert st["IDENTITY_MANUAL_REVIEW"] == S.SUBMITTED
    graph = await container.workflows.case_graph(case)
    assert {"from": "IDENTITY_MANUAL_REVIEW", "to": "ADDITIONAL_SERVICES"} in graph["edges"]
    cbs = await _callbacks(container, case)
    assert any("alternative" in u["text"].lower() for cb in cbs for u in cb.payload.get("updates", []))
    # completing the alternative unlocks the next service
    await act(container, case, "approve_identity")
    assert (await status_map(container, case))["ADDITIONAL_SERVICES"] == S.SUBMITTED


async def test_rejection_of_alternative_escalates_to_human(container, resident):
    case = await _to_identity(container, resident)
    await act(container, case, "reject_identity")
    await act(container, case, "reject_identity")  # the manual review path is also rejected
    assert case.status == CaseStatus.ESCALATED
    cbs = await _callbacks(container, case)
    assert any("human officer" in u["text"].lower() for cb in cbs for u in cb.payload.get("updates", []))


async def test_manual_replan_requeues_failed_task(container, resident):
    case = await make_case(container, resident)
    task = next(t for t in await container.cases.tasks(case.id) if t.key == "BIRTH_REGISTRATION")
    await container.orchestration.transition(task, S.FAILED, E.TASK_FAILED, reason="simulated failure")
    await container.commit()
    assert case.status == CaseStatus.ESCALATED  # failure escalates to a human
    result = await container.replanning.replan_case(case)
    await container.commit()
    assert result["requeued"] == 1
    assert task.status == S.SUBMITTED and case.status == CaseStatus.IN_PROGRESS
