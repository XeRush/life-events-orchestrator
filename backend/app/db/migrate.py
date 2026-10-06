"""Run Alembic migrations from the application (RUN_MIGRATIONS_ON_STARTUP).

Several replicas may start at once, so on PostgreSQL the upgrade runs under an advisory lock: the first replica
migrates, the others wait and then find nothing to do. The schema is only ever changed by Alembic revisions.
"""
from __future__ import annotations

import asyncio
from pathlib import Path

from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import command
from app.observability.logging import get_logger

log = get_logger("lifeloop.migrate")
BACKEND_DIR = Path(__file__).resolve().parents[2]
LOCK_ID = 727_001_2026


def alembic_config(database_url: str) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.attributes["database_url"] = database_url
    return cfg


def _upgrade(database_url: str) -> None:
    command.upgrade(alembic_config(database_url), "head")


async def run_migrations(database_url: str) -> None:
    if database_url.startswith("postgresql"):
        engine = create_async_engine(database_url)
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT pg_advisory_lock(:id)"), {"id": LOCK_ID})
                try:
                    await asyncio.to_thread(_upgrade, database_url)
                finally:
                    await conn.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": LOCK_ID})
        finally:
            await engine.dispose()
    else:
        await asyncio.to_thread(_upgrade, database_url)
    log.info("migrations_applied", target="head")
