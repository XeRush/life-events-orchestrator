from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import STAFF, get_container, require_roles
from app.core.errors import Forbidden
from app.models.enums import UserRole
from app.models.user import User
from app.services.container import ServiceContainer

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/actions", summary="Demo Control Center actions")
async def actions(_: User = Depends(require_roles(*STAFF)), c: ServiceContainer = Depends(get_container)) -> list[dict[str, str]]:
    if not c.settings.demo_mode:
        raise Forbidden("Demo mode is disabled")
    return c.demo.catalog()


@router.post("/cases/{case_id}/actions/{action}", summary="Perform a demo action",
             description="Runs the real mock-authority adapters and the real event pipeline (same as an authority webhook). "
                         "Nothing is simulated in the frontend.")
async def perform(case_id: str, action: str, user: User = Depends(require_roles(*STAFF)), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    if not c.settings.demo_mode:
        raise Forbidden("Demo mode is disabled")
    case = await c.cases.resolve(case_id, user)
    result = await c.demo.perform(case, action)
    await c.commit()
    return {"result": result, "snapshot": await c.cases.snapshot(case)}


@router.post("/reset", summary="Reset the demo case L-49281 to its seeded state")
async def reset(user: User = Depends(require_roles(UserRole.ADMIN)), c: ServiceContainer = Depends(get_container)) -> dict[str, str]:
    from app.seed.seed_data import run_seed

    if not c.settings.demo_mode:
        raise Forbidden("Demo mode is disabled")
    await run_seed(c.session, c.settings, reset_demo=True)
    return {"status": "reset", "case": "L-49281"}
