import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("BCRYPT_ROUNDS", "4")
os.environ.setdefault("CALLBACK_DELAY_SECONDS", "0")
os.environ.setdefault("ADAPTER_BACKOFF_SECONDS", "0")
os.environ.setdefault("DEMO_MODE", "true")
os.environ.setdefault("RUN_WORKERS", "false")
os.environ.setdefault("SEED_ON_START", "false")
os.environ.setdefault("ELEVENLABS_API_KEY", "")
os.environ.setdefault("ELEVENLABS_AGENT_ID", "")
os.environ.setdefault("STORAGE_DIR", "./.test-storage")

import logging  # noqa: E402

import pytest_asyncio  # noqa: E402
import structlog  # noqa: E402

structlog.configure(wrapper_class=structlog.make_filtering_bound_logger(logging.ERROR))
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.config import Settings, get_settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db import session as db_session  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.integrations.elevenlabs.callbacks import SimulatedCaller  # noqa: E402
from app.integrations.government import AdapterRegistry  # noqa: E402
from app.models import User  # noqa: E402
from app.models.enums import UserRole  # noqa: E402
from app.seed.seed_data import seed_entities, seed_workflows  # noqa: E402
from app.services.container import ServiceContainer  # noqa: E402


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    db_session.override_engine(eng)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session(engine):
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as s:
        entities = await seed_entities(s)
        await seed_workflows(s, entities)
        await s.commit()
        yield s


@pytest_asyncio.fixture
async def test_settings() -> Settings:
    return get_settings().model_copy(update={
        "callback_delay_seconds": 0.0, "adapter_backoff_seconds": 0.0, "bcrypt_rounds": 4,
        "elevenlabs_api_key": "", "elevenlabs_agent_id": "", "run_workers": False,
    })


@pytest_asyncio.fixture
async def resident(session: AsyncSession) -> User:
    user = User(email="resident@example.test", hashed_password=hash_password("pw-12345", 4), full_name="Test Resident",
                role=UserRole.RESIDENT)
    session.add(user)
    await session.commit()
    return user


@pytest_asyncio.fixture
async def container(session: AsyncSession, test_settings: Settings) -> ServiceContainer:
    return ServiceContainer(session, settings=test_settings, adapters=AdapterRegistry(), caller=SimulatedCaller())


@pytest_asyncio.fixture
async def client(engine, session):
    from httpx import ASGITransport, AsyncClient

    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
