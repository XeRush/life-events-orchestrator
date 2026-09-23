# System design

## Goals and non-goals

**Goal:** one voice interaction creates a persistent, event-driven case that coordinates every service triggered by a life event and keeps the resident informed only when it matters.

**Non-goals (by design):** LIFELOOP never approves, rejects, determines eligibility, edits official records or impersonates an officer. Authorities own those decisions; LIFELOOP coordinates and reports.

## Core concepts

- **Life event template** (`life_events`, `workflows`, `workflow_nodes`, `workflow_edges`): a versioned definition of the journey. BIRTH is fully implemented; MARRIAGE, MOVE and BUSINESS_START exist as definitions only (`is_configured = false`) and refuse activation with an explicit message.
- **Life Event Case** (`life_event_cases`): the persistent case. Holds event, date, participants, preferences and `memory` (facts collected so far) - the passport.
- **Service task** (`service_tasks`, `task_dependencies`): a workflow node instantiated for one case, plus per-case dependency edges. The graph API and UI are projections of these rows.
- **Domain event** (`events`): append-only record of everything meaningful; the source of the timeline and the audit trail.
- **Consent** (`consents`): first-class, versioned, scoped, with source and timestamp.
- **Callback** (`callbacks`, `conversations`): proactive calls and their transcripts.

## Key design decisions

1. **State lives in Postgres, not in agents.** The voice agent is stateless between turns; every fact comes from a tool that reads the case. This is what makes "Where are we?" work days later and is also the safety property (nothing invented).
2. **Events are facts, transitions are validated.** Entity events go through one function (`OrchestrationService.transition`) that validates against the explicit state machine, stamps timestamps and publishes the event.
3. **Handlers run inside the transaction.** Publishing persists the event; `commit()` drains handlers, then commits. Either the whole reaction (timeline, dependants, callbacks) is stored, or none of it - case consistency without distributed transactions. A stale-outbox worker re-dispatches events whose handlers never finished.
4. **Idempotency everywhere it matters.** Task submission uses an idempotency key that the adapter honours (no duplicate application). Events carry an idempotency key (duplicate `TASK_COMPLETED` is ignored, so no duplicate callbacks or downstream tasks). Case creation accepts an idempotency key.
5. **Notification policy is code, not vibes.** A pure function decides which events warrant a call; calls are coalesced so a burst of milestones becomes one call; consent and pause state are respected.
6. **Provider-neutral voice.** The rest of the backend depends on `OutboundCaller` and the tool runner. ElevenLabs is one implementation; a simulated channel keeps the whole system demoable without keys.
7. **Adapters own the entity boundary.** Mock authorities keep their own store (`mock_applications`) and push webhooks; LIFELOOP only learns outcomes by being told or asking. Swapping in a real API means implementing `GovernmentAdapter`.

## Consistency and failure model

| Failure | Behaviour |
|---|---|
| Authority timeout / rate limit / unavailable | Retried with backoff; if still failing the task stays `READY`, a timeline entry is written once, the worker retries; after 5 deferrals it becomes `FAILED` and the case is escalated. |
| Authority rejects submission (permanent) | Task `FAILED` -> case `ESCALATED` to a human officer. |
| Malformed authority response | Treated as a permanent adapter error (no silent partial state). |
| Duplicate request / event | Acknowledged, not re-applied. |
| Handler exception | The transaction rolls back and the event error is logged; nothing half-applied. |
| ElevenLabs unavailable | Voice session falls back to the backend dialog engine; outbound calls retry then mark the callback `FAILED`/rescheduled. |
| Missing document | Task waits in `WAITING_FOR_RESIDENT`; case stays open; dependants stay blocked. |

## Scalability path

PostgreSQL-backed outbox + in-process handlers is deliberately the simplest thing that is correct. To scale out: run workers as separate processes (already thin loops), replace `PostgresEventBus` with a Kafka/Redis Streams implementation (same `publish`/`drain` contract), replace the in-memory `EventHub` with Redis pub/sub, and the in-memory rate limiter with a Redis limiter (both behind interfaces).
