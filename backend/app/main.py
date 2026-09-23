"""LIFELOOP backend entrypoint."""
import time
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router, mock_router
from app.core.config import get_settings
from app.core.errors import DomainError
from app.core.logging import configure_logging, get_logger
from app.core.security import SecurityHeadersMiddleware

log = get_logger("lifeloop.http")

DESCRIPTION = """
**LIFELOOP - One event. One call. Every next step.**

A voice-first life-event case manager (hackathon prototype). A resident reports a life event once; LIFELOOP creates a
persistent case, builds a dependency graph of services, coordinates them with (mock) government entities, reacts to
their events, replans, and proactively calls the resident only when something meaningful changes.

**AI orchestrates. Government decides.** The platform never approves, rejects or determines eligibility.
All authorities here are *mock government entities* for demonstration.
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(settings.debug, json_logs=settings.environment != "development")
    from app.workers.runner import WorkerRunner

    if settings.seed_on_start:
        from app.db.session import session_scope
        from app.seed.seed_data import run_seed

        try:
            async with session_scope() as session:
                await run_seed(session, settings)
        except Exception as exc:  # e.g. migrations not applied yet - keep serving, but say why
            log.error("seed_on_start_failed", error=str(exc))
    runner = WorkerRunner(settings)
    if settings.run_workers:
        await runner.start()
    yield
    await runner.stop()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="LIFELOOP API", version="0.1.0", description=DESCRIPTION, lifespan=lifespan,
        openapi_tags=[
            {"name": "auth", "description": "JWT register / login / refresh / logout."},
            {"name": "cases", "description": "Life Event Cases, graph, passport."},
            {"name": "voice", "description": "ElevenLabs voice sessions, webhook and agent tools."},
            {"name": "mock-entities", "description": "Mock government authority APIs and event simulation."},
            {"name": "demo", "description": "Demo Control Center (real events, no frontend fakery)."},
        ],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware, allow_origins=settings.cors_origin_list, allow_credentials=True,
        allow_methods=["*"], allow_headers=["*"], expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)
        started = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        if not request.url.path.endswith(("/health", "/stream")):
            log.info("request", method=request.method, path=request.url.path, status=response.status_code,
                     duration_ms=round((time.perf_counter() - started) * 1000, 2))
        return response

    @app.exception_handler(DomainError)
    async def domain_error_handler(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"error": {"code": exc.code, "message": exc.message}})

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"error": {"code": "validation_error", "message": "Invalid request", "details": [
            {"loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors()]}})

    app.include_router(api_router)
    app.include_router(mock_router)

    @app.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {"name": "LIFELOOP API", "docs": "/docs", "redoc": "/redoc", "health": "/api/v1/health"}

    return app


app = create_app()
