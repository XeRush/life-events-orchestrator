from sqlalchemy import func, select

from app.core.config import get_settings
from app.models import (
    Callback,
    Event,
    GovernmentEntity,
    LifeEvent,
    LifeEventCase,
    ServiceTask,
    TimelineEvent,
    User,
    Workflow,
    WorkflowNode,
)
from app.seed.seed_data import run_seed


async def _counts(session):
    out = {}
    for model in (User, GovernmentEntity, LifeEvent, Workflow, WorkflowNode, LifeEventCase, ServiceTask, TimelineEvent, Callback, Event):
        out[model.__name__] = await session.scalar(select(func.count()).select_from(model))
    return out


async def test_seed_is_idempotent(session):
    await run_seed(session, get_settings())
    first = await _counts(session)
    await run_seed(session, get_settings())
    await run_seed(session, get_settings())
    assert await _counts(session) == first
    assert first["GovernmentEntity"] == 4 and first["LifeEvent"] == 4 and first["LifeEventCase"] == 1


async def test_seeded_demo_case_matches_the_story(session):
    await run_seed(session, get_settings())
    case = await session.scalar(select(LifeEventCase).where(LifeEventCase.reference == "L-49281"))
    tasks = {t.key: t.status.value for t in (await session.scalars(select(ServiceTask).where(ServiceTask.case_id == case.id))).all()}
    assert tasks["BIRTH_REGISTRATION"] == "COMPLETED" and tasks["BIRTH_CERTIFICATE"] == "COMPLETED"
    assert tasks["IDENTITY_PROCESS"] == "PROCESSING" and tasks["HEALTH_PROCESS"] == "SUBMITTED" and tasks["ADDITIONAL_SERVICES"] == "BLOCKED"
    titles = [t.title for t in (await session.scalars(select(TimelineEvent).where(TimelineEvent.case_id == case.id).order_by(TimelineEvent.occurred_at))).all()]
    assert titles[0] == "Birth event reported" and "Birth certificate issued" in titles
    assert str(case.event_date) == "2026-09-20"
