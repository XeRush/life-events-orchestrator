"""Timeline entries carry a translation key with structured params, so the UI can render them in the resident's language."""
import re

from app.events.pump import pump
from app.events.recorder import Actor
from app.models.enums import ConsentType
from tests.conftest import approve, authority, login, open_case, run

# Codes, references, counts and ISO dates only: never an English sentence or a raw identifier.
STRUCTURED = re.compile(r"^[A-Za-z0-9_,.:\-]+$")


async def test_timeline_events_carry_i18n_keys(client, infra, world):
    resident, officer = world["resident"], world["officer"]
    ref = await open_case(infra, resident)
    await approve(infra, ref, "BIRTH_CERTIFICATE", officer.id)
    await authority(infra, ref, "BIRTH_CERTIFICATE", "CLEARED")

    async def request_docs(c):
        case = await c.cases_repo.by_reference(ref)
        await c.approvals.request_documents(case, await c.users_repo.get(officer.id), "MOFA_ATTESTATION", ["ATTESTED_MARRIAGE_CERTIFICATE"])
    await run(infra, request_docs)

    async def withdraw_callbacks(c):
        case = await c.cases_repo.by_reference(ref)
        user = await c.users_repo.get(resident.id)
        await c.consents.revoke(case, user, ConsentType.CALLBACK, Actor.user(user))
    await run(infra, withdraw_callbacks)
    await pump(infra)

    r = await client.get(f"/api/v1/cases/{ref}/timeline", params={"limit": 500}, headers=await login(client, "resident@test.local"))
    assert r.status_code == 200
    items = r.json()["items"]
    missing = [e["event_type"] for e in items if not (e.get("i18n") or {}).get("key")]
    assert not missing, f"timeline events without an i18n key: {missing}"

    by_key = {e["i18n"]["key"]: e for e in items}
    for key in ("timeline.caseCreated", "timeline.graphBuilt", "timeline.consent", "timeline.officerApproved", "timeline.documentsRequested",
                "timeline.consentRevoked", "node.WAITING_FOR_HUMAN", "node.SUBMITTING", "node.SUBMITTED", "node.CLEARED",
                "node.DOCUMENT_MISSING"):
        assert key in by_key, f"{key} not on the timeline"
    assert by_key["node.CLEARED"]["i18n"]["params"] == {"node": "BIRTH_CERTIFICATE", "entity": "DHA"}
    assert by_key["node.DOCUMENT_MISSING"]["i18n"]["params"]["docs"] == "ATTESTED_MARRIAGE_CERTIFICATE"
    assert by_key["timeline.documentsRequested"]["i18n"]["params"]["docs"] == "ATTESTED_MARRIAGE_CERTIFICATE"
    assert by_key["timeline.caseCreated"]["i18n"]["params"]["ref"] == ref

    for e in items:  # params are codes, never English text or PII
        for name, value in e["i18n"]["params"].items():
            assert isinstance(value, str) and STRUCTURED.match(value), f"{e['event_type']}.{name} = {value!r}"
            assert "1234567" not in value and "7654321" not in value  # the test parents' Emirates ID digits
    # The English title and description are unchanged for the officer and audit views.
    assert by_key["node.CLEARED"]["title"] == "Birth certificate cleared by DHA"
