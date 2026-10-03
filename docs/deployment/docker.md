# Docker deployment

[`docker-compose.yml`](../../docker-compose.yml) runs the complete prototype as the Compose project `lifeloop`:
PostgreSQL, Redis, Kafka, Neo4j, the FastAPI backend and the React frontend. This is the recommended way to
evaluate LifeLoop. For hot-reload development see [Local development](local-development.md).

## Quick start

```bash
make demo         # creates .env from .env.example if missing, then up + wait for /ready + migrate + seed + banner
make health       # readiness of every dependency
```

`make demo` runs [`scripts/demo.sh`](../../scripts/demo.sh): it copies `.env.example` to `.env` if there is no `.env`,
runs `docker compose up --build -d`, waits for `/ready` with [`scripts/wait-ready.sh`](../../scripts/wait-ready.sh)
(up to about 4.5 minutes), runs `alembic upgrade head` and the idempotent seed inside the backend container, and
prints the URLs, the demo accounts, the state of `LL-DEMO-001` and a pointer to the demo script.

Windows PowerShell (without make):

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up --build -d
# wait until this answers, then:
Invoke-RestMethod http://localhost:8000/ready
docker compose exec -T backend alembic upgrade head
docker compose exec -T backend python -m app.seed
```

Migrations and the seed also run automatically when the backend starts (see [Startup switches](#startup-switches));
the explicit steps are idempotent. Then open `http://localhost:5173` (frontend) and `http://localhost:8000/docs`
(Swagger), and sign in with a [demo account](#demo-accounts).

## Services

| Service | Image | Host port (variable, default) | Health check | Data volume |
|---|---|---|---|---|
| `postgres` | `postgres:16-alpine` (user and database `lifeloop`, password `POSTGRES_PASSWORD`, default `lifeloop`) | `POSTGRES_PORT`, 5432 | `pg_isready` | `pgdata` |
| `redis` | `redis:7-alpine` with append-only persistence (`--appendonly yes --save 60 1`) | `REDIS_PORT`, 6379 | `redis-cli ping` | `redisdata` |
| `kafka` | `apache/kafka:3.9.1`, single node in KRaft mode (broker + controller, no ZooKeeper) | `KAFKA_PORT`, 9092 | `kafka-broker-api-versions.sh` on the internal listener | `kafkadata` |
| `neo4j` | `neo4j:5-community` (user `neo4j`, password `NEO4J_PASSWORD`, default `lifeloop-neo4j`) | `NEO4J_HTTP_PORT`, 7474 and `NEO4J_BOLT_PORT`, 7687 | `cypher-shell 'RETURN 1'` | `neo4jdata` |
| `backend` | built from [`backend/Dockerfile`](../../backend/Dockerfile) | `BACKEND_PORT`, 8000 | `GET /health` | `uploads` (mounted at `/app/storage`) |
| `frontend` | built from [`frontend/Dockerfile`](../../frontend/Dockerfile) | `FRONTEND_PORT`, 5173 | HTTP GET on `/` | none |

Start order follows the health checks: the backend waits for postgres, redis, kafka and neo4j to be healthy, and the
frontend waits for the backend.

### Kafka listeners

| Listener | Address | Used by |
|---|---|---|
| `INTERNAL` | `kafka:19092` | The backend container (`KAFKA_BOOTSTRAP_SERVERS=kafka:19092`) and inter-broker traffic |
| `EXTERNAL` | `localhost:${KAFKA_PORT}` | Tools and a backend running on the host (`.env.example`: `localhost:9092`) |
| `CONTROLLER` | `kafka:9093` | KRaft controller quorum |

Topic auto-creation is enabled with 3 partitions per topic, and the backend also creates its seven topics at start-up
([Kafka](../integrations/kafka.md)).

### Backend container

[`backend/Dockerfile`](../../backend/Dockerfile): `python:3.12-slim` with `uv` copied from `ghcr.io/astral-sh/uv`;
dependencies installed with `uv sync --frozen --no-dev` from `uv.lock` (no pip); runs as the non-root user
`lifeloop` (uid 10001); command `uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers`. Compose passes
`.env` and overrides the data-store addresses with in-network ones:

| Variable set by Compose | Value |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://lifeloop:${POSTGRES_PASSWORD}@postgres:5432/lifeloop` |
| `REDIS_URL` | `redis://redis:6379/0` |
| `KAFKA_BOOTSTRAP_SERVERS` | `kafka:19092` |
| `NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD` | `bolt://neo4j:7687` / `neo4j` / `${NEO4J_PASSWORD}` |
| `FRONTEND_URL`, `CORS_ORIGINS` | From `.env` (defaults for port 5173) |
| `RUN_MIGRATIONS_ON_STARTUP`, `SEED_ON_STARTUP` | From `.env` (default `true`) |
| `STORAGE_DIR` | `/app/storage` (the `uploads` volume) |
| `LOG_OUTPUT` | `console` |

### Frontend container

[`frontend/Dockerfile`](../../frontend/Dockerfile): `node:22-alpine`, `npm ci`, `npm run build`, then
`vite preview --host 0.0.0.0 --port 5173`, which serves the production build and proxies `/api` to
`http://backend:8000`.

### Port conflicts

If another project already uses one of these ports (5173, 8000, 5432, 6379, 9092, 7474, 7687), change it in `.env`,
for example:

```dotenv
POSTGRES_PORT=55432
FRONTEND_PORT=5174
```

Only the host side changes; containers keep talking to each other on the internal ports. If you change
`FRONTEND_PORT`, update `CORS_ORIGINS` and `FRONTEND_URL` (used in email links). If you change `BACKEND_PORT`, update
`PUBLIC_BASE_URL`. The Makefile reads `FRONTEND_PORT` and `BACKEND_PORT` from `.env` for its URLs and health checks.

## Startup switches

The backend's start-up ([`main.py`](../../backend/app/main.py) `lifespan`) is controlled by environment variables:

| Variable | Default | Effect |
|---|---|---|
| `RUN_MIGRATIONS_ON_STARTUP` | `true` | Runs `alembic upgrade head` under a PostgreSQL advisory lock ([`migrate.py`](../../backend/app/db/migrate.py)), so several replicas can start at once: the first migrates, the others wait and find nothing to do |
| `SEED_ON_STARTUP` | `true` | Runs the idempotent seed: if the data exists, leave it; otherwise create it. A seed failure is logged and the API keeps serving |
| `SEED_DEMO_DATA` | `true` | Whether the seed builds the demo cases (organisations and users are always ensured) |
| `RUN_WORKERS` | `true` | Starts the relay, consumer, callback, entity-poll and SLA workers in the API process |

Then the cache, Neo4j and broker connect (each falling back if unavailable), and `/ready` reports what was chosen.

## The seed

[`seed.py`](../../backend/app/seed/seed.py) creates, if missing:

- organisations `LIFELOOP` (platform) and `AMER-BARSHA` ("Amer Centre - Al Barsha, Dubai", service centre);
- the demo accounts below;
- three demo cases, built by **running the real pipeline on a backdated clock** (intake → orchestrator → officer
  release → mock authority → consumers → callbacks), so their timelines, audit trails and outbox history are
  genuine, not hand-written rows.

| Case | Situation |
|---|---|
| `LL-DEMO-001` | Demo Child, Indian, English, Dubai. Birth certificate CLEARED, MOFA CLEARED, consulate COMPLETED (parent-reported), residence visa PROCESSING, Emirates ID PENDING, insurance PENDING |
| `LL-DEMO-002` | Sharjah (MOHAP), Tagalog. Marriage certificate not attested, so the birth certificate is DOCUMENT_MISSING |
| `LL-DEMO-003` | Dubai, Urdu. Birth certificate prepared and awaiting officer release, plus an open APPROVAL_QUESTION escalation |

Run it again at any time (`make seed`, [`scripts/seed.sh`](../../scripts/seed.sh), or
`docker compose exec -T backend python -m app.seed`); existing data is left alone. `POST /api/v1/demo/reset` (or the
demo panel) rebuilds `LL-DEMO-001` from scratch.

## Demo accounts

| Email | Role | Name |
|---|---|---|
| `demo.resident@lifeloop.local` | RESIDENT | Demo Resident (owns `LL-DEMO-001`; its callbacks ring in this account's app) |
| `demo.officer@lifeloop.local` | OFFICER | Mariam Al Ali, Amer Officer, Amer Centre - Al Barsha |
| `demo.admin@lifeloop.local` | ADMIN | Demo Administrator |
| `khalid.officer@lifeloop.local` | OFFICER | Khalid Al Mansoori, invitation pending (a transfer target; cannot sign in until the invitation is accepted) |

The password is `DEMO_USER_PASSWORD` from `.env`. `.env.example` ships `LifeLoop-Demo-2026`. If it is unset in
development, a random password is generated and printed once to the backend log (`make logs`). Outside development,
demo users are not created without `DEMO_USER_PASSWORD`. The residents of `LL-DEMO-002` and `LL-DEMO-003` have no
password and cannot sign in.

## Make targets

The root [`Makefile`](../../Makefile) needs GNU make and bash (Linux, macOS, Git Bash or WSL). PowerShell
equivalents: [Local development](local-development.md#powershell-equivalents). `make help` lists the targets.

| Target | What it does |
|---|---|
| `make help` | List targets |
| `make install` | `uv sync` in `backend/`, `npm ci` in `frontend/` |
| `make dev` | Start postgres, redis, kafka and neo4j in Docker, then `backend` and `frontend` with hot reload on the host |
| `make backend` | `uv run uvicorn app.main:app --reload --port $BACKEND_PORT` |
| `make frontend` | Vite dev server on `$FRONTEND_PORT`, proxying `/api` to the backend |
| `make up` | `docker compose up --build -d`, wait for `/ready`, print the URLs |
| `make down` | `docker compose down` |
| `make build` | `docker compose build` and `npm run build` (type-check + bundle) |
| `make logs` | `docker compose logs -f --tail=150` |
| `make migrate` | `alembic upgrade head` inside the backend container |
| `make migration m="..."` | New autogenerated Alembic revision (host) |
| `make seed` | Idempotent seed inside the backend container |
| `make demo` | [`scripts/demo.sh`](../../scripts/demo.sh): up, wait, migrate, seed, print URLs, credentials and the scenario |
| `make test` | Backend pytest suite, then the frontend type-check |
| `make agent-test` | Agent Testing scenarios and translation coverage (`pytest tests/test_agent.py -k "scenarios or translations"`) |
| `make lint` | Ruff, the frontend type-check, and a check that fails if the banned Lucide `Sparkle`/`Sparkles` icon appears in `frontend/src` |
| `make format` | `ruff check --fix` and `ruff format` |
| `make health` | `GET /ready`, pretty-printed (also [`scripts/health.sh`](../../scripts/health.sh)) |
| `make clean` | **Destructive**: `docker compose down -v --remove-orphans` and remove build and test artefacts |
| `make reset` | **Destructive**: [`scripts/reset.sh`](../../scripts/reset.sh) removes containers and volumes, then runs the demo script for a clean, seeded stack |
| `make docs` | Print the documentation map (`docs/README.md`) |

## Checking the stack

```bash
make health                       # or: curl -s http://localhost:8000/ready
docker compose ps                 # every service should be "healthy"
```

`/ready` lists each dependency and its mode. With the full Compose stack you should see `postgres` healthy,
`kafka.mode: kafka`, `redis.mode: redis`, `neo4j.mode: neo4j`, `government.mode: mock`, and the voice provider
`simulated` unless ElevenLabs credentials are set.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `port is already allocated` | Another project uses the port. Change the matching `*_PORT` variable in `.env` ([Port conflicts](#port-conflicts)) |
| `wait-ready` times out | `make logs`; usually PostgreSQL or a failing migration. `/ready` returns 503 while PostgreSQL is unreachable |
| `kafka.mode: in-memory-fallback` | Kafka was not healthy when the backend started. `docker compose restart backend` once Kafka is healthy |
| Neo4j unhealthy on first start | It can take up to a minute; the health check allows a 40 s start period and retries |
| Sign-in fails with the demo password | `DEMO_USER_PASSWORD` changed after the users were seeded (the seed never overwrites). Use the original password, or `make reset` |
| No demo cases | `SEED_DEMO_DATA=false`, or demo users were skipped because `DEMO_USER_PASSWORD` is unset outside development |
| CORS errors in the browser | Add the frontend origin to `CORS_ORIGINS` |
| Verification email never arrives | Without the Gmail variables, email uses the console transport. In development, open `GET /api/v1/dev/mailbox?email=you@example.com` |

## Related

- [Local development](local-development.md)
- [Production](production.md)
- [Kafka](../integrations/kafka.md), [Redis](../integrations/redis.md), [Neo4j](../integrations/neo4j.md)

[Documentation index](../README.md)
