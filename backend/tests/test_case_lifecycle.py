"""The full post-birth journey, end to end, through the real event pipeline (outbox -> broker -> consumers)."""
from sqlalchemy import func, select

from app.events.recorder import Actor
from app.models import Callback, CaseEvent, EntityRequest, OutboxEvent
from app.models.enums import CallbackStatus, OutboxStatus
from tests.conftest import approve, authority, node_state, open_case, run


async def test_birth_journey_end_to_end(infra, world):
    resident, officer = world["resident"], world["officer"]
    ref = await open_case(infra, resident)

    # Intake builds six nodes; the orchestrator prepares the birth certificate and parks it at the human gate.
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "WAITING_FOR_HUMAN"
    assert await node_state(infra, ref, "MOFA_ATTESTATION") == "PENDING"

    await approve(infra, ref, "BIRTH_CERTIFICATE", officer.id)
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "SUBMITTED"
    await authority(infra, ref, "BIRTH_CERTIFICATE", "PROCESSING")
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "PROCESSING"
    await authority(infra, ref, "BIRTH_CERTIFICATE", "CLEARED")
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "CLEARED"
    # Clearing unlocks MOFA (prepared for release) and schedules a consented callback.
    assert await node_state(infra, ref, "MOFA_ATTESTATION") == "WAITING_FOR_HUMAN"

    await approve(infra, ref, "MOFA_ATTESTATION", officer.id)
    await authority(infra, ref, "MOFA_ATTESTATION", "CLEARED")
    # The consulate has no API: LifeLoop waits for the parent instead of filing.
    assert await node_state(infra, ref, "CONSULATE_PASSPORT") == "WAITING_FOR_PARENT"

    async def parent(milestone, **kw):
        async def go(c):
            case = await c.cases_repo.by_reference(ref)
            user = await c.users_repo.get(resident.id)
            return await c.consulate.report(case, milestone, actor=Actor.user(user), channel="WEB", **kw)
        return await run(infra, go)

    await parent("APPOINTMENT_BOOKED")
    await parent("APPLICATION_SUBMITTED")
    assert await node_state(infra, ref, "CONSULATE_PASSPORT") == "PROCESSING"
    await parent("PASSPORT_ISSUED", passport_number_present=True)
    assert await node_state(infra, ref, "CONSULATE_PASSPORT") == "COMPLETED"
    assert await node_state(infra, ref, "RESIDENCE_VISA") == "WAITING_FOR_HUMAN"  # re-planned immediately

    await approve(infra, ref, "RESIDENCE_VISA", officer.id)
    await authority(infra, ref, "RESIDENCE_VISA", "CLEARED")
    await approve(infra, ref, "EMIRATES_ID", officer.id)
    await authority(infra, ref, "EMIRATES_ID", "WAITING_FOR_PARENT")  # ICP biometrics - resident present
    assert await node_state(infra, ref, "EMIRATES_ID") == "WAITING_FOR_PARENT"
    await authority(infra, ref, "EMIRATES_ID", "COMPLETED")
    await approve(infra, ref, "INSURANCE", officer.id)
    await authority(infra, ref, "INSURANCE", "COMPLETED")

    async def check(c):
        case = await c.cases_repo.by_reference(ref)
        assert case.status.value == "COMPLETED"
        present = await c.timeline_repo.resident_present_count(case.id)
        assert present == 2  # consulate appointment + ICP biometrics (canvas box M target)
        sources = set((await c.session.scalars(select(CaseEvent.source).where(CaseEvent.case_id == case.id))).all())
        assert {"AI_AGENT", "HUMAN_OFFICER", "GOVERNMENT_MOCK", "PARENT_REPORTED"} <= {s.value for s in sources}
        callbacks = (await c.session.scalars(select(Callback).where(Callback.case_id == case.id))).all()
        assert callbacks and all(cb.consent_id is not None for cb in callbacks if cb.status == CallbackStatus.SCHEDULED)
        reasons = {r["reason"] for cb in callbacks for r in cb.reasons}
        assert {"CLEARED", "COMPLETED", "PARENT_INPUT", "BIOMETRICS", "CASE_COMPLETE"} <= reasons
        pending = await c.session.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.status != OutboxStatus.PROCESSED))
        assert pending == 0
        requests = (await c.session.scalars(select(EntityRequest).where(EntityRequest.case_id == case.id))).all()
        assert len(requests) == 5  # five filings; the consulate is never filed
        sent = {f for r in requests for f in r.fields_sent}
        assert not any(f.endswith(".emirates_id") for f in sent)  # raw ID numbers never cross the tool boundary
        assert "father.emirates_id_token" in sent and not any("passport_number" in f for f in sent)
        assert case.re_entry_count == 0
    await run(infra, check)


async def test_case_creation_is_idempotent(infra, world):
    ref1 = await open_case(infra, world["resident"])
    ref2 = await open_case(infra, world["resident"])
    assert ref1 == ref2


async def test_missing_marriage_certificate_blocks_birth_certificate(infra, world):
    ref = await open_case(infra, world["resident"], marriage_certificate_attested=False)
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "DOCUMENT_MISSING"

    async def upload(c):
        case = await c.cases_repo.by_reference(ref)
        user = await c.users_repo.get(world["resident"].id)
        await c.documents.upload(case, user, "ATTESTED_MARRIAGE_CERTIFICATE", b"%PDF-1.4 test", "marriage.pdf", "application/pdf")
    await run(infra, upload)
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "WAITING_FOR_HUMAN"
