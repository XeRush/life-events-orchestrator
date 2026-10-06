"""`python -m app.seed` - idempotent seed (reference data, demo users, demo cases). Safe to run repeatedly."""
import asyncio

from app.core.config import get_settings
from app.db.session import get_sessionmaker
from app.observability.logging import configure_logging
from app.seed.seed import run_seed
from app.services.infra import build_infra, set_infra


async def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_output, settings.log_json)
    infra = build_infra(settings, get_sessionmaker())
    set_infra(infra)
    await infra.cache.start()
    await infra.neo4j.start()
    try:
        result = await run_seed(infra)
        print(f"Seed complete (idempotent): {result}")
    finally:
        await infra.drain_background()
        await infra.cache.stop()
        await infra.neo4j.stop()


if __name__ == "__main__":
    asyncio.run(main())
