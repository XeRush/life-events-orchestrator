"""LifeLoop backend entrypoint (FastAPI)."""
from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.router import api_router, root_router
from app.core.config import get_settings
from app.core.errors import DomainError
from app.core.security import SecurityHeadersMiddleware
from app.db.session import get_sessionmaker
from app.observability import metrics
from app.observability.logging import bind_context, clear_context, configure_logging, get_logger
from app.observability.tracing import current_trace_id
from app.services.infra import build_infra, set_infra

log = get_logger("lifeloop.http")

DESCRIPTION = """
**LifeLoop - One call. One case. Every step after birth.**

Team Symphony's prototype for the *Ignyte x ElevenLabs Voice Agent Challenge* (Track 2, Government Services, use case 7:
Life-Event Service Orchestration). A voice agent runs the post-birth document chain for expatriate parents in Dubai:
birth certificate (DHA / MOHAP / DOH), MOFA attestation, the home-country consulate passport, residence visa
(GDRFA-Dubai / ICP), Emirates ID (ICP) and insurance (DHA eClaimLink).

* **AI prepares, officers release, authorities decide.** The agent never approves anything.
* **Government integrations are DEMO / MOCK** with realistic request/response contracts.
* **The consulate is parent-reported** - no API, no SLA, no status feed; LifeLoop never claims its status.
"""

TAGS = [
    {"name": "auth", "description": "Registration, login, refresh rotation, logout, email verification, password reset, invitations."},
    {"name": "users", "description": "Account provisioning (admin) and organisations."},
    {"name": "cases", "description": "Cases, the Life-Event Graph, timeline, documents, consent, opt-out, verification, SSE."},
    {"name": "agent", "description": "Voice calls, ElevenLabs server tools, post-call webhooks, TTS/STT, Agent Testing."},
    {"name": "officer", "description": "Officer dashboard: queues, the human approval gate, escalations, audit, analytics."},
    {"name": "entities", "description": "Mock government authorities and their integration contracts."},
    {"name": "demo", "description": "Demo control panel (DEMO_MODE only) - drives the real pipeline."},
    {"name": "health", "description": "Liveness, readiness (dependency fallbacks) and Prometheus metrics."},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_output, settings.log_json)
    if settings.run_migrations_on_startup:
        from app.db.migrate import run_migrations

        await run_migrations(settings.database_url)
    infra = build_infra(settings, get_sessionmaker())
    set_infra(infra)
    await infra.cache.start()
    await infra.neo4j.start()
    if settings.seed_on_startup:
        from app.seed.seed import run_seed

        try:
            await run_seed(infra)
        except Exception as exc:  # keep serving, but say why
            log.error("seed_on_startup_failed", error=f"{type(exc).__name__}: {exc}")
    await infra.broker.start()
    from app.workers.runner import WorkerRunner

    runner = WorkerRunner(infra)
    infra.workers = runner
    if settings.run_workers:
        await runner.start()
    log.info("startup_complete", environment=settings.environment, broker=infra.broker.mode, cache=infra.cache.mode,
             neo4j=infra.neo4j.mode, voice=infra.voice_status()["provider"], tracing=infra.tracer.backend)
    yield
    await runner.stop()
    await infra.stop()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="LifeLoop API", version="0.2.0", description=DESCRIPTION, lifespan=lifespan, openapi_tags=TAGS,
                  contact={"name": "Team Symphony"}, license_info={"name": "MIT"})
    app.add_middleware(SecurityHeadersMiddleware, production=settings.environment == "production")
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True,
                       allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
                       allow_headers=["Authorization", "Content-Type", "X-Request-ID"], expose_headers=["X-Request-ID", "X-Trace-ID"])

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = (request.headers.get("x-request-id") or uuid.uuid4().hex[:16])[:40]
        trace_id = uuid.uuid4().hex
        request.state.request_id = request_id
        clear_context()
        bind_context(request_id=request_id, trace_id=trace_id)
        token = current_trace_id.set(trace_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            current_trace_id.reset(token)
        duration = time.perf_counter() - started
        route = request.scope.get("route")
        path = getattr(route, "path", "unmatched")
        metrics.HTTP_REQUESTS.labels(request.method, path, str(response.status_code)).inc()
        metrics.HTTP_LATENCY.labels(request.method, path).observe(duration)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Trace-ID"] = trace_id
        if not path.endswith(("/health", "/stream", "/metrics", "/ringing")):
            log.info("request", method=request.method, operation=path, status=response.status_code, duration_ms=round(duration * 1000, 2))
        return response

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"error": {"code": exc.code, "message": exc.message, **({"details": exc.details} if exc.details else {})}})

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"error": {"code": "validation_error", "message": "Some fields are invalid.",
                                                                "details": [{"loc": [str(x) for x in e["loc"]], "msg": e["msg"]} for e in exc.errors()]}})

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"error": {"code": "http_error", "message": str(exc.detail)}})

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled_error", error_type=type(exc).__name__, error=str(exc)[:300])
        return JSONResponse(status_code=500, content={"error": {"code": "internal_error", "message": "Something went wrong. The request was not completed."}})

    app.include_router(api_router)
    app.include_router(root_router)

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {"name": "LifeLoop API", "docs": "/docs", "redoc": "/redoc", "health": "/health", "ready": "/ready", "metrics": "/metrics"}

    return app


app = create_app()
