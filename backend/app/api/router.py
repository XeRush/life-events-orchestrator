from fastapi import APIRouter

from app.api.v1 import agent, auth, cases, demo, entities, health, misc, officer, users

api_router = APIRouter(prefix="/api/v1")
for module in (health, auth, users, cases, entities, agent, officer, demo, misc):
    api_router.include_router(module.router)
api_router.include_router(cases.stream_router)

# Liveness / readiness / metrics are also served at the root for orchestrators and Prometheus.
root_router = APIRouter()
root_router.include_router(health.router)
