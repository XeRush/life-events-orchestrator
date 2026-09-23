# Deployment

## Docker Compose (recommended)

```bash
cp .env.example .env        # optional: defaults work without editing
docker compose up --build   # or: make up
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:8000 |
| Swagger / ReDoc | http://localhost:8000/docs · /redoc |
| PostgreSQL | localhost:5432 (`lifeloop` / `lifeloop`) |

The backend container runs `alembic upgrade head`, the idempotent seed, then Uvicorn. The frontend container builds the SPA and serves it with `vite preview`, proxying `/api` and `/mock` to the backend (no CORS needed, no secrets in the browser). Redis is optional: `docker compose --profile redis up`.

Volumes: `pgdata` (database), `uploads` (document storage).

`make demo` = up + wait for health + migrate + seed + print the scenario. `make reset` wipes the volumes first.

## Configuration

See `.env.example`. Key variables: `DATABASE_URL`, `JWT_SECRET`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `PUBLIC_BASE_URL`, `CORS_ORIGINS`, `DEMO_MODE`, `CALLBACK_DELAY_SECONDS`, `SIMULATION_AUTOPILOT` (mock authorities act on their own after 30s when true).

## Going beyond a demo

- **Frontend**: build static assets (`npm run build`) and serve behind any CDN/reverse proxy that routes `/api` to the backend.
- **Backend**: run several Uvicorn/Gunicorn workers. Workers currently run in-process (`RUN_WORKERS=true`); to scale, set it to `false` on web nodes and run one process that only executes the worker loops (`app.workers.*`). Introduce Redis for the SSE hub and rate limiter first (both behind interfaces).
- **Database**: managed PostgreSQL, run migrations as a release step (`alembic upgrade head`), set `SEED_ON_START=false` and `DEMO_MODE=false`.
- **Voice**: public HTTPS `PUBLIC_BASE_URL`, `ELEVENLABS_WEBHOOK_SECRET`, telephony number (see [elevenlabs.md](elevenlabs.md)).
- **Observability**: JSON logs with `request_id`, `case_id`, `task_id`, `event_id`, `duration_ms`; ship to your log stack.

## Compliance positioning

This is a prototype using mock government entities and a demonstration workflow. Government-authorized integrations, security review, accessibility audit and legal sign-off would be required before any real-world use.
