from typing import Any

from fastapi import APIRouter, Depends

from app.api.deps import get_container, get_current_user
from app.models.user import User
from app.services.container import ServiceContainer
from app.services.dashboard_service import DashboardService

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard/stats", summary="Dashboard: active cases, completion, waiting, callbacks, recent timeline")
async def dashboard_stats(user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return await DashboardService(c).stats(user)
