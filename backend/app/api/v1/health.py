from fastapi import APIRouter, Depends
from sqlalchemy import text

from app.api.deps import get_container
from app.services.container import ServiceContainer

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness probe")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "lifeloop-backend"}


@router.get("/health/ready", summary="Readiness probe (checks the database)")
async def ready(c: ServiceContainer = Depends(get_container)) -> dict[str, object]:
    await c.session.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ok", "voice_provider": c.voice.status()["provider"], "environment": c.settings.environment}
