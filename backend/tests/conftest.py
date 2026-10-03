"""Test fixtures: in-memory SQLite, a test Infra with every fallback active (in-memory broker, memory cache, no
Neo4j/Langfuse, console email, mock SMS, simulated telephony), and helpers to drive the event pipeline."""
import os

os.environ.update({
    "ENVIRONMENT": "test", "DATABASE_URL": "sqlite+aiosqlite:///:memory:", "BCRYPT_ROUNDS": "4", "RUN_WORKERS": "false",
    "RUN_MIGRATIONS_ON_STARTUP": "false", "SEED_ON_STARTUP": "false", "REDIS_URL": "", "KAFKA_BOOTSTRAP_SERVERS": "", "NEO4J_URI": "",
    "LANGFUSE_PUBLIC_KEY": "", "LANGFUSE_SECRET_KEY": "", "ELEVENLABS_API_KEY": "", "ELEVENLABS_AGENT_ID": "", "GMAIL_CREDENTIALS_B64": "",
    "TWILIO_ACCOUNT_SID": "", "STORAGE_DIR": "./.test-storage", "LOG_LEVEL": "ERROR", "LOG_OUTPUT": "none", "DEMO_MODE": "true",
    "CALLBACK_COALESCE_SECONDS": "0", "ADAPTER_BACKOFF_SECONDS": "0", "DEMO_USER_PASSWORD": "Test-Pass-2026", "ELEVENLABS_WEBHOOK_SECRET": "",
    "AUTH_RATE_LIMIT_PER_MINUTE": "1000", "VOICE_TOOL_SECRET": "test-tool-secret",
})

from datetime import date, timedelta  # noqa: E402

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.clock import utcnow  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db import session as db_session  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.events.pump import pump  # noqa: E402
from app.events.recorder import Actor  # noqa: E402
from app.models import Organization, User  # noqa: E402
from app.models.enums import OrganizationKind, UserRole  # noqa: E402
from app.observability.logging import configure_logging  # noqa: E402
from app.schemas.cases import IntakeIn  # noqa: E402
from app.services.container import ServiceContainer  # noqa: E402
from app.services.infra import build_infra, set_infra  # noqa: E402

configure_logging("ERROR", "none", True)
PASSWORD = "Test-Pass-2026"


@pytest_asyncio.fixture
async def infra():
    get_settings.cache_clear()
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)  # tests only - production schema is Alembic-managed
    db_session.override_engine(engine)
    infra = build_infra(get_settings(), db_session.get_sessionmaker())
    set_infra(infra)
    yield infra
    await infra.drain_background()
    set_infra(None)
    await engine.dispose()


@pytest_asyncio.fixture
async def c(infra):
    async with infra.sessionmaker() as session:
        yield ServiceContainer(session, infra=infra)


async def make_user(c: ServiceContainer, email: str, role: UserRole = UserRole.RESIDENT, org: Organization | None = None,
                    name: str = "Test User", verified: bool = True, phone: str | None = "+971500000001") -> User:
    user = User(email=email, hashed_password=hash_password(PASSWORD, 4), full_name=name, role=role, organization_id=org.id if org else None,
                email_verified_at=utcnow() if verified else None, phone=phone, title="Amer Officer" if role == UserRole.OFFICER else None,
                password_changed_at=utcnow() - timedelta(minutes=5))
    c.session.add(user)
    await c.session.flush()
    return user


@pytest_asyncio.fixture
async def world(c):
    """A service centre, a resident, two officers (one elsewhere) and an admin."""
    centre = Organization(code="AMER-TEST", name="Amer Test Centre", kind=OrganizationKind.SERVICE_CENTRE, emirate="DUBAI")
    other = Organization(code="AMER-OTHER", name="Other Centre", kind=OrganizationKind.SERVICE_CENTRE, emirate="ABU_DHABI")
    c.session.add_all([centre, other])
    await c.session.flush()
    resident = await make_user(c, "resident@test.local", name="Rania Test")
    officer = await make_user(c, "officer@test.local", UserRole.OFFICER, centre, name="Officer One")
    outsider = await make_user(c, "outsider@test.local", UserRole.OFFICER, other, name="Officer Elsewhere")
    admin = await make_user(c, "admin@test.local", UserRole.ADMIN, name="Admin")
    await c.commit()
    return {"centre": centre, "resident": resident, "officer": officer, "outsider": outsider, "admin": admin}


def intake(**overrides) -> IntakeIn:
    data = dict(language="en", emirate="DUBAI", child_full_name_en="Test Baby", child_date_of_birth=date.today() - timedelta(days=3),
                place_of_birth="Latifa Hospital", child_nationality="Indian", father_full_name="Test Father", mother_full_name="Test Mother",
                father_emirates_id="784-1990-1234567-1", mother_emirates_id="784-1992-7654321-2", marriage_certificate_attested=True,
                consent_data_processing=True, consent_service_filing=True, consent_callback=True)
    data.update(overrides)
    return IntakeIn(**data)


async def open_case(infra, resident: User, **overrides):
    async with infra.sessionmaker() as session:
        c = ServiceContainer(session, infra=infra)
        user = await c.users_repo.get(resident.id)
        case, _ = await c.cases.create_from_intake(user, intake(**overrides), channel="WEB", actor=Actor.user(user))
        await c.commit()
        ref = case.reference
    await pump(infra)
    return ref


async def node_state(infra, ref: str, key: str) -> str:
    async with infra.sessionmaker() as session:
        c = ServiceContainer(session, infra=infra)
        case = await c.cases_repo.by_reference(ref)
        return (await c.nodes_repo.by_key(case.id, key)).state.value


async def run(infra, fn):
    """Run fn(c) in its own unit of work, commit, then settle the event pipeline."""
    async with infra.sessionmaker() as session:
        c = ServiceContainer(session, infra=infra)
        result = await fn(c)
        await c.commit()
    await pump(infra)
    return result


async def approve(infra, ref: str, key: str, officer_id):
    async def go(c):
        case = await c.cases_repo.by_reference(ref)
        node = await c.nodes_repo.by_key(case.id, key)
        approval = await c.approvals_repo.pending_for_node(node.id)
        officer = await c.users_repo.get(officer_id)
        return await c.approvals.approve(approval.id, officer)
    return await run(infra, go)


async def authority(infra, ref: str, key: str, status: str, missing=None):
    async def go(c):
        case = await c.cases_repo.by_reference(ref)
        node = await c.nodes_repo.by_key(case.id, key)
        return await c.entities.simulate(case, node, status, missing=missing)
    return await run(infra, go)


@pytest_asyncio.fixture
async def client(infra):
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


async def login(client: AsyncClient, email: str, password: str = PASSWORD) -> dict:
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['tokens']['access_token']}"}
