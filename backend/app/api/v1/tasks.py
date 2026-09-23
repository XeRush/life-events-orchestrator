import uuid

from fastapi import APIRouter, Depends

from app.api.deps import get_container, get_current_user
from app.models.user import User
from app.schemas.cases import TaskOut
from app.services.container import ServiceContainer

router = APIRouter(tags=["tasks"])


@router.get("/tasks/{task_id}", response_model=TaskOut, summary="One service task")
async def get_task(task_id: uuid.UUID, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)):
    task = await c.orchestration.get_task(task_id)
    await c.cases.resolve(task.case_id, user)  # ownership check
    return task
