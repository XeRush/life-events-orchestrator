"""Idempotent seed: reference data, demo user and the demo case L-49281.

Run with `python -m app.seed.seed_data` (or `make seed`). Re-running never creates duplicates.
The demo case is produced by driving the *real* engine under a controlled clock, so its tasks, timeline,
callbacks, conversations and audit log are exactly what live operation would have produced.
"""
from __future__ import annotations

import asyncio
import sys
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import use_clock
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging, get_logger
from app.core.security import hash_password
from app.integrations.elevenlabs.callbacks import SimulatedCaller
from app.integrations.government import AdapterRegistry
from app.models import (
    Callback,
    Consent,
    Conversation,
    Document,
    Event,
    GovernmentEntity,
    LifeEvent,
    LifeEventCase,
    MockApplication,
    ServiceTask,
    TaskDependency,
    TimelineEvent,
    User,
    Workflow,
    WorkflowEdge,
    WorkflowNode,
)
from app.models.enums import ConsentType, ConversationChannel, ConversationStatus, UserRole
from app.seed.definitions import LIFE_EVENTS
from app.services.case_service import CreateCaseInput
from app.services.container import ServiceContainer

log = get_logger("lifeloop.seed")
DEMO_REFERENCE = "L-49281"
DEMO_START = datetime(2026, 9, 20, 10, 41, 0, tzinfo=UTC)


async def seed_entities(session: AsyncSession) -> dict[str, GovernmentEntity]:
    out = {}
    for adapter in AdapterRegistry().all():
        entity = await session.scalar(select(GovernmentEntity).where(GovernmentEntity.code == adapter.entity_code))
        if not entity:
            entity = GovernmentEntity(code=adapter.entity_code, slug=adapter.slug, name=adapter.name, description=adapter.description,
                                      avg_processing_hours=getattr(adapter, "avg_processing_hours", 24.0))
            session.add(entity)
        out[adapter.entity_code] = entity
    await session.flush()
    return out


async def seed_workflows(session: AsyncSession, entities: dict[str, GovernmentEntity]) -> None:
    for spec in LIFE_EVENTS:
        life_event = await session.scalar(select(LifeEvent).where(LifeEvent.code == spec["code"]))
        if not life_event:
            life_event = LifeEvent(code=spec["code"], name=spec["name"], case_title=spec["case_title"], description=spec["description"],
                                   icon=spec["icon"], is_configured=spec["configured"])
            session.add(life_event)
            await session.flush()
        code = f"{spec['code']}_V1"
        workflow = await session.scalar(select(Workflow).where(Workflow.code == code))
        if not workflow:
            workflow = Workflow(life_event_id=life_event.id, code=code, name=f"{spec['name']} journey", version=1)
            session.add(workflow)
            await session.flush()
        nodes: dict[str, WorkflowNode] = {}
        for order, n in enumerate(spec["nodes"]):
            node = await session.scalar(select(WorkflowNode).where(WorkflowNode.workflow_id == workflow.id, WorkflowNode.key == n["key"]))
            if not node:
                node = WorkflowNode(
                    workflow_id=workflow.id, key=n["key"], name=n["name"], description=n["description"],
                    entity_id=entities[n["entity"]].id if n["entity"] else None, service_code=n["service"],
                    is_system=n["system"], sort_order=order, config=n["config"],
                )
                session.add(node)
                await session.flush()
            nodes[n["key"]] = node
        for n in spec["nodes"]:
            for dep in n["deps"]:
                exists = await session.scalar(select(WorkflowEdge.id).where(
                    WorkflowEdge.from_node_id == nodes[dep].id, WorkflowEdge.to_node_id == nodes[n["key"]].id))
                if not exists:
                    session.add(WorkflowEdge(workflow_id=workflow.id, from_node_id=nodes[dep].id, to_node_id=nodes[n["key"]].id))
    await session.flush()


async def seed_demo_user(session: AsyncSession, settings: Settings) -> User:
    user = await session.scalar(select(User).where(User.email == settings.demo_user_email))
    if not user:
        user = User(email=settings.demo_user_email, hashed_password=hash_password(settings.demo_user_password, settings.bcrypt_rounds),
                    full_name="Demo Resident", role=UserRole.ADMIN, preferred_language="en")
        session.add(user)
        await session.flush()
    return user


async def reset_demo_case(session: AsyncSession) -> None:
    case = await session.scalar(select(LifeEventCase).where(LifeEventCase.reference == DEMO_REFERENCE))
    if not case:
        return
    cid = case.id
    await session.execute(delete(MockApplication).where(MockApplication.case_reference == DEMO_REFERENCE))
    for model in (TimelineEvent, Callback, Conversation, Consent, Document, TaskDependency):
        await session.execute(delete(model).where(model.case_id == cid))
    await session.execute(delete(Event).where(Event.case_id == cid))
    await session.execute(delete(ServiceTask).where(ServiceTask.case_id == cid))
    await session.execute(delete(LifeEventCase).where(LifeEventCase.id == cid))
    await session.flush()


async def seed_demo_case(session: AsyncSession, user: User, settings: Settings) -> LifeEventCase | None:
    """Replay the first days of the demo story through the real engine. Returns None if it already exists."""
    if await session.scalar(select(LifeEventCase.id).where(LifeEventCase.reference == DEMO_REFERENCE)):
        return None
    tick = {"now": DEMO_START}

    def clock() -> datetime:
        tick["now"] += timedelta(seconds=1)
        return tick["now"]

    def jump(to: datetime) -> None:
        tick["now"] = to

    seed_settings = settings.model_copy(update={"callback_delay_seconds": 0.0})
    c = ServiceContainer(session, settings=seed_settings, caller=SimulatedCaller())
    with use_clock(clock):
        # Day 0 - resident calls, consents, case is created and the first service is submitted.
        conversation = Conversation(
            user_id=user.id, channel=ConversationChannel.VOICE_INBOUND, status=ConversationStatus.COMPLETED, provider="simulated",
            language="en", started_at=DEMO_START, ended_at=DEMO_START + timedelta(seconds=96), duration_seconds=96.0,
            transcript=[
                {"role": "agent", "text": "This is the LifeLoop assistant, an AI assistant. How can I help today?"},
                {"role": "user", "text": "My daughter was born yesterday."},
                {"role": "agent", "text": "Congratulations. I can coordinate the services associated with this event. With your permission, I can keep you updated as each stage is completed. Would you like me to proceed?"},
                {"role": "user", "text": "Yes."},
                {"role": "agent", "text": f"Thank you. I've opened case {DEMO_REFERENCE}. I'll start the first steps with the relevant authorities and call you when something important changes. You don't need to do anything right now.", "tools": ["create_life_event_case"]},
            ],
            state={"stage": "active"}, summary="Resident reported a birth and consented to coordination.",
        )
        jump(DEMO_START + timedelta(minutes=1))
        case, _ = await c.cases.create_case(
            user, CreateCaseInput(
                event_type="BIRTH", event_date=date(2026, 9, 20),
                participants=[{"role": "parent", "name": user.full_name}, {"role": "child", "relationship": "daughter", "name": "Demo Daughter"}],
                preferences={"language": "en", "callback_time": "morning", "channel": "voice"},
                memory={"reported_via": "voice", "resident_words": "My daughter was born yesterday."},
                consents={ConsentType.DATA_PROCESSING_CONSENT: True, ConsentType.CALLBACK_CONSENT: True, ConsentType.SERVICE_INITIATION_CONSENT: True},
                source="voice", reference=DEMO_REFERENCE,
            ), actor="ai:voice-agent",
        )
        conversation.case_id = case.id
        session.add(conversation)
        await c.settle()

        async def act(action: str) -> None:
            await c.demo.perform(case, action)
            await c.settle()

        # Registration accepted, then completed next morning; certificate follows.
        jump(datetime(2026, 9, 20, 10, 44, tzinfo=UTC))
        await c.demo.simulate(await c.demo._active_task(case, ("BIRTH_REGISTRATION",)), "acknowledge")  # noqa: SLF001
        await c.settle()
        jump(datetime(2026, 9, 21, 9, 12, tzinfo=UTC))
        await act("complete_birth_registration")
        jump(datetime(2026, 9, 21, 9, 13, tzinfo=UTC))
        await c.callbacks.execute_due(force=True)
        await c.settle()
        jump(datetime(2026, 9, 21, 9, 14, tzinfo=UTC))
        await c.demo.simulate(await c.demo._active_task(case, ("BIRTH_CERTIFICATE",)), "acknowledge")  # noqa: SLF001
        await c.settle()
        await act("issue_birth_certificate")
        # Identity is picked up by its authority; health is submitted and waiting to be accepted.
        jump(datetime(2026, 9, 21, 9, 16, tzinfo=UTC))
        await act("start_identity")
        jump(datetime(2026, 9, 21, 9, 20, tzinfo=UTC))
        await c.callbacks.execute_due(force=True)
        await c.settle()
    await session.commit()
    log.info("demo_case_seeded", reference=DEMO_REFERENCE)
    return case


async def run_seed(session: AsyncSession, settings: Settings | None = None, *, reset_demo: bool = False) -> None:
    settings = settings or get_settings()
    entities = await seed_entities(session)
    await seed_workflows(session, entities)
    user = await seed_demo_user(session, settings)
    if reset_demo:
        await reset_demo_case(session)
    await seed_demo_case(session, user, settings)
    await session.commit()


async def main(reset_demo: bool = False) -> None:
    from app.db.session import get_sessionmaker

    async with get_sessionmaker()() as session:
        await run_seed(session, reset_demo=reset_demo)
    print("Seed complete (idempotent).")


if __name__ == "__main__":
    configure_logging(json_logs=False)
    import logging

    import structlog

    structlog.configure(wrapper_class=structlog.make_filtering_bound_logger(logging.WARNING))  # keep the seed output readable
    asyncio.run(main(reset_demo="--reset-demo" in sys.argv))
