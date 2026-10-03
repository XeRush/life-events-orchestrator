# Local development

Run the backend and frontend on your machine with hot reload, and the data services in Docker. The root `Makefile`
wraps every step; [PowerShell equivalents](#powershell-equivalents) are at the end of this page.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.12 | The backend requires `>=3.12,<3.13` |
| uv | current | The only supported Python package manager for this repo (no pip, no poetry) |
| Node.js | 22 | For the frontend (the frontend image uses `node:22-alpine`) |
| Docker Desktop | current | For PostgreSQL, Redis, Kafka and Neo4j |
| GNU make + bash | any | Linux, macOS, or Git Bash / WSL on Windows (optional: see PowerShell equivalents) |

## Quick path

```bash
cp .env.example .env
make install      # uv sync (backend) + npm ci (frontend)
make dev          # postgres, redis, kafka, neo4j in Docker; backend and frontend with hot reload on the host
```

`make dev` starts the four data services with `docker compose up -d postgres redis kafka neo4j`, then runs
`make backend` (`uv run uvicorn app.main:app --reload --port $BACKEND_PORT`) and `make frontend` (Vite on
`$FRONTEND_PORT`, proxying `/api` to the backend) in parallel. The Makefile reads `.env`, so the ports there apply.

## Configuration

The backend reads `.env` from `backend/` or the repository root (`env_file=(".env", "../.env")` in
[`config.py`](../../backend/app/core/config.py)). Every setting is an upper-case environment variable named after the
field in `Settings`; the full list is in the [repository README](../../README.md#environment-variables).

`.env.example` is set up for host runs against the Compose data services:

```dotenv
DATABASE_URL=postgresql+asyncpg://lifeloop:lifeloop@localhost:5432/lifeloop
REDIS_URL=redis://localhost:6379/0
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
NEO4J_URI=bolt://localhost:7687
```

Empty `REDIS_URL`, `KAFKA_BOOTSTRAP_SERVERS` or `NEO4J_URI` to use the in-process fallbacks instead (memory cache,
in-memory broker, PostgreSQL graph queries). Inside Docker Compose the backend container ignores these host
addresses: Compose sets in-network addresses (`postgres:5432`, `redis:6379`, `kafka:19092`, `neo4j:7687`).

**PostgreSQL is required to run the backend. SQLite is not supported for running the application** (the migrations,
the advisory-lock migration runner and the outbox relay are written for PostgreSQL). Only the test suite uses SQLite.

On start-up the backend migrates (`RUN_MIGRATIONS_ON_STARTUP=true`), seeds (`SEED_ON_STARTUP=true`) and starts its
workers (`RUN_WORKERS=true`). To do the first two by hand:

```bash
cd backend
uv run alembic upgrade head
uv run python -m app.seed
```

Swagger is at `http://localhost:8000/docs`, readiness at `http://localhost:8000/ready`.

The Vite dev server proxies `/api` to `VITE_PROXY_TARGET` (`make frontend` sets it to the backend URL), so the browser
only ever talks to its own origin. No API secret lives in the frontend.

## Email in development

Email has exactly three settings:

| Variable | Example | Purpose |
|---|---|---|
| `GMAIL_CREDENTIALS_B64` | base64 string | Base64 of the pickled Google OAuth credential with the `gmail.send` scope only |
| `GMAIL_SENDER` | `synfin.no.reply@gmail.com` | The mailbox that granted the credential |
| `EMAIL_FROM_NAME` | `LifeLoop` | Display name |

Mint the credential with [`backend/scripts/mint_gmail_token.py`](../../backend/scripts/mint_gmail_token.py). It needs
an OAuth client ID of type **Desktop app** (its downloaded `credentials.json`) in a Google Cloud project with the
Gmail API enabled, and the dev dependency group for the consent flow:

```bash
cd backend && uv sync --group dev && uv run python scripts/mint_gmail_token.py path/to/credentials.json
```

Sign in as the mailbox that should send (it must match `GMAIL_SENDER`) and paste the printed line into `.env` as
`GMAIL_CREDENTIALS_B64`. If sending later fails with `invalid_grant`, mint a new credential: while the OAuth consent
screen is in "Testing", Google expires refresh tokens after 7 days.

Without the credential, the **console transport** is used: it logs only the masked recipient and subject. In
development (`ENVIRONMENT=development` or `test`) it also keeps the last 50 messages in memory so you can follow
verification, password-reset and invitation links:

```
GET http://localhost:8000/api/v1/dev/mailbox?email=you@example.com
```

This endpoint returns `404` in any other environment and is not in the OpenAPI schema. An optional
`EMAIL_BACKEND=auto|gmail|console` (default `auto`) forces a transport.

## Running tests

```bash
make test         # backend pytest suite (51 tests), then the frontend type-check
make agent-test   # the ten Agent Testing scenarios + translation coverage
make lint         # ruff + TypeScript, and fails if the banned Lucide Sparkle icon appears in frontend/src
```

The pytest suite ([`backend/tests/`](../../backend/tests/)) runs on **in-memory SQLite** with every fallback active:
in-memory broker, memory cache, no Neo4j or Langfuse, console email, mock SMS, simulated telephony
([`conftest.py`](../../backend/tests/conftest.py)). Tables are created from the models for tests only; the real
schema is always managed by Alembic, and `test_alembic_migrations_match_models` checks that the two agree. The event
pipeline is settled synchronously with the event pump, so tests are deterministic. What each test file covers:
[Agent Testing](../agent/testing.md#what-else-is-tested).

## Working on the agent without ElevenLabs

Everything voice-related works without credentials. Open `/app/voice`, start a call and type utterances: the
simulated channel uses the same tools, phrasebook (all six languages) and guardrails as the ElevenLabs agent. To see
the exact agent definition that would be synced, sign in as the demo admin and call
`POST /api/v1/agent/sync?dry_run=true`.

## Windows notes

- `make` is not available in PowerShell. Use Git Bash or WSL, or the equivalents below.
- In Windows PowerShell 5.1, chain commands with `;` (it does not support `&&`).
- Use `Invoke-RestMethod` or `curl.exe` (not the `curl` alias) to call the API.
- Set an environment variable for one command with `$env:NAME = 'value'; <command>`.
- Shell scripts, the Makefile and Dockerfiles are checked out with LF line endings (`.gitattributes`), so they run in
  containers and Git Bash.
- Docker Desktop must be running before `docker compose` commands.

## PowerShell equivalents

Run from the repository root unless a `cd` is shown.

| Make target | PowerShell |
|---|---|
| `make install` | `cd backend; uv sync; cd ..\frontend; npm ci; cd ..` |
| `make dev` | `docker compose up -d postgres redis kafka neo4j`, then `make backend` and `make frontend` in two terminals |
| `make backend` | `cd backend; uv run uvicorn app.main:app --reload --port 8000` |
| `make frontend` | `cd frontend; $env:VITE_PROXY_TARGET = 'http://localhost:8000'; npm run dev -- --port 5173` |
| `make up` | `docker compose up --build -d`, then poll `Invoke-RestMethod http://localhost:8000/ready` until it answers |
| `make down` | `docker compose down` |
| `make build` | `docker compose build; cd frontend; npm run build; cd ..` |
| `make logs` | `docker compose logs -f --tail=150` |
| `make migrate` | `docker compose exec -T backend alembic upgrade head` |
| `make migration m="..."` | `cd backend; uv run alembic revision --autogenerate -m "describe the change"` |
| `make seed` | `docker compose exec -T backend python -m app.seed` |
| `make demo` | `if (-not (Test-Path .env)) { Copy-Item .env.example .env }; docker compose up --build -d`, wait for `/ready`, then `docker compose exec -T backend alembic upgrade head; docker compose exec -T backend python -m app.seed` |
| `make test` | `cd backend; uv run pytest; cd ..\frontend; npm run lint; cd ..` |
| `make agent-test` | `cd backend; uv run pytest -q tests/test_agent.py -k "scenarios or translations"` |
| `make lint` | `cd backend; uv run ruff check .; cd ..\frontend; npm run lint; cd ..; Select-String -Path frontend\src\* -Pattern '\bSparkles?\b' -Recurse` (should find nothing) |
| `make format` | `cd backend; uv run ruff check --fix .; uv run ruff format .` |
| `make health` | `Invoke-RestMethod http://localhost:8000/ready \| ConvertTo-Json -Depth 6` |
| `make clean` | `docker compose down -v --remove-orphans` (then delete `frontend\dist`, `backend\.pytest_cache`, `backend\.ruff_cache`, `backend\.test-storage`) |
| `make reset` | `docker compose down -v --remove-orphans`, then the `make demo` steps |
| `make docs` | Open `docs\README.md` |

## Troubleshooting

| Symptom | Fix |
|---|---|
| `connection refused` on start-up | PostgreSQL is not running or `DATABASE_URL` is wrong. `docker compose up -d postgres` |
| A port is already in use | Another project uses 5432, 6379, 9092, 7474, 7687, 8000 or 5173. Change the host port in `.env` (`POSTGRES_PORT`, `REDIS_PORT`, `KAFKA_PORT`, `NEO4J_HTTP_PORT`, `NEO4J_BOLT_PORT`, `BACKEND_PORT`, `FRONTEND_PORT`). For host runs, also change the port in `DATABASE_URL`, `REDIS_URL`, `KAFKA_BOOTSTRAP_SERVERS` or `NEO4J_URI`, and keep `CORS_ORIGINS`, `PUBLIC_BASE_URL` and `FRONTEND_URL` in step |
| `sqlite` URL fails at start-up | Expected: the application needs PostgreSQL |
| `kafka.mode: in-memory-fallback` in `/ready` | Kafka was not reachable when the backend started. Start it, then restart the backend |
| `email_not_verified` when opening a case on the web | Confirm the email first; in development use the dev mailbox |
| Callbacks never ring | `RUN_WORKERS=false`, or the case has no callback consent or is opted out (check the case's callbacks list) |
| Gmail `invalid_grant` | Mint a new credential with `backend/scripts/mint_gmail_token.py` |
| `ModuleNotFoundError` | Run commands through `uv run` from `backend/` |

## Related

- [Docker](docker.md)
- [Production](production.md)
- [Agent Testing](../agent/testing.md)
- [API overview](../api/overview.md)

[Documentation index](../README.md)
