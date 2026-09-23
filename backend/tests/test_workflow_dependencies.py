import pytest

from app.agents.journey_planner import parallel_groups, topological_layers
from app.core.errors import UnsupportedEventType
from app.models.enums import CaseStatus
from app.models.enums import TaskStatus as S
from app.services.case_service import CreateCaseInput
from tests.helpers import act, make_case, status_map


def test_layers_and_parallel_groups():
    deps = {"a": [], "b": ["a"], "c": ["b"], "d": ["b"], "e": ["c", "d"]}
    assert topological_layers(deps) == {"a": 0, "b": 1, "c": 2, "d": 2, "e": 3}
    assert parallel_groups(deps)[2] == ["c", "d"]


def test_cycle_detected():
    with pytest.raises(ValueError):
        topological_layers({"a": ["b"], "b": ["a"]})


async def test_graph_comes_from_persisted_workflow(container, resident):
    case = await make_case(container, resident)
    graph = await container.workflows.case_graph(case)
    keys = {n["key"]: n for n in graph["nodes"]}
    assert set(keys) == {"BIRTH_REPORTED", "BIRTH_REGISTRATION", "BIRTH_CERTIFICATE", "IDENTITY_PROCESS", "HEALTH_PROCESS",
                         "ADDITIONAL_SERVICES", "CASE_COMPLETE"}
    assert keys["IDENTITY_PROCESS"]["dependencies"] == ["BIRTH_CERTIFICATE"]
    assert keys["IDENTITY_PROCESS"]["layer"] == keys["HEALTH_PROCESS"]["layer"]  # parallel branches
    assert {"from": "BIRTH_CERTIFICATE", "to": "HEALTH_PROCESS"} in graph["edges"]


async def test_downstream_stays_blocked_until_prerequisites_complete(container, resident):
    case = await make_case(container, resident)
    st = await status_map(container, case)
    assert st["BIRTH_CERTIFICATE"] == S.BLOCKED and st["IDENTITY_PROCESS"] == S.BLOCKED
    await act(container, case, "complete_birth_registration")
    st = await status_map(container, case)
    assert st["IDENTITY_PROCESS"] == S.BLOCKED and st["HEALTH_PROCESS"] == S.BLOCKED


async def test_unconfigured_life_events_do_not_pretend_to_run(container, resident):
    with pytest.raises(UnsupportedEventType):
        await container.cases.create_case(resident, CreateCaseInput(event_type="MARRIAGE"))
    templates = {t["code"]: t for t in await container.workflows.templates()}
    assert templates["BIRTH"]["is_configured"] and not templates["MARRIAGE"]["is_configured"]
    preview = await container.workflows.template_graph("MOVE")
    assert preview["nodes"] and not preview["is_configured"]


async def test_case_without_service_consent_waits(container, resident):
    from app.models.enums import ConsentType

    case = await make_case(container, resident, consents={ConsentType.CALLBACK_CONSENT: True})
    assert case.status == CaseStatus.PENDING_CONSENT
    assert await container.cases.tasks(case.id) == []
    await container.consents.record(case, ConsentType.SERVICE_INITIATION_CONSENT, True)
    await container.commit()
    assert case.status == CaseStatus.IN_PROGRESS
    assert len(await container.cases.tasks(case.id)) == 7


async def test_paused_case_starts_nothing_until_resumed(container, resident):
    case = await make_case(container, resident)
    await container.cases.pause(case)
    await container.commit()
    await act(container, case, "complete_birth_registration")
    assert (await status_map(container, case))["BIRTH_CERTIFICATE"] == S.READY  # unlocked but not submitted
    await container.cases.resume(case)
    await container.commit()
    assert (await status_map(container, case))["BIRTH_CERTIFICATE"] == S.SUBMITTED
