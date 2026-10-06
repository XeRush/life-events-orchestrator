"""Marriage, moving and starting-a-business run end to end through the same engine as the birth journey."""
import pytest

from app.models.enums import CaseStatus, ConsentType
from app.models.enums import TaskStatus as S
from app.services.case_service import CreateCaseInput
from tests.helpers import ALL_CONSENTS, act, status_map

JOURNEYS = {
    "MARRIAGE": {
        "participants": [{"role": "parent", "name": "Resident"}, {"role": "spouse", "name": "Sara"}],
        "memory": {"details": {"partner_name": "Sara"}},
        "steps": ["complete_marriage_registration", "complete_marriage_certificate", "complete_record_updates"],
        "keys": ["MARRIAGE_REGISTRATION", "MARRIAGE_CERTIFICATE", "RECORD_UPDATES"],
    },
    "MOVE": {
        "participants": [{"role": "parent", "name": "Resident"}],
        "memory": {"details": {"new_address": "Villa 12, Al Barsha"}},
        "steps": ["complete_address_update", "complete_identity_update", "complete_utilities_transfer"],
        "keys": ["ADDRESS_UPDATE", "IDENTITY_UPDATE", "UTILITIES"],
    },
    "BUSINESS_START": {
        "participants": [{"role": "parent", "name": "Resident"}],
        "memory": {"details": {"business_name": "Blue Olive Cafe"}},
        "steps": ["complete_trade_name", "complete_business_license", "complete_tax_registration"],
        "keys": ["TRADE_NAME", "LICENSE", "TAX_REGISTRATION"],
    },
}


async def _create(container, resident, event_type: str, spec: dict):
    data = CreateCaseInput(event_type=event_type, participants=spec["participants"], memory=spec["memory"], consents=ALL_CONSENTS)
    case, _ = await container.cases.create_case(resident, data)
    await container.commit()
    return case


@pytest.mark.parametrize("event_type", list(JOURNEYS))
async def test_event_is_configured_and_activates(container, resident, event_type):
    templates = {t["code"]: t for t in await container.workflows.templates()}
    assert templates[event_type]["is_configured"]
    case = await _create(container, resident, event_type, JOURNEYS[event_type])
    assert case.status == CaseStatus.IN_PROGRESS
    st = await status_map(container, case)
    first = JOURNEYS[event_type]["keys"][0]
    assert st[first] in {S.SUBMITTED, S.PROCESSING}
    assert all(st[k] == S.BLOCKED for k in JOURNEYS[event_type]["keys"][1:])


@pytest.mark.parametrize("event_type", list(JOURNEYS))
async def test_event_runs_to_completion_in_order(container, resident, event_type):
    spec = JOURNEYS[event_type]
    case = await _create(container, resident, event_type, spec)
    for key, step in zip(spec["keys"], spec["steps"], strict=True):
        assert (await status_map(container, case))[key] in {S.SUBMITTED, S.PROCESSING}
        await act(container, case, step)
        assert (await status_map(container, case))[key] == S.COMPLETED
    assert case.status == CaseStatus.COMPLETED


async def test_moving_details_reach_the_authority_applicant(container, resident):
    case = await _create(container, resident, "MOVE", JOURNEYS["MOVE"])
    app = await container.adapters.get("ADDRESS_REGISTRY").find(container.session, case.reference, "ADDRESS_UPDATE")
    assert app.applicant["details"] == {"new_address": "Villa 12, Al Barsha"}
    assert case.event_type == "MOVE" and case.status != CaseStatus.PENDING_CONSENT


async def test_marriage_waits_for_service_consent(container, resident):
    data = CreateCaseInput(event_type="MARRIAGE", participants=JOURNEYS["MARRIAGE"]["participants"],
                           consents={ConsentType.CALLBACK_CONSENT: True})
    case, _ = await container.cases.create_case(resident, data)
    await container.commit()
    assert case.status == CaseStatus.PENDING_CONSENT and await container.cases.tasks(case.id) == []
