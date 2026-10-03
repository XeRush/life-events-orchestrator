# LifeLoop

**Your life-event case, coordinated.** One call after a birth opens one case, and LifeLoop coordinates the six
UAE entities that follow, so an expatriate family no longer walks the chain alone.

[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.141-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![ElevenLabs](https://img.shields.io/badge/Voice-ElevenLabs-000000)](docs/integrations/elevenlabs.md)
[![uv](https://img.shields.io/badge/packaging-uv-DE5FE9)](https://docs.astral.sh/uv/)
[![Status](https://img.shields.io/badge/status-prototype-orange)](SECURITY.md)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Built by **Team Symphony** for the **Ignyte × ElevenLabs Voice Agent Challenge**: Track 2 Government Services, use
case 7 Life-Event Service Orchestration. Target market: Dubai, UAE. Primary user: expatriate parents after the birth
of a child.

> **This is a working prototype, not a government service.** Every government integration is a **DEMO / MOCK**
> adapter with a realistic request/response contract; no real UAE government system is connected. UAE Pass is
> simulated. LifeLoop never invents government status: the agent prepares, an Amer officer releases, and each
> authority decides.

**Navigate:** [Documentation](docs/README.md) · [Architecture](docs/architecture/overview.md) ·
[Voice agent](docs/agent/overview.md) · [API](docs/api/overview.md) · [Demo script](docs/demo/demo-script.md) ·
[For evaluators](docs/demo/evaluator-walkthrough.md) · [Security](SECURITY.md)

## Problem

Mabrouk Ma Yak collapses the Emirati newborn journey into one form across six federal entities. Expatriates, 88.5% of
residents, sit outside it. After the hospital files the birth notification, the parent walks the chain alone: birth
certificate from DHA, MOHAP or DOH; MOFA attestation; a passport from their own consulate, which no UAE system can
reach; residence visa at GDRFA or ICP; Emirates ID; then the insurer. It breaks at the consulate: nobody tells the
parent when that step clears, so the visa file sits unopened. The clock is 120 days; past it, AED 25-100 per day and
the child cannot leave the country. (Idea Canvas box C.)

| Today's baseline (canvas box D) | Value | Target (canvas box M) |
|---|---|---|
| Entities a family must contact and track itself after one birth | **6** | **1**: the agent (the consulate appointment stays with the family) |
| Separate visits or portal sessions, birth → Emirates ID | **7** | **2**: the consulate appointment and ICP biometrics |
| Times the same parent and child details are re-entered | **6** | **1**: captured once on call one |

## Solution

An agent that runs the post-birth document chain for expatriate parents, so that six UAE entities are coordinated
from one call, not seven visits (canvas box B).

1. **One call.** A fixed disclosure, then the agent captures the child's and parents' details once, checks the
   attested marriage certificate, and records consent to file and to call back.
2. **One case, six nodes.** LifeLoop builds a Life-Event Graph: birth certificate → MOFA attestation → consulate
   passport → residence visa → Emirates ID → insurance, routed to the right authority for the emirate.
3. **Officer-released filings.** The orchestrator prepares each filing when its dependency clears; an Amer officer
   reviews the minimised fields and releases it; the (mock) authority processes it.
4. **Callbacks on change.** LifeLoop calls the parent when a step is cleared, blocked, missing a document or stalled,
   only with a consent token, never after "stop calling".
5. **Parent-reported consulate.** No API, no SLA, no status feed: LifeLoop asks, records the answer as
   parent-reported, and re-plans the visa the moment the passport is issued.
6. **Human handover.** Distress, an approval question, a disputed record, two failed verifications or a stall past
   SLA goes to a named Amer officer.

## Architecture

```mermaid
flowchart LR
  P["Parent"] -->|"● voice"| CH["Twilio / SIP or<br/>web voice console"]
  CH -->|"● audio"| EL["ElevenLabs<br/>Scribe v2 → workflow router →<br/>Intake / Status / Exception → Eleven v3"]
  EL -->|"● scoped server tools"| API["LifeLoop backend<br/>FastAPI"]
  EL -.->|"● post-call webhook"| API
  API --> OB[("PostgreSQL<br/>+ transactional outbox")]
  OB --> K[["Kafka"]]
  K --> OR["Case orchestrator<br/>LangGraph, deterministic"]
  OR --> G["Human gate<br/>Amer officer releases"]
  G -->|"● minimised fields"| GOV["Authority adapters<br/>DEMO / MOCK"]
  K --> CB["Callback engine<br/>consent + opt-out"]
  CB -->|"● call or SMS"| P
```

● marks a boundary where personal data crosses. Full diagram with every arrow labelled:
[System architecture](docs/architecture/system-architecture.md).

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI 0.141, Uvicorn 0.53, SQLAlchemy 2 (async) + asyncpg, Pydantic v2 + pydantic-settings, Alembic |
| Data | PostgreSQL 16 (source of truth), Redis 7 (cache), Neo4j 5 (optional graph projection) |
| Events | Kafka (apache/kafka, KRaft, no ZooKeeper) via aiokafka, transactional outbox, idempotent consumers |
| Agent | ElevenLabs Agents Platform (workflows, sub-agents, Eleven v3 TTS, Scribe v2 STT, knowledge base + RAG, server tools, post-call webhooks, Agent Testing), LangGraph |
| Auth and security | PyJWT, bcrypt, httpx, python-multipart |
| Observability | structlog with Logifyx as the sink (JSON lines, masking), Langfuse (v4 SDK), Prometheus client |
| Frontend | React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4, React Router 7, TanStack Query 5, Zustand 5, Framer Motion 13, GSAP 3.15, Lenis 1.3, boneyard-js skeletons, Lucide React, `@elevenlabs/client`; light and dark themes; own i18n (en, ar, hi, ur, ml, tl; RTL for ar and ur); no component library |
| Tooling | uv (Python, never pip or poetry), npm, Docker Compose, Make |

## Features

- **Voice intake** in six languages, with a fixed, non-skippable disclosure as the first turn of every call.
- **Life-Event Graph** of six nodes with a validated state machine, emirate routing (DHA / MOHAP / DOH, GDRFA / ICP),
  SLAs and fees with their sources, and the 120-day deadline on every case.
- **Human approval gate**: officers review minimised fields and Approve and Release, Reject, or Request documents.
- **Scoped agent tools** (18), authenticated and bound to one call, one resident and one case. No approval tool.
- **Callback engine** with consent tokens, opt-out, coalescing, ring timeout and SMS fallback.
- **Phone line**: calls to the life-event number are bound to a LifeLoop call through the ElevenLabs
  conversation-initiation webhook (resident matched by caller ID; first-time callers can open a case by voice).
- **Verification without secrets** on callbacks and phone calls: UAE Pass one-tap (simulated) or two facts from the
  case file.
- **Officer dashboard**: queues, case detail with transcripts and audit, escalations, callbacks, analytics with the
  canvas KPIs.
- **Event-driven core**: transactional outbox, Kafka topics, idempotent consumers, dead-lettering, Kafka-down
  fallback.
- **Graceful degradation**: every dependency except PostgreSQL has a fallback, reported live at `/ready`.
- **Privacy by design**: Emirates IDs hashed and tokenised, passport numbers never stored, redaction in
  transcripts, events, logs and traces.
- **Agent Testing**: ten guardrail scenarios, including live refusals, plus seven ElevenLabs test definitions that
  `POST /api/v1/agent/testing/sync` creates and runs in the workspace.
- **Six languages** end to end: every spoken phrase, step name and language name in English, Arabic, Hindi, Urdu,
  Malayalam and Tagalog.
- **Demo control panel** (visually separate) that drives the real pipeline and simulates failures.
- **Accounts**: resident registration with email verification, lockout, rotating refresh tokens, password reset,
  admin-provisioned officers by invitation, organisation-scoped access.

## Voice architecture

One multilingual agent with a state router and three sub-agents (Intake, Status, Exception). With ElevenLabs
credentials, the browser opens an ElevenLabs session from a server-issued signed URL, the agent calls LifeLoop's
server tools (shared secret + call binding), and the post-call webhook (HMAC, replay window, idempotent) writes the
transcript, consent evidence and extracted fields to the case. Calls to the life-event number are bound by the
conversation-initiation webhook (caller ID, disclosure first, caller unverified until UAE Pass or two facts), and
phone callbacks carry the LifeLoop call id so the tools bind. Without credentials, a LangGraph conversation graph runs
the same flow with the same tools, phrasebook and guardrails. The agent definition is generated from code:
`POST /api/v1/agent/sync?dry_run=true`.

Read more: [Agent overview](docs/agent/overview.md) · [Call flow](docs/agent/call-flow.md) ·
[Sub-agents](docs/agent/sub-agents.md) · [Tools](docs/agent/tools.md) · [ElevenLabs](docs/integrations/elevenlabs.md)

## Life-Event Graph

| # | Service | Authority | Filed by LifeLoop | Parent attends |
|---|---|---|---|---|
| 1 | Birth certificate | DHA (Dubai), DOH (Abu Dhabi), MOHAP (other emirates) | yes, after officer release | no |
| 2 | MOFA attestation | MOFA | yes, after officer release | no |
| 3 | Consulate passport | Home-country consulate | **no**: parent-reported | consulate appointment |
| 4 | Residence visa | GDRFA-Dubai (via Amer) or ICP | yes, after officer release | no |
| 5 | Emirates ID | ICP | yes, after officer release | ICP biometrics |
| 6 | Insurance endorsement | Insurer via DHA eClaimLink | yes, after officer release | no |

States, transitions, SLAs and the orchestrator: [Life-Event Graph](docs/architecture/life-event-graph.md).

## Security

The agent cannot approve anything; every filing needs an officer of the case's service centre; callbacks need a
consent token; "stop calling" works at any turn; tool calls and webhooks are authenticated; personal data is
minimised at every boundary. See [SECURITY.md](SECURITY.md), the [threat model](docs/security/threat-model.md) and
[PII handling](docs/security/pii-handling.md).

## Local setup

Prerequisites: Python 3.12, [uv](https://docs.astral.sh/uv/), Node.js 22, Docker Desktop.

```bash
cp .env.example .env    # points the backend at the Compose data services on localhost
make install            # uv sync (backend) + npm ci (frontend)
make dev                # postgres, redis, kafka, neo4j in Docker; backend (migrates + seeds on start-up) and frontend with reload
```

PostgreSQL is required; SQLite is not supported for running the app (only the tests use it). Windows: use Git Bash
or WSL for `make`, or the [PowerShell equivalents](docs/deployment/local-development.md#powershell-equivalents).
Full guide: [Local development](docs/deployment/local-development.md).

## Docker setup

```bash
make demo        # creates .env if missing, docker compose up --build -d, wait for /ready, migrate, seed, print URLs and credentials
make health      # readiness of every dependency
```

PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build -d
Invoke-RestMethod http://localhost:8000/ready     # repeat until it answers; migrations and seed run on start-up
```

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:8000` |
| Swagger / ReDoc | `http://localhost:8000/docs`, `http://localhost:8000/redoc` |
| Health / readiness / metrics | `/health`, `/ready`, `/metrics` |
| Neo4j browser | `http://localhost:7474` |

The Compose project `lifeloop` runs postgres (16), redis (7), kafka (`apache/kafka:3.9.1`, KRaft, no ZooKeeper),
neo4j (5 community), backend and frontend, each with a health check and named volumes for data. If another project
already uses a port, change `FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`, `REDIS_PORT`, `KAFKA_PORT`,
`NEO4J_HTTP_PORT` or `NEO4J_BOLT_PORT` in `.env`. Details: [Docker](docs/deployment/docker.md).

## Environment variables

Every backend setting is an upper-case environment variable named after its field in
[`backend/app/core/config.py`](backend/app/core/config.py). The backend reads `.env` from `backend/` or the
repository root.

### Core and startup

| Variable | Default | Purpose |
|---|---|---|
| `ENVIRONMENT` | `development` | `development`, `test`, `staging` or `production` (production enables fail-closed checks) |
| `DATABASE_URL` | `postgresql+asyncpg://lifeloop:lifeloop@localhost:5432/lifeloop` | PostgreSQL (asyncpg) |
| `RUN_MIGRATIONS_ON_STARTUP` | `true` | `alembic upgrade head` under a PostgreSQL advisory lock |
| `SEED_ON_STARTUP` | `true` | Idempotent seed: if data exists leave it, otherwise create it |
| `SEED_DEMO_DATA` | `true` | Build the demo cases during the seed |
| `RUN_WORKERS` | `true` | Run relay, consumer, callback, entity-poll and SLA workers in-process |
| `DEMO_MODE` | `true` | Enables the demo control panel API |
| `DEMO_USER_PASSWORD` | empty | Password for the demo accounts (`.env.example`: `LifeLoop-Demo-2026`); if unset in development a random one is printed once |
| `LOG_LEVEL` | `INFO` | Log level |
| `LOG_OUTPUT` / `LOG_JSON` | `console` / `true` | Log sink (`console`, `file`, `both`, `none`) and JSON lines |

### Security, web and auth

| Variable | Default | Purpose |
|---|---|---|
| `JWT_SECRET` | development value | JWT signing key; at least 32 random characters in production (start-up fails otherwise) |
| `PII_HASH_KEY` | empty | Key for the keyed hash of Emirates IDs, separate from `JWT_SECRET`; at least 32 characters in production (start-up fails otherwise); falls back to `JWT_SECRET` outside production when unset |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed browser origins |
| `PUBLIC_BASE_URL` | `http://localhost:8000` | Backend URL as ElevenLabs sees it (tool URLs) |
| `FRONTEND_URL` | `http://localhost:5173` | Base for links in emails |
| `ACCESS_TOKEN_MINUTES` / `REFRESH_TOKEN_DAYS` | `30` / `7` | Token lifetimes |
| `MAX_FAILED_LOGINS` / `LOCKOUT_MINUTES` | `5` / `15` | Login lockout |
| `REQUIRE_EMAIL_VERIFICATION` | `true` | Residents must confirm their email before opening a case on the web (voice callers are identified by session or phone and verification) |
| `RATE_LIMIT_PER_MINUTE` / `AUTH_RATE_LIMIT_PER_MINUTE` | `300` / `20` | Rate limits |

### Email (Gmail API)

| Variable | Example | Purpose |
|---|---|---|
| `GMAIL_CREDENTIALS_B64` | base64 string | Base64 of the pickled OAuth credential with the `gmail.send` scope, minted by [`backend/scripts/mint_gmail_token.py`](backend/scripts/mint_gmail_token.py) (`cd backend && uv sync --group dev && uv run python scripts/mint_gmail_token.py path/to/credentials.json`) |
| `GMAIL_SENDER` | `synfin.no.reply@gmail.com` | Sending mailbox |
| `EMAIL_FROM_NAME` | `LifeLoop` | Display name |

Without them, the console transport is used and, in development, `GET /api/v1/dev/mailbox?email=` shows verification,
reset and invitation links.

### Voice and telephony

| Variable | Default | Purpose |
|---|---|---|
| `ELEVENLABS_API_KEY` | empty | Server-side key; with the agent id, switches voice from simulated to ElevenLabs |
| `ELEVENLABS_AGENT_ID` | empty | The ElevenLabs agent (create it with `POST /api/v1/agent/sync?dry_run=false`) |
| `ELEVENLABS_PHONE_NUMBER_ID` | empty | Twilio number imported in ElevenLabs, for real outbound callbacks (the inbound line is configured in the ElevenLabs workspace) |
| `ELEVENLABS_VOICE_ID` | empty | Agent voice and web-console TTS voice |
| `ELEVENLABS_WEBHOOK_SECRET` | empty | Post-call webhook HMAC secret (required in production) |
| `ELEVENLABS_TTS_MODEL` / `ELEVENLABS_STT_MODEL` | `eleven_v3` / `scribe_v2` | Models |
| `VOICE_TOOL_SECRET` | `dev-voice-tool-secret` | Shared secret (`X-LifeLoop-Tool-Secret`) for server tools and the conversation-initiation webhook (must be changed in production) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | empty | SMS via Twilio; otherwise mock SMS |

### Data services and observability

| Variable | Default | Purpose |
|---|---|---|
| `KAFKA_BOOTSTRAP_SERVERS` | empty | Kafka brokers; empty means the in-memory broker |
| `KAFKA_CLIENT_ID` / `KAFKA_CONSUMER_GROUP` | `lifeloop-backend` / `lifeloop-workers` | Kafka client settings |
| `REDIS_URL` | empty | Redis; empty means the in-process cache |
| `NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD` | empty / `neo4j` / empty | Optional graph projection |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | empty | Langfuse tracing; otherwise local spans |
| `LANGFUSE_HOST` | `https://cloud.langfuse.com` | Langfuse endpoint |

Defaults above are those of `config.py`. `.env.example` sets `REDIS_URL`, `KAFKA_BOOTSTRAP_SERVERS` and `NEO4J_URI` to
the Compose services on localhost for host runs; inside Compose the backend container gets in-network addresses
(`redis:6379`, `kafka:19092`, `neo4j:7687`).

### Docker Compose

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD` | `lifeloop` | Password of the `lifeloop` PostgreSQL user (also used in the backend's in-network `DATABASE_URL`) |
| `NEO4J_PASSWORD` | `lifeloop-neo4j` | Neo4j server password and the backend's Neo4j credential |

Host ports:

| Variable | Default |
|---|---|
| `FRONTEND_PORT` | 5173 |
| `BACKEND_PORT` | 8000 |
| `POSTGRES_PORT` | 5432 |
| `REDIS_PORT` | 6379 |
| `KAFKA_PORT` | 9092 |
| `NEO4J_HTTP_PORT` | 7474 |
| `NEO4J_BOLT_PORT` | 7687 |

Orchestration tuning (`LEGAL_DEADLINE_DAYS`, `CALLBACK_COALESCE_SECONDS`, `CALLBACK_RING_TIMEOUT_SECONDS`,
`ENTITY_POLL_SECONDS`, `SLA_CHECK_SECONDS`, `CONSULATE_STALL_DAYS`, `ADAPTER_*`, `CONSUMER_MAX_ATTEMPTS`,
`STORAGE_DIR`, `MAX_UPLOAD_MB`, ...) is listed in `config.py` and explained on the relevant documentation pages.

## Demo credentials

| Email | Role |
|---|---|
| `demo.resident@lifeloop.local` | Resident (owns `LL-DEMO-001`; its callbacks ring in this account's app) |
| `demo.officer@lifeloop.local` | Officer: Mariam Al Ali, Amer Officer, Amer Centre - Al Barsha |
| `demo.admin@lifeloop.local` | Administrator |

Password: the value of `DEMO_USER_PASSWORD` in `.env` (`.env.example` ships `LifeLoop-Demo-2026`). Also seeded:
`khalid.officer@lifeloop.local`, an officer whose invitation is pending (a transfer target).

Seeded cases, built by running the real pipeline on a backdated clock:

| Case | Situation |
|---|---|
| `LL-DEMO-001` | Dubai, Indian, English: birth certificate CLEARED, MOFA CLEARED, consulate COMPLETED (parent-reported), visa PROCESSING, Emirates ID and insurance PENDING |
| `LL-DEMO-002` | Sharjah (MOHAP), Tagalog: marriage certificate not attested, birth certificate DOCUMENT_MISSING |
| `LL-DEMO-003` | Dubai, Urdu: birth certificate awaiting officer release, open APPROVAL_QUESTION escalation |

## Demo workflow

1. Register a new resident (the demo resident already has an active case, so a call would go straight to status),
   start a call at `/app/voice`, choose English or Arabic: the disclosure comes first.
2. Report the birth and answer the intake questions; give consent.
3. See the six-node graph; release and clear the birth certificate and MOFA from the demo panel (`/demo`).
4. Answer the callback, verify with UAE Pass (simulated), report "the passport is ready" (parent-reported).
5. As the officer, review and Approve and Release the residence visa; block it from the demo panel; answer the
   blocked-node callback; say "stop calling".
6. Ask "will the visa be approved?": the agent hands over to a named Amer officer.

Full timed script: [Demo script](docs/demo/demo-script.md). What to look for per judging criterion:
[Evaluator walkthrough](docs/demo/evaluator-walkthrough.md).

## Testing

```bash
make test          # backend pytest suite (51 tests, in-memory SQLite, every fallback active), then the frontend type-check
make lint          # ruff + TypeScript checks; also fails if the banned Lucide Sparkle icon is used
```

The end-to-end test drives a full birth journey through the real outbox → broker → consumer pipeline and checks the
human gate, the parent-reported consulate, the visa re-plan, the two "resident present" events, and that no raw
Emirates ID reaches an authority. See [Local development](docs/deployment/local-development.md#running-tests).

## Agent testing

```bash
make agent-test    # pytest tests/test_agent.py -k "scenarios or translations"
                   # or POST /api/v1/agent/testing/run as an officer, or /agent-testing in the UI
```

Ten scenarios: eight forbidden behaviours that must be caught (missing disclosure, invented approval, invented
consulate status, unsourced fee, Emirates ID read aloud, callback without consent, callback after opt-out, approval
bypass), three of them also refused by the live system, and two live conversations that must pass (Arabic intake,
escalation on distress). Each run is rolled back. `make agent-test` also checks that every translation covers all
phrasebook keys and keeps the disclosure. With ElevenLabs credentials, `POST /api/v1/agent/testing/sync` (admin)
creates the seven ElevenLabs Agent Testing definitions in the workspace and runs them against the agent. See
[Agent Testing](docs/agent/testing.md).

## Government mock disclaimer

LifeLoop does not connect to DHA, MOHAP, DOH, MOFA, GDRFA-Dubai, ICP, any insurer, DHA eClaimLink, UAE Pass or any
consulate. The adapters in [`backend/app/integrations/government/`](backend/app/integrations/government/) simulate
those authorities behind the integration contract each would implement, and every status they produce is labelled
"(mock)". The home-country consulate has no integration by design. Fees and SLAs come from the team's research
recorded in the Idea Canvas and must be confirmed against each authority's current published schedule. Nothing in
this repository is an official statement of any UAE authority.

## Project structure

```
.
├── backend/                     FastAPI service (uv project)
│   ├── alembic/                 migrations (0002: LifeLoop UAE schema)
│   ├── app/
│   │   ├── agents/              conversation graph, NLU, tools, guardrails, prompts, Agent Testing
│   │   ├── api/v1/              routers: auth, users, cases, agent, officer, entities, demo, health, misc
│   │   ├── core/                config, security, PII redaction, i18n phrasebook (+ translations/ ar hi ur ml tl), errors, clock
│   │   ├── db/                  base, session, migration runner
│   │   ├── events/              catalogue, recorder, broker, relay, consumers, handlers, pump, SSE hub
│   │   ├── graph/               Neo4j projection
│   │   ├── integrations/        elevenlabs, government (mock), telephony, notifications, cache
│   │   ├── knowledge/           read-only knowledge base (the agent's RAG source)
│   │   ├── models/              SQLAlchemy models
│   │   ├── observability/       logging, tracing, metrics
│   │   ├── repositories/        data access
│   │   ├── schemas/             request schemas
│   │   ├── seed/                idempotent seed and demo cases
│   │   ├── services/            case, graph, approval, entity, callback, consent, verification, ...
│   │   ├── workers/             background workers
│   │   └── workflows/           Life-Event Graph template, state machine, case orchestrator
│   ├── scripts/                 mint_gmail_token.py (Gmail OAuth credential for GMAIL_CREDENTIALS_B64)
│   ├── tests/                   pytest suite
│   └── Dockerfile               python:3.12-slim + uv, non-root
├── frontend/                    React 19 + Vite app (Dockerfile: node:22-alpine, vite preview)
├── docs/                        documentation
├── scripts/                     demo.sh, reset.sh, seed.sh, health.sh, wait-ready.sh (used by the Makefile)
├── docker-compose.yml
├── Makefile
├── .env.example
├── SECURITY.md
└── README.md
```

## Screenshots

Screenshots of the landing page, the voice console, the case dashboard and graph, the officer dashboard and the demo
panel live in `docs/assets/`.

## Documentation

| Area | Pages |
|---|---|
| Start | [Documentation index](docs/README.md) |
| Architecture | [Overview](docs/architecture/overview.md) · [System architecture](docs/architecture/system-architecture.md) · [Life-Event Graph](docs/architecture/life-event-graph.md) · [Event-driven architecture](docs/architecture/event-driven-architecture.md) · [Data flow](docs/architecture/data-flow.md) |
| Voice agent | [Overview](docs/agent/overview.md) · [Call flow](docs/agent/call-flow.md) · [Sub-agents](docs/agent/sub-agents.md) · [Tools](docs/agent/tools.md) · [Guardrails](docs/agent/guardrails.md) · [Multilingual](docs/agent/multilingual.md) · [Agent Testing](docs/agent/testing.md) |
| Integrations | [ElevenLabs](docs/integrations/elevenlabs.md) · [Telephony](docs/integrations/telephony.md) · [Government adapters](docs/integrations/government-adapters.md) · [Kafka](docs/integrations/kafka.md) · [Redis](docs/integrations/redis.md) · [Neo4j](docs/integrations/neo4j.md) · [Langfuse](docs/integrations/langfuse.md) |
| API | [API overview](docs/api/overview.md) |
| Deployment | [Docker](docs/deployment/docker.md) · [Local development](docs/deployment/local-development.md) · [Production](docs/deployment/production.md) |
| Security | [SECURITY.md](SECURITY.md) · [Threat model](docs/security/threat-model.md) · [PII handling](docs/security/pii-handling.md) · [Incident response](docs/security/incident-response.md) |
| Demo | [Demo script](docs/demo/demo-script.md) · [Evaluator walkthrough](docs/demo/evaluator-walkthrough.md) |

## Team Symphony

| Member | Role on this build | GitHub |
|---|---|---|
| Madhur Prakash Mangal | Agent design and orchestration: call flow, Agent Workflows, life-event state machine | [Madhur-Prakash](https://github.com/Madhur-Prakash) |
| Bhanvi Nayer | Backend and entity integrations: scoped tool layer, mocked GDRFA / MOFA / DHA contracts, case store | [bhanvinayer](https://github.com/bhanvinayer) |
| Archit Nirula | Officer dashboard and case timeline UI; post-call webhook pipeline | [XeRush](https://github.com/XeRush) |
| Saisha Goel | Institutional research, guardrails, multilingual conversation design and the Agent Testing suite | [saishagoel27](https://github.com/saishagoel27) |

## License

[MIT](LICENSE)

---

LifeLoop is a prototype built by Team Symphony for the **Ignyte × ElevenLabs Voice Agent Challenge** (Track 2:
Government Services, use case 7: Life-Event Service Orchestration).
