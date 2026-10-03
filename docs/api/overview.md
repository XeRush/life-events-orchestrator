# API overview

The backend is a FastAPI application ([`main.py`](../../backend/app/main.py)). Business endpoints live under
`/api/v1`; liveness, readiness and metrics are served both at the root and under `/api/v1`. The OpenAPI
documentation is generated from the code:

| URL | What |
|---|---|
| `http://localhost:8000/docs` | Swagger UI |
| `http://localhost:8000/redoc` | ReDoc |
| `http://localhost:8000/openapi.json` | OpenAPI document |

OpenAPI tags: `auth`, `users`, `cases`, `agent`, `officer`, `entities`, `demo`, `health` (described in the OpenAPI
metadata), plus `events`, `notifications` and `knowledge` on the SSE and miscellaneous routers. Routers are in
[`backend/app/api/v1/`](../../backend/app/api/v1/).

## Conventions

**Authentication.** `Authorization: Bearer <access token>` from `POST /api/v1/auth/login`. Access tokens are JWTs
(HS256, issuer `lifeloop`) valid for `ACCESS_TOKEN_MINUTES` (30); refresh tokens are valid for `REFRESH_TOKEN_DAYS`
(7) and rotate on every use. A revoked token, a deactivated account, or a token issued before the last password
change is rejected.

**Auth column below:**

| Value | Meaning |
|---|---|
| Public | No token |
| User | Any signed-in role |
| Resident | Signed-in resident; case routes also require that the case is theirs |
| Staff | OFFICER or ADMIN; case routes also require the case's service centre (admins: all) |
| Admin | ADMIN only |
| Demo | Staff **and** `DEMO_MODE=true` (otherwise `403 demo_disabled`) |
| Tool secret | `X-LifeLoop-Tool-Secret` header equal to `VOICE_TOOL_SECRET` (server tools also need a bound, active call) |
| Signature | `ElevenLabs-Signature` HMAC header (required when `ELEVENLABS_WEBHOOK_SECRET` is set; always in production) |

A case outside the caller's scope returns `404 not_found`, so its existence is not revealed (the denial is audited).

**Errors.** Every error uses one envelope:

```json
{"error": {"code": "officer_required", "message": "Only an officer of the case's service centre can do this."}}
```

`details` is added when there is more to say. Validation errors are `422` with code `validation_error` and
`details: [{"loc": [...], "msg": "..."}]`. Unhandled errors return `500 internal_error` with a generic message; no
stack trace or internal detail is returned.

| HTTP | Typical codes |
|---|---|
| 401 | `unauthorized`, `invalid_credentials`, `invalid_tool_secret`, `invalid_signature`, `webhook_not_configured` |
| 403 | `forbidden`, `role_required`, `officer_required`, `email_not_verified`, `consent_required`, `demo_disabled` |
| 404 | `not_found` |
| 409 | `conflict`, `invalid_transition`, `not_pending`, `documents_missing`, `not_released`, `consulate_not_open`, `consulate_complete`, `email_taken` |
| 422 | `validation_error`, `validation_failed`, `weak_password`, `invalid_token`, `invalid_emirates_id`, `passport_number_required` |
| 423 | `account_locked` |
| 429 | `rate_limited` |
| 503 | `service_unavailable`, `tts_unavailable`, `stt_unavailable`, `elevenlabs_not_configured` |

**Tracing headers.** Every response carries `X-Request-ID` (echoed if the client sent one) and `X-Trace-ID`.

**Pagination.** List endpoints that page return `{"items": [...], "total": n, "limit": n, "offset": n}`.

**Case references.** `{ref}` accepts a case reference (`LL-2026-000001`, `LL-DEMO-001`) or the case UUID.

**Server-Sent Events.** Browsers cannot set headers on `EventSource`, so SSE endpoints take the access token as a
query parameter: `?access_token=<jwt>`. The stream sends `event: ready`, then `event: case` messages
(`{"event_type", "case_id", "node_key", "source"}`) published after each commit, and a keep-alive comment every 15
seconds. Clients refetch the case when a message arrives.

## Health

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` (also `/api/v1/health`) | Public | Liveness: `{"status": "ok", "service", "uptime_seconds"}` |
| GET | `/ready` (also `/api/v1/ready`) | Public | Readiness: PostgreSQL required (`503` otherwise); Kafka, Redis, Neo4j, ElevenLabs, Langfuse, government adapters, email, SMS and telephony reported with their live or fallback mode; outbox backlog; worker heartbeats |
| GET | `/metrics` (also `/api/v1/metrics`) | Public | Prometheus metrics (`lifeloop_*`) |
| GET | `/` | Public | Links to docs, health, ready, metrics (not in the schema) |

In production, `/metrics` and `/ready` should be reachable only from the monitoring network
([Production](../deployment/production.md)).

## Auth

Prefix `/api/v1/auth`. Rate-limited routes allow `AUTH_RATE_LIMIT_PER_MINUTE` (20) per client.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/config` | Public | Verification policy, email transport, whether the dev mailbox is on, demo account emails (demo mode), password rules |
| POST | `/register` | Public, rate-limited | Register a **resident** and send a verification email. Password: at least 10 characters with a letter and a number |
| POST | `/login` | Public, rate-limited | Sign in. After `MAX_FAILED_LOGINS` (5) failures the account is locked for `LOCKOUT_MINUTES` (15). Unknown emails take the same time as wrong passwords |
| POST | `/refresh` | Public (refresh token), rate-limited | Rotate: the old refresh token is revoked, new tokens issued |
| POST | `/logout` | User | Revoke the access token and, if given, the refresh token (`204`) |
| GET | `/me` | User | Current user |
| PATCH | `/me` | User | Update name, phone, preferred language |
| POST | `/verify-email` | Public (token) | Confirm an email address with the single-use emailed token |
| POST | `/resend-verification` | User, rate-limited | Send a new verification email (older links stop working) |
| POST | `/forgot-password` | Public, rate-limited | Always `202`, whether or not the account exists |
| POST | `/reset-password` | Public (token), rate-limited | Set a new password with the single-use token (valid `PASSWORD_RESET_TTL_MINUTES`, 60) |
| POST | `/accept-invite` | Public (token), rate-limited | Activate an account provisioned by an admin (token valid `INVITATION_TTL_HOURS`, 72) |
| POST | `/change-password` | User | Change password; tokens issued before the change stop working; new tokens returned |

Email links are single-use: only the SHA-256 hash of each token is stored, and issuing a new link invalidates older
unused ones.

## Users and organisations

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/users` | Admin | List accounts (filter by role, organisation, text) |
| POST | `/api/v1/users` | Admin | Provision an OFFICER or ADMIN account and email an invitation (officers must belong to a service centre) |
| PATCH | `/api/v1/users/{user_id}` | Admin | Change role, organisation, title, name or active state (an admin cannot remove their own admin access) |
| POST | `/api/v1/users/{user_id}/invitation` | Admin | Resend an invitation |
| GET | `/api/v1/officers` | Staff | Active officers (transfer targets) |
| GET | `/api/v1/organizations` | Staff | Organisations |
| POST | `/api/v1/organizations` | Admin | Create an organisation (`PLATFORM` or `SERVICE_CENTRE`) |

## Cases

Prefix `/api/v1/cases`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/cases` | User | Cases visible to the caller: resident their own, officer their service centre, admin all. `status=active`, `q`, `limit`, `offset` |
| POST | `/api/v1/cases` | Resident (email verified) | Open a case from the web intake; same service the voice agent uses; idempotent. Email verification gates only this web intake; voice callers are identified by session or phone and verification |
| GET | `/{ref}` | Resident or Staff | Case detail: progress, deadline, current node, attention nodes, next action, outstanding documents, consent, opt-out, passport write-log counts, summary (`?lang=`). Staff views are audited |
| GET | `/{ref}/graph` | Resident or Staff | Life-Event Graph snapshot (PostgreSQL) with the Neo4j projection mode; step text in the reader's language with `?lang=` (English by default) |
| GET | `/{ref}/graph/impact/{node_key}` | Resident or Staff | Downstream services held up by a node (Neo4j, PostgreSQL fallback) |
| GET | `/{ref}/timeline` | Resident or Staff | Timeline events with source, actor, status, "resident present", i18n key (paged) |
| GET | `/{ref}/documents` | Resident or Staff | Document Center grouped by category, with counts and a disclaimer (`?lang=`) |
| POST | `/{ref}/documents/{doc_type}` | Resident or Staff | Upload (multipart `file`): PDF, PNG or JPEG only, magic-number checked, up to `MAX_UPLOAD_MB` (10) |
| POST | `/{ref}/documents/{doc_type}/verify` | Staff | Officer check of an uploaded document (not a government verification) |
| PATCH | `/{ref}/documents/{doc_type}` | Staff | Set status: REQUIRED, MISSING, EXPIRED, NOT_APPLICABLE |
| GET | `/{ref}/consent` | Resident or Staff | Consent records (token presence, never the token) |
| POST | `/{ref}/consent` | Resident (owner) | Grant or withdraw a consent (`CALLBACK`, `DATA_PROCESSING`, `SERVICE_FILING`) |
| POST | `/{ref}/opt-out` | Resident (owner) | "Stop calling": cancel callbacks, switch to SMS-only |
| POST | `/{ref}/opt-in` | Resident (owner) | Turn voice callbacks back on with a fresh consent token |
| GET | `/{ref}/verification` | Resident or Staff | Verification attempts |
| POST | `/{ref}/verification` | Resident or Staff | Verify with UAE Pass (simulated) or date of birth + hospital, optionally for a `call_id` |
| GET | `/{ref}/callbacks` | Resident or Staff | Callbacks for the case |
| POST | `/{ref}/callbacks` | Resident or Staff | Request a callback now (consent and opt-out enforced) |
| POST | `/{ref}/consulate` | Resident (owner) | Report a consulate milestone (parent-reported) |
| GET | `/{ref}/requests` | Resident or Staff | Entity requests and authority statuses (mock) |
| GET | `/{ref}/calls` | Resident or Staff | Calls on the case (without transcripts) |
| GET | `/{ref}/events` | Resident or Staff | Outbox events for the case (type, topic, status, attempts) |
| GET | `/{ref}/events/stream?access_token=` | Token in query | SSE for one case |
| GET | `/api/v1/events/stream?access_token=` | Token in query | SSE for every case the caller can see |

## Agent

Prefix `/api/v1/agent` ([`agent.py`](../../backend/app/api/v1/agent.py)).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/config` | User | Voice provider status, languages (with RTL flags), tool catalogue, orchestrator and conversation graphs. No secrets |
| POST | `/calls` | Resident | Start a call (`language`, optional `case_reference`). The disclosure is written first. Returns the call and the transport (`simulated`, or `elevenlabs` with a signed URL and dynamic variables) |
| GET | `/calls` | Resident | My calls |
| GET | `/calls/ringing` | User | Callbacks currently ringing for me |
| GET | `/calls/{call_id}` | User (owner or staff of the case) | One call with its redacted transcript |
| POST | `/calls/{call_id}/answer` | Resident (owner) | Answer a ringing callback; the callback disclosure is written first |
| POST | `/calls/{call_id}/turn` | Resident (owner), rate-limited | One utterance → agent reply (simulated channel only) |
| POST | `/calls/{call_id}/end` | Resident (owner) | End, or decline a ringing call |
| POST | `/calls/{call_id}/mute` | Resident (owner) | Mute or unmute |
| POST | `/calls/{call_id}/language` | Resident (owner) | Change the call language (also updates the case) |
| POST | `/calls/{call_id}/human` | Resident (owner) | Ask for a person: warm transfer (simulated channel) |
| POST | `/calls/{call_id}/stop-calling` | Resident (owner) | "Stop calling" (simulated channel) |
| POST | `/calls/{call_id}/uae-pass` | Resident (owner) | Approve verification with UAE Pass (simulated one-tap) |
| POST | `/calls/{call_id}/transcript` | Resident (owner) | Browser ElevenLabs sessions stream transcript turns for the live console (the webhook is authoritative) |
| POST | `/tools/{tool_name}` | Tool secret | ElevenLabs server-tool endpoint (body: `lifeloop_call_id`, `arguments`) |
| POST | `/webhooks/elevenlabs` | Signature | ElevenLabs post-call webhook (HMAC, replay window, idempotent) |
| POST | `/webhooks/elevenlabs/initiation` | Tool secret | ElevenLabs conversation-initiation webhook for calls to the life-event number (body: `caller_id`, optional `agent_id`, `called_number`, `call_sid`). Matches or creates the resident by caller ID, creates an unverified call, records the disclosure, returns `conversation_initiation_client_data` with `lifeloop_call_id` and the disclosure as `first_message` |
| POST | `/tts` | User | Eleven v3 text-to-speech (`audio/mpeg`); `503 tts_unavailable` without a key and voice |
| POST | `/stt` | User | Scribe v2 speech-to-text (multipart `audio`, `?language=`), up to 10 MB |
| GET | `/testing/definitions` | Staff | The seven ElevenLabs Agent Testing definitions |
| POST | `/testing/run` | Staff | Run the ten-scenario guardrail suite (isolated, rolled back) |
| POST | `/testing/sync` | Admin | Create the seven Agent Testing definitions in the ElevenLabs workspace and run them against `ELEVENLABS_AGENT_ID` (`503 elevenlabs_not_configured` without credentials) |
| POST | `/sync?dry_run=true` | Admin | Return the ElevenLabs agent config built from code; `dry_run=false` creates or updates the agent |
| GET | `/sessions/{call_id}` | User (owner or staff of the case) | LangGraph conversation state and path for a call (slots omitted) |

The `human`, `stop-calling` and `uae-pass` shortcuts submit a fixed utterance through the simulated dialog engine, so
they return `409` on a call handled by ElevenLabs; there, the agent's own tools do the same thing.

## Officer dashboard

Prefix `/api/v1/officer`. Every route requires Staff; every case action also checks the officer's service centre
([`officer.py`](../../backend/app/api/v1/officer.py)).

| Method | Path | Purpose |
|---|---|---|
| GET | `/stats` | Queue counts |
| GET | `/cases?queue=all\|pending\|blocked\|stalled\|escalations\|active\|completed` | Case list with risk, SLA and the officer action needed (`RELEASE` or `REVIEW`) |
| GET | `/cases/{ref}` | Everything needed to decide in one call: case, graph, timeline, documents, calls with transcripts, consents, opt-outs, verification, entity requests, approvals, reviews, escalations, callbacks, audit, orchestrator runs, extracted fields (the view is audited) |
| GET | `/approvals` | Submissions awaiting release, with the minimised field preview |
| POST | `/approvals/{approval_id}/approve` | **Approve and Release** (optional `note`); refuses if no longer pending or documents are missing |
| POST | `/approvals/{approval_id}/reject` | Reject with a required `reason`; the node becomes BLOCKED |
| POST | `/cases/{ref}/request-documents` | Request documents for a node (`node_key`, `documents`, `note`) |
| POST | `/cases/{ref}/escalate` | Escalate (`OFFICER_REFERRAL`, `DISPUTED_RECORD`, `SLA_STALL`, `CONSULATE_STALL`) |
| POST | `/cases/{ref}/transfer` | Transfer to another active officer (`to_officer_id`, `note`) |
| POST | `/cases/{ref}/notes` | Add an officer note (audited) |
| POST | `/cases/{ref}/nodes/{node_key}/retry` | Retry a submission that stalled before reaching the authority |
| POST | `/cases/{ref}/nodes/{node_key}/prepare` | Re-prepare a blocked or rejected node for release |
| GET | `/escalations?include_resolved=` | Escalation queue (warm handovers) |
| POST | `/escalations/{escalation_id}/take` | Take an escalation |
| POST | `/escalations/{escalation_id}/resolve` | Resolve with a `resolution` |
| GET | `/callbacks` | Callbacks across the service centre |
| GET | `/audit?case=&action=&actor_type=` | Audit log (paged) |
| GET | `/analytics` | Canvas KPIs (baseline 6 / 7 / 6, target 1 / 2 / 1) with values measured on demo cases, labelled "DEMO / SIMULATED"; case, node, callback and escalation breakdowns; bottlenecks (Neo4j or PostgreSQL) |

## Entities

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/entities` | User | Every (mock) authority with its contract: service, required fields, required documents, SLA, published fee and source, `has_api`, `has_status_feed`, current failure mode. Labelled DEMO / MOCK |
| GET | `/api/v1/entities/{entity}/requests` | Staff | Requests filed with one authority (organisation-scoped for officers) |

## Demo

Prefix `/api/v1/demo`. Auth: Demo. Every control drives the real pipeline ([Government adapters](../integrations/government-adapters.md#driving-a-mock-authority-demo)).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/demo` | Controls per node, failure switches, outbox counts, broker state, recent events, mock SMS outbox |
| POST | `/cases/{ref}/nodes/{node_key}/{action}` | Drive a node: release, authority outcome or parent-reported milestone |
| POST | `/cases/{ref}/callback` | Trigger a callback now (consent and opt-out still enforced) |
| POST | `/cases/{ref}/escalate` | Trigger an escalation (`SLA_STALL`, `CONSULATE_STALL`, `DISTRESS`, `APPROVAL_QUESTION`, `DISPUTED_RECORD`, `RESIDENT_REQUEST`) |
| POST | `/cases/{ref}/webhook` | Send an ElevenLabs-format post-call webhook through the real verification path |
| POST | `/failures` | Simulate a `government` (per entity, `unavailable`/`timeout`/`malformed`), `kafka` or `elevenlabs` failure |
| POST | `/reset` | Rebuild `LL-DEMO-001` from scratch (real pipeline on a backdated clock) and clear failure switches |
| GET | `/outbox?status=` | Outbox rows (event inspector) |

## Notifications, knowledge, development

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/notifications?unread=` | User | My notifications (in-app, SMS, email; mock channels labelled) |
| POST | `/api/v1/notifications/{id}/read` | User (owner) | Mark one read |
| POST | `/api/v1/notifications/read-all` | User | Mark all read |
| GET | `/api/v1/knowledge` | User | The read-only knowledge base (the agent's RAG source) |
| GET | `/api/v1/knowledge/search?q=` | User | Search; returns documents and any sourced fee |
| GET | `/api/v1/dev/mailbox?email=` | Public, **development only** | Emails captured by the console transport (verification, reset and invitation links). Returns `404` unless `ENVIRONMENT` is development or test and the console email backend is active. Not in the OpenAPI schema |

## Related

- [Agent tools](../agent/tools.md)
- [Threat model](../security/threat-model.md)
- [Local development](../deployment/local-development.md)

[Documentation index](../README.md)
