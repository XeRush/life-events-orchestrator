# API reference

Interactive docs: **Swagger** `http://localhost:8000/docs` · **ReDoc** `http://localhost:8000/redoc` · OpenAPI `http://localhost:8000/openapi.json`.

Base path `/api/v1` (mock authority APIs live at `/mock/entities`). JSON everywhere. Auth is `Authorization: Bearer <access_token>` unless noted. Roles: `RESIDENT`, `OPERATOR`, `GOVERNMENT_ENTITY`, `ADMIN`; residents only see their own cases, operators/admins see all.

**Errors** are uniform: `{"error": {"code": "invalid_transition", "message": "..."}}` with status 401 (auth), 403 (role/ownership/consent), 404, 409 (state conflict), 422 (validation / unsupported event type), 429 (rate limit). Validation errors add `details`.

## Auth

| Method | Path | Purpose | Auth |
|---|---|---|---|
| POST | `/auth/register` | Create a resident account, returns tokens | none |
| POST | `/auth/login` | Email + password -> `{access_token, refresh_token, expires_in}` | none |
| POST | `/auth/refresh` | Rotate a refresh token (old one is revoked; replay -> 401) | refresh token in body |
| POST | `/auth/logout` | Revoke the access token (and optional refresh token) | bearer |
| GET / PATCH | `/auth/me` | Current user / update name, phone, language | bearer |

```bash
curl -s -X POST localhost:8000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"demo@lifeloop.example","password":"demo1234"}'
```

Seeded demo user: `demo@lifeloop.example` / `demo1234` (role `ADMIN`).

## Cases

`{case_id}` accepts a UUID **or** a reference such as `L-49281`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/cases` | Create a case. Body: `event_type`, `event_date`, `participants`, `preferences`, `consent_service_initiation`, `consent_callback`, `consent_data_processing`, `idempotency_key`. With service-initiation consent the workflow starts immediately (201); otherwise `PENDING_CONSENT`. 422 `unsupported_event_type` for definition-only templates. |
| GET | `/cases?status=&limit=&offset=` | List (paginated) |
| GET | `/cases/{id}` | Case with progress, current stage, waiting-on, plain-language summary |
| GET | `/cases/{id}/snapshot` | Backend-verified facts (what the voice agent reads) |
| GET | `/cases/{id}/tasks` | Service tasks |
| GET | `/cases/{id}/graph` | Dependency graph built from persisted tasks + dependencies (`nodes`, `edges`, layers) |
| GET | `/cases/{id}/passport` | Zero-repetition passport: identity, event, participants, consents, preferences, documents, services, state, timeline, conversations |
| POST | `/cases/{id}/pause` `/resume` `/escalate` | Lifecycle (409 when not allowed) |
| POST | `/cases/{id}/callback` | Request a callback `{reason, when}` (`tomorrow`, `in 2 hours`, ISO) |
| GET | `/life-events` | Templates (`is_configured`) |
| GET | `/life-events/{code}/graph` | Definition graph of a template |

```bash
curl -s -X POST localhost:8000/api/v1/cases -H "Authorization: Bearer $T" -H 'content-type: application/json' -d '{
  "event_type":"BIRTH","event_date":"2026-09-20",
  "participants":[{"role":"child","name":"Baby"}],
  "consent_service_initiation":true,"consent_callback":true,"consent_data_processing":true}'
```

## Consent, timeline, documents, tasks

| Method | Path | Purpose |
|---|---|---|
| POST | `/cases/{id}/consent` | `{consent_type, granted, scope?, source?}`. Granting `SERVICE_INITIATION_CONSENT` on a `PENDING_CONSENT` case generates the workflow. Idempotent per state. |
| GET | `/cases/{id}/consents` | Consent history |
| GET | `/cases/{id}/timeline?order=asc&limit=&offset=` | Persisted timeline (paginated) |
| GET | `/timeline` | Digital life timeline across all the caller's life events |
| GET | `/cases/{id}/documents` | Document metadata |
| POST | `/cases/{id}/documents/record` | `{doc_type, name?, task_id?}` - metadata only; matches an outstanding request and resumes the task when all requested documents are in |
| POST | `/cases/{id}/documents` | Multipart upload (`doc_type`, `file`, max 5 MB); stored via the storage abstraction |
| GET | `/tasks/{task_id}` | One task |

## Events and audit

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/events?case_id=&event_type=&task_id=&limit=&offset=` | Audit log, newest first, paginated | bearer (residents: own cases) |
| POST | `/events` | **Entity webhook ingest**: `{entity_code, reference, kind, idempotency_key, payload}`. `kind` = `ACKNOWLEDGED`, `COMPLETED`, `DELAYED`, `REJECTED`, `DOCUMENT_REQUIRED`. Returns `{applied, duplicate, event_type}`. Duplicates are acknowledged without side effects. | ADMIN / OPERATOR / GOVERNMENT_ENTITY |
| GET | `/events/stream?access_token=` | Server-Sent Events of committed domain events | token in query (EventSource cannot set headers) |

## Callbacks

| Method | Path | Purpose |
|---|---|---|
| GET | `/callbacks?status=&case_id=` | Callback center (reason, trigger, case, status, duration, outcome, script, updates) |
| GET | `/callbacks/{id}` | One callback |
| POST | `/callbacks/{id}/execute` | Place now (staff) |
| POST | `/callbacks/run-due` | Place all due (staff) |

## Voice

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/voice/config` | Active provider (never secrets) | bearer |
| POST | `/voice/sessions` | Start a session `{mode: inbound\|callback, case_id?, callback_id?}`. Returns ElevenLabs `signed_url` + `dynamic_variables` when configured, otherwise `opening_message` for the backend dialog engine | bearer |
| POST | `/voice/sessions/{id}/turn` | `{utterance}` -> `{reply, tool_calls, stage, case_reference}` (simulated channel) | bearer |
| POST | `/voice/sessions/{id}/transcript` | Browser pushes an ElevenLabs transcript | bearer |
| POST | `/voice/sessions/{id}/end` | End the call | bearer |
| GET | `/voice/conversations[/{id}]` | Call history / one transcript | bearer |
| POST | `/voice/webhook` | ElevenLabs post-call webhook (HMAC-verified when `ELEVENLABS_WEBHOOK_SECRET` set; duplicate deliveries ignored) | signature |
| POST | `/voice/tools/{tool_name}` | Agent tool endpoint (see [voice-agent.md](voice-agent.md)) | `X-LifeLoop-Tool-Secret` |
| GET | `/voice/agent` | The agent definition (prompt + tools) pushed to ElevenLabs | staff |
| POST | `/voice/agent/sync` | Create/update the ElevenLabs agent | admin |

## Dashboard, entities, demo

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/stats` | Counts (active, completed, waiting for resident, in progress, entity processing, callbacks), completion %, active cases, recent timeline, upcoming actions, recent callbacks |
| GET | `/entities` | Entity operations: incoming, processing, completed, delayed, rejected, average processing time, recent events (staff) |
| GET | `/demo/actions` | Demo control center actions (staff) |
| POST | `/demo/cases/{id}/actions/{action}` | Run an action through the real pipeline. Actions: `complete_birth_registration`, `issue_birth_certificate`, `start_identity`, `delay_identity`, `require_document`, `submit_document`, `approve_identity`, `reject_identity`, `start_health`, `complete_health`, `start_additional_services`, `complete_additional_services`, `trigger_callback`, `replan_workflow` |
| POST | `/demo/reset` | Reset case L-49281 (admin) |
| GET | `/health`, `/health/ready` | Liveness / readiness (DB check) |

## Mock government entities (`/mock/entities`)

Slugs: `birth-registration`, `identity`, `health`, `additional-services`. Auth: ADMIN / OPERATOR / GOVERNMENT_ENTITY.

| Method | Path | Purpose |
|---|---|---|
| GET | `/mock/entities` | Entities and service catalogs |
| POST | `/mock/entities/{slug}/applications` | Entity intake `{case_reference, service_code, idempotency_key}` (idempotent) |
| GET | `/mock/entities/{slug}/applications/{reference}` | Authority-side status and history |
| POST | `/mock/entities/{slug}/simulate-start` `simulate-complete` `simulate-delay` `simulate-rejection` `simulate-document-required` | Body: `application_id` **or** `case_id` + `service_code`; optional `hours`, `reason`, `retryable`, `documents`. Each changes the authority's own state, then delivers its webhook through `ingest_entity_event`, emitting the real domain events. |

```bash
curl -s -X POST localhost:8000/mock/entities/identity/simulate-document-required \
  -H "Authorization: Bearer $T" -H 'content-type: application/json' \
  -d '{"case_id":"L-49281","service_code":"IDENTITY_APPLICATION"}'
```
