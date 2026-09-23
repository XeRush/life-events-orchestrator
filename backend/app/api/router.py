from fastapi import APIRouter

from app.api.v1 import (
    auth,
    callbacks,
    cases,
    consent,
    dashboard,
    demo,
    documents,
    events,
    health,
    mock_entities,
    tasks,
    timeline,
    voice,
)

api_router = APIRouter(prefix="/api/v1")
for module in (health, auth, cases, consent, tasks, timeline, events, callbacks, documents, voice, dashboard, demo):
    api_router.include_router(module.router)
api_router.include_router(mock_entities.ops_router)

# Mock authority APIs live outside /api/v1: they stand in for systems LIFELOOP does not own.
mock_router = mock_entities.router
