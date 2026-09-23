**Team Symphony**

# LIFELOOP

[![Python](https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![ElevenLabs](https://img.shields.io/badge/Voice-ElevenLabs-000000)](docs/elevenlabs.md)
[![uv](https://img.shields.io/badge/packaging-uv-DE5FE9)](https://docs.astral.sh/uv/)
[![Tests](https://img.shields.io/badge/tests-63%20passing-brightgreen)](docs/development.md)
[![Status](https://img.shields.io/badge/status-hackathon%20prototype-orange)](docs/judging.md)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)


**Navigate:** [Architecture](docs/architecture.md) | [API](docs/api.md) | [Workflow engine](docs/workflow-engine.md) | [Voice agent](docs/voice-agent.md) | [Demo script](docs/demo-script.md) | [For judges](docs/judging.md) | [All docs](docs/README.md) | [Team](#team-symphony)

> **One event. One call. Every next step.**

A voice-first **life-event case manager** (hackathon prototype · Track 2, Government Services). A resident reports a life event once ("My daughter was born yesterday."); LIFELOOP captures consent, creates a persistent case, builds a dependency graph of services, coordinates them with (mock) government entities, reacts to their events, replans, and calls the resident back **only when something meaningful changes**.

> **AI orchestrates. Government decides.** LIFELOOP never approves, rejects, determines eligibility or impersonates an officer. All authorities here are **mock government entities**; government-authorized integrations would be required for production.

## Problem

Major life events trigger obligations across many departments. Residents become the integration layer: repeating their story, tracking applications, guessing what unlocks what.

## Solution

Government services are transaction-oriented; **LIFELOOP is life-event-oriented.** Resident -> Life event -> LIFELOOP manages the dependency graph -> authorities execute their own responsibilities -> LIFELOOP propagates state -> the resident receives only meaningful updates. Details for judges: [docs/judging.md](docs/judging.md).

## Architecture

FastAPI modular monolith (workflow engine, PostgreSQL-backed event bus, callback engine, government adapters, ElevenLabs integration) + PostgreSQL + React SPA. Diagram and rationale: [docs/architecture.md](docs/architecture.md).

## Features

- Voice → consent → **persistent Life Event Case** → workflow → dependency graph → tasks → entities → events → replanning → callbacks → timeline → dashboard.
- Real dependency graph from persisted workflow data (parallel branches, blocked dependants).
- Explicit task **state machine**, idempotent submissions and events, full **audit log**.
- **Dependency-aware replanning**: delay (silent), retry, permitted alternative path, resident action, human escalation.
- **Proactive callback engine** with a notification policy and coalescing.
- **Zero-repetition Life Event Passport** and a **digital life timeline**.
- **ElevenLabs** voice layer: agent definition/sync, 15 backend tools, signed-URL browser sessions, outbound callbacks, HMAC webhooks; simulated channel when no keys.
- Mock authorities with their own store, catalogs and webhook simulation; **Demo Control Center** driving the real event pipeline.
- Live UI via SSE (+ polling fallback), EN/AR i18n with RTL, reduced-motion support.

## Technology

Design rationale: [docs/decisions.md](docs/decisions.md). Security posture: [docs/security.md](docs/security.md).

Backend: Python, FastAPI, Uvicorn, SQLAlchemy 2 (async), Alembic, PostgreSQL, Pydantic v2, structlog, PyJWT, bcrypt, httpx, **uv**, pytest.
Frontend: React, TypeScript, Vite, Tailwind CSS v4, Framer Motion, GSAP, Lenis, Lucide, React Router, TanStack Query, Zustand.

## Project structure

```
backend/   app/ (api, services, agents, events, integrations, models, schemas, workers, seed) · alembic/ · tests/ · Dockerfile · pyproject.toml · uv.lock
frontend/  src/ (app, components, pages, hooks, services, stores, i18n, animations, utils, styles) · Dockerfile
docs/      architecture, api, database, workflow-engine, event-model, elevenlabs, voice-agent, demo-script, judging, ...
scripts/   seed.sh · reset.sh · demo.sh
docker-compose.yml · Makefile · .env.example
```

## Quick start

### Docker (one command)

```bash
cp .env.example .env     # optional
docker compose up --build   # or: make up
```

Frontend http://localhost:5173 · Backend http://localhost:8000 · Swagger http://localhost:8000/docs · PostgreSQL localhost:5432.
Migrations and the idempotent seed run automatically. `make demo` also prints the demo scenario.

### Local development

```bash
docker compose up -d postgres        # or any PostgreSQL 16 on :5432
cd backend && uv sync
uv run alembic upgrade head          # make migrate
uv run python -m app.seed.seed_data  # make seed (idempotent)
uv run uvicorn app.main:app --reload
cd ../frontend && npm install && npm run dev
```

Demo login: `demo@lifeloop.example` / `demo1234` (seeded case **L-49281**).

> Tests run on in-memory SQLite and need no Docker: `cd backend && uv run pytest` (63 tests, including the full birth journey).
> Note: the Docker path was not exercised in the final build environment; if it misbehaves see [docs/troubleshooting.md](docs/troubleshooting.md).

## Environment variables

Deployment notes: [docs/deployment.md](docs/deployment.md).

See [.env.example](.env.example): `DATABASE_URL`, `JWT_SECRET`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `REDIS_URL` (optional), plus `ELEVENLABS_PHONE_NUMBER_ID`, `ELEVENLABS_WEBHOOK_SECRET`, `VOICE_TOOL_SECRET`, `PUBLIC_BASE_URL`, `DEMO_MODE`.

## ElevenLabs setup

Without keys the Voice center runs the backend dialog engine (same tools, same behaviour). For live voice: set `ELEVENLABS_API_KEY`, expose the backend over HTTPS (`PUBLIC_BASE_URL`), call `POST /api/v1/voice/agent/sync` as admin, put the returned id in `ELEVENLABS_AGENT_ID`. Full guide: [docs/elevenlabs.md](docs/elevenlabs.md).

## Demo

`make demo` and follow [docs/demo-script.md](docs/demo-script.md) (3–5 minutes): report a birth, consent, complete registration/certificate, delay identity (no call), require a document (call), "I don't have it right now" (case stays open), submit, approve, "Where are we?", case completes.

## Testing

Guide: [docs/development.md](docs/development.md).

`make test` - state machine, dependencies, replanning, callbacks/policy, idempotency, consent, adapter resilience, API/auth, voice tools and ElevenLabs client, webhooks, seed, and the end-to-end critical scenario.

## API documentation

Swagger `/docs`, ReDoc `/redoc`, reference in [docs/api.md](docs/api.md).

## Screenshots

_Placeholder: add screenshots of the landing page, dashboard, life-event graph, timeline, voice center and demo control here._

## Future roadmap

More life events and authorities, real government APIs, UAE Pass / digital identity, SMS and WhatsApp, human-operator handoff, government-side dashboards, analytics, rules engine and policy knowledge base, Kafka/Redis event bus, more languages.

## Documentation

| Topic | Document |
|---|---|
| Index of all docs | [docs/README.md](docs/README.md) |
| Architecture (Mermaid) | [docs/architecture.md](docs/architecture.md) |
| System design and failure model | [docs/system-design.md](docs/system-design.md) |
| API reference | [docs/api.md](docs/api.md) |
| Database and migrations | [docs/database.md](docs/database.md) |
| Workflow engine and replanning | [docs/workflow-engine.md](docs/workflow-engine.md) |
| Event model and notification policy | [docs/event-model.md](docs/event-model.md) |
| ElevenLabs integration | [docs/elevenlabs.md](docs/elevenlabs.md) |
| Voice agent behaviour and safety | [docs/voice-agent.md](docs/voice-agent.md) |
| Government integrations (mock) | [docs/government-integrations.md](docs/government-integrations.md) |
| Security | [docs/security.md](docs/security.md) |
| Deployment | [docs/deployment.md](docs/deployment.md) |
| Development guide | [docs/development.md](docs/development.md) |
| Demo script | [docs/demo-script.md](docs/demo-script.md) |
| For judges | [docs/judging.md](docs/judging.md) |
| Decision log | [docs/decisions.md](docs/decisions.md) |
| Troubleshooting | [docs/troubleshooting.md](docs/troubleshooting.md) |

## Team Symphony

| Member | GitHub |
|---|---|
| Madhur Prakash Mangal | [Madhur-Prakash](https://github.com/Madhur-Prakash) |
| Bhanvi Nayer | [bhanvinayer](https://github.com/bhanvinayer) |
| Archit Nirula | [XeRush](https://github.com/XeRush) |
| Saisha Goel | [saishagoel27](https://github.com/saishagoel27) |

---

Built with ❤️ for Future of Voice AI Challenge
