# Decision log

| # | Decision | Why | Trade-off |
|---|---|---|---|
| 1 | **Modular monolith** (FastAPI) | Hackathon speed, transactional consistency, easy local run; module boundaries mirror a later split. | Single deployable; workers in-process (thin loops, easy to extract). |
| 2 | **PostgreSQL outbox event bus**, handlers inside the transaction | Correctness first: timeline + dependants + callbacks are stored atomically with the state change; no dual-write problem. | Handlers add latency to the request; Kafka/Redis can replace `PostgresEventBus` behind the same port. |
| 3 | **Events are also the audit log** | One append-only source for timeline, audit, SSE and outbox. | Table grows; API paginates and indexes `case_id` / `event_type`. |
| 4 | **Explicit task state machine** with a single `transition` | Regulated workflows need validated, auditable transitions. | A little ceremony for every state change. |
| 5 | **System nodes in the graph** (`BIRTH_REPORTED`, `CASE_COMPLETE`) | Root and completion become ordinary graph nodes: no special-casing in the engine or UI. | Two extra tasks per case (hidden from resident counts). |
| 6 | **Idempotency keys** on submission, events and case creation | Retries, duplicate webhooks and voice tool re-calls must never duplicate applications or callbacks. | Keys must be designed per event kind. |
| 7 | **Callbacks are coalesced** (4s window) | The resident should get one meaningful call, not five. | Small delay before a call is placed (configurable). |
| 8 | **Notification policy as code** | Testable, explainable, judge-visible. | Rules are static; a rules engine is future work. |
| 9 | **Agent has no memory and no data other than tools** | Safety (no invented facts) and persistence ("Where are we?" days later). | Every answer costs a tool call. |
| 10 | **Backend dialog engine** alongside ElevenLabs | Whole system demoable offline; executable spec of agent behaviour; fallback during outages. | Rule-based NLU is intentionally narrow; ElevenLabs' LLM is the production language layer. |
| 11 | **`complete_case` refuses** unless authorities confirmed everything | The AI must not declare official outcomes. | The agent can only report, never "close out". |
| 12 | **Mock authorities keep their own store** | Demonstrates the real integration boundary (submit / poll / webhook) and lets simulations be honest events. | More code than a hard-coded stub. |
| 13 | **Definition-only life events** (MARRIAGE, MOVE, BUSINESS_START) | Shows extensibility without pretending to support real processes. | Activation is refused with an explicit message. |
| 14 | **Explicit `commit()`** at the end of each write endpoint (not a yield-dependency) | Guarantees commit happens *before* the response and SSE notification, independent of FastAPI's dependency-exit timing. | Discipline: every mutating route commits once. |
| 15 | **SSE + query invalidation, with polling fallback** | Real-time feel without WebSocket complexity; works through proxies. | One-way; in-memory hub is single-instance until Redis. |
| 16 | **SQLite (aiosqlite) for tests, PostgreSQL in production** | Fast, dependency-free CI; portable column types (`UTCDateTime`, JSONB variant, CHECK-constraint enums). | Postgres-specific behaviour is covered by the Compose run/seed. |
| 17 | **Tailwind v4 tokens + custom components, no UI kit** | Distinct institutional look; no component-library lookalike. | More hand-written UI. |
| 18 | **Frontend talks only to same-origin `/api`** (Vite proxy) | No CORS, no secrets in the browser; identical in dev and Docker. | Production needs a reverse proxy rule. |
| 19 | **bcrypt / PyJWT directly** (no passlib) | Fewer moving parts and no known compatibility issues. | Slightly more code in `core/security.py`. |
