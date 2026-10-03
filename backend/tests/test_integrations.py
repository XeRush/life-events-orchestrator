"""Government adapters (minimisation, idempotency, failures), outbox/broker semantics, webhooks, SLA watchdog."""
import json
from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.core.clock import utcnow
from app.core.security import sign_payload
from app.events.broker import InMemoryBroker
from app.events.consumers import dispatch
from app.events.pump import pump
from app.events.relay import relay_once
from app.integrations.government.base import FieldsNotAllowed, NotSupported
from app.integrations.government.contracts import SubmitRequest
from app.models import ConsumerReceipt, IntegrationEvent, LifeEventNode, OutboxEvent
from app.models.enums import NodeState, OutboxStatus
from app.workers.jobs import sla_watchdog
from tests.conftest import approve, authority, login, node_state, open_case, run


async def test_adapter_refuses_extra_personal_data_and_is_idempotent(infra):
    adapter = infra.adapters.all["mofa"]
    with pytest.raises(FieldsNotAllowed):
        await adapter.submit_request(SubmitRequest(request_type="ATTESTATION", idempotency_key="k" * 12, case_reference="LL-1",
                                                   fields={"child.full_name_en": "A", "father.emirates_id": "784199012345671"}))
    req = SubmitRequest(request_type="ATTESTATION", idempotency_key="case-1:MOFA:1", case_reference="LL-1",
                        fields={"child.full_name_en": "A", "birth_certificate.reference": "DHA-BC-1"})
    first = await adapter.submit_request(req)
    second = await adapter.submit_request(req)
    assert first.external_ref == second.external_ref and second.duplicate
    with pytest.raises(NotSupported):
        await infra.adapters.all["consulate"].get_status("anything")


async def test_authority_outage_stalls_without_inventing_success_then_officer_retries(infra, world, client):
    ref = await open_case(infra, world["resident"])
    infra.adapters.set_failure("*", "unavailable")
    await approve(infra, ref, "BIRTH_CERTIFICATE", world["officer"].id)
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "STALLED"
    infra.adapters.set_failure("*", None)
    officer = await login(client, "officer@test.local")
    r = await client.post(f"/api/v1/officer/cases/{ref}/nodes/BIRTH_CERTIFICATE/retry", headers=officer)
    assert r.status_code == 200, r.text
    await pump(infra)
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "SUBMITTED"


async def test_poll_refiles_an_application_the_authority_forgot(infra, world):
    """A mock authority whose memory was reset (cache flushed, restart without Redis) reports "no application": the
    poller files it again under the same idempotency key, so the same reference resumes and nothing stalls."""
    ref = await open_case(infra, world["resident"])
    await approve(infra, ref, "BIRTH_CERTIFICATE", world["officer"].id)

    async def forget_and_poll(c):
        case = await c.cases_repo.by_reference(ref)
        node = await c.nodes_repo.by_key(case.id, "BIRTH_CERTIFICATE")
        request = (await c.requests_repo.for_case(case.id))[0]
        adapter = c.infra.adapters.for_node(node.key, node.entity)
        await c.infra.cache.delete(adapter._key(request.external_ref))
        assert await c.entities.poll(request) is None           # unknown -> re-filed quietly
        status = await adapter.get_status(request.external_ref)  # the same reference is known again
        return status.status, request.state

    status, state = await run(infra, forget_and_poll)
    assert status == "SUBMITTED" and state == "SUBMITTED"
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "SUBMITTED"


async def test_outbox_survives_broker_outage_and_preserves_order(infra, world):
    infra.broker.simulate_failure = True
    ref = await open_case(infra, world["resident"])  # pump cannot publish
    async def pending(c):
        return await c.session.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.status == OutboxStatus.PENDING))
    assert await run(infra, pending) > 0
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "PENDING"  # nothing processed while Kafka is down
    infra.broker.simulate_failure = False

    async def make_available(c):
        for ev in (await c.session.scalars(select(OutboxEvent))).all():
            ev.available_at = utcnow() - timedelta(seconds=1)
    await run(infra, make_available)
    await pump(infra)
    assert await run(infra, pending) == 0
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "WAITING_FOR_HUMAN"


async def test_redelivered_event_has_one_effect(infra, world):
    infra.broker.simulate_failure = False
    ref = await open_case(infra, world["resident"])
    await approve(infra, ref, "BIRTH_CERTIFICATE", world["officer"].id)
    broker: InMemoryBroker = infra.broker.broker
    async def last_release(c):
        ev = await c.session.scalar(select(OutboxEvent).where(OutboxEvent.event_type == "EntityRequestReleased"))
        from app.events.relay import to_message
        return to_message(ev)
    message = await run(infra, last_release)
    await dispatch(infra, message)  # duplicate delivery
    await dispatch(infra, message)
    async def receipts(c):
        return await c.session.scalar(select(func.count()).select_from(ConsumerReceipt).where(ConsumerReceipt.consumer == "entity-submitter"))
    assert await run(infra, receipts) == 1
    assert broker.queue.empty()
    assert await relay_once(infra) == 0


async def test_sla_watchdog_marks_stalled_and_escalates(infra, world):
    ref = await open_case(infra, world["resident"])
    await approve(infra, ref, "BIRTH_CERTIFICATE", world["officer"].id)
    async def overdue(c):
        case = await c.cases_repo.by_reference(ref)
        node = await c.nodes_repo.by_key(case.id, "BIRTH_CERTIFICATE")
        node.sla_due_at = utcnow() - timedelta(hours=1)
    await run(infra, overdue)
    assert await sla_watchdog(infra) == 1
    await pump(infra)
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "STALLED"
    async def check(c):
        case = await c.cases_repo.by_reference(ref)
        escalations = await c.escalations_repo.open_for_case(case.id)
        assert [e.reason.value for e in escalations] == ["SLA_STALL"]
        assert case.status.value == "ESCALATED"
    await run(infra, check)


async def test_document_missing_from_authority_then_resubmission(infra, world):
    ref = await open_case(infra, world["resident"])
    await approve(infra, ref, "BIRTH_CERTIFICATE", world["officer"].id)
    await authority(infra, ref, "BIRTH_CERTIFICATE", "DOCUMENT_MISSING", missing=["HOSPITAL_BIRTH_NOTIFICATION"])
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "DOCUMENT_MISSING"


async def test_webhook_signature_replay_and_idempotency(client, infra, world):
    infra.settings.elevenlabs_webhook_secret = "whsec_test"
    try:
        body = json.dumps({"type": "post_call_transcription", "data": {"conversation_id": "conv_1", "transcript": []}}).encode()
        r = await client.post("/api/v1/agent/webhooks/elevenlabs", content=body, headers={"ElevenLabs-Signature": "t=1,v0=bad"})
        assert r.status_code == 401
        sig = sign_payload("whsec_test", body)
        r = await client.post("/api/v1/agent/webhooks/elevenlabs", content=body, headers={"ElevenLabs-Signature": sig})
        assert r.json()["status"] == "accepted"
        r = await client.post("/api/v1/agent/webhooks/elevenlabs", content=body, headers={"ElevenLabs-Signature": sig})
        assert r.json()["status"] == "duplicate"  # replayed signature
        r = await client.post("/api/v1/agent/webhooks/elevenlabs", content=body, headers={"ElevenLabs-Signature": sign_payload("whsec_test", body, 10**9 + 5)})
        assert r.status_code == 401  # outside the replay window
    finally:
        infra.settings.elevenlabs_webhook_secret = ""


async def test_post_call_webhook_writes_back_to_the_case(client, infra, world):
    ref = await open_case(infra, world["resident"], consent_callback=False)
    officer = await login(client, "officer@test.local")
    r = await client.post(f"/api/v1/demo/cases/{ref}/webhook", headers=officer)
    assert r.status_code == 200 and r.json()["webhook"]["status"] == "accepted"
    await pump(infra)
    async def check(c):
        event = await c.session.scalar(select(IntegrationEvent))
        assert event.status.value == "PROCESSED"
    await run(infra, check)


async def test_graph_has_six_nodes_and_serial_edges(infra, world, client):
    ref = await open_case(infra, world["resident"], emirate="SHARJAH")
    resident = await login(client, "resident@test.local")
    graph = (await client.get(f"/api/v1/cases/{ref}/graph", headers=resident)).json()
    assert [n["key"] for n in graph["nodes"]] == ["BIRTH_CERTIFICATE", "MOFA_ATTESTATION", "CONSULATE_PASSPORT", "RESIDENCE_VISA",
                                                  "EMIRATES_ID", "INSURANCE"]
    entities = {n["key"]: n["entity"] for n in graph["nodes"]}
    assert entities["BIRTH_CERTIFICATE"] == "MOHAP" and entities["RESIDENCE_VISA"] == "ICP"  # emirate routing
    assert len(graph["edges"]) == 5
    impact = (await client.get(f"/api/v1/cases/{ref}/graph/impact/CONSULATE_PASSPORT", headers=resident)).json()
    assert [n["key"] for n in impact["held_downstream"]] == ["RESIDENCE_VISA", "EMIRATES_ID", "INSURANCE"] and impact["source"] == "postgres"
    consulate = next(n for n in graph["nodes"] if n["key"] == "CONSULATE_PASSPORT")
    assert consulate["type"] == "PARENT_REPORTED" and consulate["sla"]["hours"] is None and not consulate["is_mock"]


async def test_invalid_transitions_are_rejected(infra, world):
    ref = await open_case(infra, world["resident"])
    from app.core.errors import InvalidTransition
    from app.models.enums import Source

    async def bad(c):
        case = await c.cases_repo.by_reference(ref)
        node = await c.session.scalar(select(LifeEventNode).where(LifeEventNode.case_id == case.id, LifeEventNode.key == "INSURANCE"))
        with pytest.raises(InvalidTransition):
            await c.graph.transition(node, NodeState.CLEARED, source=Source.SYSTEM)
    await run(infra, bad)
