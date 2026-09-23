# Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `make: command not found` (Windows) | Install GNU Make (`choco install make`) or run the underlying commands from [development.md](development.md); `docker compose up --build` needs no make. |
| Frontend loads but API calls fail | Backend not up yet (`docker compose logs backend`) or `VITE_PROXY_TARGET` wrong. In Compose it must be `http://backend:8000`; locally `http://localhost:8000`. |
| Backend exits at start: `connection refused` | PostgreSQL not ready. Compose waits on the healthcheck; locally run `docker compose up -d postgres` first. |
| `relation "users" does not exist` / seed error in logs | Migrations not applied: `make migrate` (or `cd backend && uv run alembic upgrade head`). |
| Port already in use (5432 / 8000 / 5173) | Stop the other service or change the host port in `docker-compose.yml`. |
| Cannot sign in | Seed not run: `make seed`. Demo credentials: `demo@lifeloop.example` / `demo1234`. |
| Dashboard does not update live (badge says "Polling") | SSE blocked by a proxy; the app still polls every 6s. Check `GET /api/v1/events/stream` is not buffered (`X-Accel-Buffering: no` is set). |
| Voice center says "Simulated voice" | `ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_ID` not set - expected without keys. Set them and restart. |
| ElevenLabs agent connects but tools fail | `PUBLIC_BASE_URL` is not reachable from the internet (use ngrok), or `VOICE_TOOL_SECRET` differs from the header configured on the agent - re-run `POST /voice/agent/sync`. |
| Webhook returns 401 | `ELEVENLABS_WEBHOOK_SECRET` mismatch or clock skew > 30 min. |
| Callbacks stay `SCHEDULED` | The worker runs every 2s when `RUN_WORKERS=true`; they are also due only after `CALLBACK_DELAY_SECONDS`. Use "Place call now" in the Callback center or `POST /callbacks/run-due`. |
| No callback after an event | Expected for `PROCESSING`, `BLOCKED`, ordinary delays; also suppressed when callback consent is missing or the case is paused (see the timeline entry "Callback not placed"). |
| Demo action returns 409 | The state doesn't allow it (e.g. approving identity while it waits for a document, or acting on a task not yet submitted). The message says why. |
| Microphone button does nothing | Browser lacks Web Speech API (use Chrome/Edge) - type instead; for live ElevenLabs voice the browser must allow microphone access. |
| Arabic text renders oddly | Toggle the language in the header; the app sets `dir="rtl"`. |
| `uv sync` fails on Python version | Needs Python >= 3.11 (`uv python install 3.12`). |
| Reset everything | `make reset` (drops the database volume). |
