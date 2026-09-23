from datetime import date

from app.models.enums import ConsentType, TaskStatus
from app.models.user import User
from app.services.case_service import CreateCaseInput
from app.services.container import ServiceContainer

ALL_CONSENTS = {
    ConsentType.DATA_PROCESSING_CONSENT: True,
    ConsentType.CALLBACK_CONSENT: True,
    ConsentType.SERVICE_INITIATION_CONSENT: True,
}


async def make_case(c: ServiceContainer, user: User, consents=None, **kw):
    data = CreateCaseInput(
        event_type="BIRTH", event_date=date(2026, 9, 20),
        participants=[{"role": "parent", "name": user.full_name}, {"role": "child", "name": "Baby"}],
        consents=ALL_CONSENTS if consents is None else consents, **kw,
    )
    case, _ = await c.cases.create_case(user, data)
    await c.commit()
    return case


async def status_map(c: ServiceContainer, case) -> dict[str, TaskStatus]:
    return {t.key: t.status for t in await c.cases.tasks(case.id)}


async def act(c: ServiceContainer, case, action: str):
    result = await c.demo.perform(case, action)
    await c.commit()
    return result
