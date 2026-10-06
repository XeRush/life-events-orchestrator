"""Consumers: one named handler per concern, each idempotent via consumer receipts.

| Topic                       | Consumer             | Effect                                                   |
|-----------------------------|----------------------|----------------------------------------------------------|
| lifeloop.case.events        | orchestrator         | LangGraph case orchestration (unlock, plan, decide)      |
| lifeloop.case.events        | graph-projection     | Neo4j projection + case summary cache invalidation       |
| lifeloop.case.callbacks     | callback-scheduler   | consent/opt-out checks, coalescing, scheduling           |
| lifeloop.entity.requests    | entity-submitter     | file the released request with the (mock) authority      |
| lifeloop.entity.status      | entity-status        | apply the authority's status to the graph                |
| lifeloop.agent.events       | post-call            | post-call webhook -> transcript, consent, fields, outcome |
| lifeloop.notifications      | notifier             | send SMS / email                                         |
"""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from app.events.catalog import (
    TOPIC_AGENT,
    TOPIC_CALLBACKS,
    TOPIC_CASE,
    TOPIC_ENTITY_REQUESTS,
    TOPIC_ENTITY_STATUS,
    TOPIC_NOTIFICATIONS,
)
from app.events.consumers import Message, consumer
from app.workflows.case_orchestrator import ORCHESTRATOR_TRIGGERS

if TYPE_CHECKING:
    from app.services.container import ServiceContainer


@consumer("orchestrator", TOPIC_CASE, events=tuple(ORCHESTRATOR_TRIGGERS))
async def orchestrate(c: ServiceContainer, m: Message) -> None:
    if m.case_id:
        await c.orchestrator.run(m)


@consumer("graph-projection", TOPIC_CASE, categories=("node_transition", "case"))
async def project_graph(c: ServiceContainer, m: Message) -> None:
    if not m.case_id:
        return
    await c.infra.cache.delete(f"case:summary:{m.case_id}")
    if m.category == "node_transition" or m.event_type == "IntakeCompleted":
        case = await c.cases_repo.get(m.case_id)
        if case is not None:
            await c.graph.project(case)


@consumer("callback-scheduler", TOPIC_CALLBACKS, events=("CallbackRequired",))
async def schedule_callback(c: ServiceContainer, m: Message) -> None:
    case = await c.cases_repo.get(m.case_id) if m.case_id else None
    if case is None:
        return
    p = m.payload
    await c.callbacks.request(case, p["reason"], trigger_event=p.get("trigger") or m.event_type, node_key=p.get("node_key"),
                              node_title=p.get("node_title"), entity=p.get("entity"), detail=p.get("detail"))


@consumer("entity-submitter", TOPIC_ENTITY_REQUESTS, events=("EntityRequestReleased",))
async def submit_request(c: ServiceContainer, m: Message) -> None:
    await c.entities.submit(uuid.UUID(m.payload["request_id"]))


@consumer("entity-status", TOPIC_ENTITY_STATUS, events=("EntityStatusReceived",))
async def apply_entity_status(c: ServiceContainer, m: Message) -> None:
    await c.entities.apply_status(m)


@consumer("post-call", TOPIC_AGENT, events=("PostCallWebhookReceived",))
async def post_call(c: ServiceContainer, m: Message) -> None:
    await c.calls.process_post_call(uuid.UUID(m.payload["integration_event_id"]))


@consumer("notifier", TOPIC_NOTIFICATIONS, events=("NotificationRequested",))
async def notify(c: ServiceContainer, m: Message) -> None:
    await c.notifications.deliver(uuid.UUID(m.payload["notification_id"]))
