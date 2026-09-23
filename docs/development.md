# Development

## Prerequisites

Python 3.11+, [uv](https://docs.astral.sh/uv/), Node 20+ (22 recommended), Docker (for PostgreSQL), GNU Make (optional; every target is a one-liner you can run by hand).

## Everyday commands

```bash
make install     # uv sync + npm install
make dev         # PostgreSQL in Docker, migrate + seed, backend (reload) + frontend (HMR)
make test        # backend tests (pytest)
make lint        # ruff + tsc
make format      # ruff format
make migration m="add something"
```

Without make:

```bash
docker compose up -d postgres
cd backend && uv sync
uv run alembic upgrade head && uv run python -m app.seed.seed_data
uv run uvicorn app.main:app --reload            # http://localhost:8000
cd ../frontend && npm install && npm run dev    # http://localhost:5173 (proxies /api to :8000)
```

## Backend layout

```
app/
  api/            routes only (no business logic); deps = DI, auth, RBAC, rate limit
  services/       domain logic; container.py wires them per request
  agents/         life_event_agent (dialog + scripts), tools (voice tools), journey_planner, exception_agent
  events/         bus (port + Postgres impl), handlers (reactions), publisher, consumers, stream (SSE hub)
  integrations/   elevenlabs/, government/
  models/         SQLAlchemy models   schemas/  Pydantic DTOs   db/  session + base
  workers/        callbacks, orchestration (outbox + retries), simulation (autopilot)
  seed/           definitions + idempotent seed
```

Conventions: services take a `ServiceContainer`; mutate state through `OrchestrationService.transition` only; publish events instead of calling downstream services directly; endpoints call `await c.commit()` once at the end (it drains handlers, commits, then notifies SSE).

## Tests

`cd backend && uv run pytest` runs against in-memory SQLite (aiosqlite) - fast, no Docker required. Covered: state machine, dependencies and graph, replanning (delay / retry / alternative / escalation / requeue), callbacks and notification policy, idempotency, consent, adapter resilience, full API and auth lifecycle, voice tools/dialog/ElevenLabs client (mock transport), webhook signatures, seed idempotency, and the **critical end-to-end scenario** (`tests/test_critical_scenario.py`): birth reported -> consent -> case -> tasks -> registration -> certificate -> identity requires document -> callback -> document -> identity resumes -> identity completes -> next service -> case completes.

## Adding a life event

1. Add a definition in `seed/definitions.py` (nodes + dependencies) and set `configured: True` only when adapters exist.
2. Add adapters + catalog entries for the services (`integrations/government`).
3. Add timeline wording via `started_label` / `completed_label` in node config.
4. Extend `journey_planner._KEYWORDS` for voice detection.

## Frontend

React + TypeScript + Vite + Tailwind v4 (design tokens in `src/styles/index.css`), Framer Motion (page/UI motion), GSAP (hero graph, node connections, timeline, graph transitions), Lenis (smooth scroll), TanStack Query (server state), Zustand (session/UI only). `src/services` is the single API layer; `src/hooks/queries.ts` holds all queries; live updates via `useLiveEvents` (SSE). Translations: `src/i18n` (en, ar; RTL handled at `<html dir>`). `prefers-reduced-motion` disables GSAP/Lenis/CSS animation.
