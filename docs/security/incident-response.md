# Incident response

LifeLoop is a prototype for the "Ignyte × ElevenLabs Voice Agent Challenge" and has no production users. This
runbook describes how the team would respond to a security or privacy incident in a deployed instance of the
prototype (a demo environment or a pilot), using the controls that exist in the code today. A real pilot would align
it with the operating authority's incident process and UAE notification obligations.

## Severity

| Level | Examples | Target response |
|---|---|---|
| Critical | Personal data exposed outside the system; a filing released without an officer; a secret leaked publicly | Contain immediately; notify the team lead and the deployment owner within 1 hour |
| High | Callbacks placed without consent or after opt-out; webhook or tool endpoint abused; account takeover | Contain within 4 hours |
| Medium | Dependency outage causing stalls; a guardrail violation found in a transcript (for example an invented status) | Same working day |
| Low | Misconfiguration with no data impact | Next planned change |

## 1. Detect

| Signal | Where |
|---|---|
| Dependency health, fallback modes, outbox backlog, worker heartbeats | `GET /ready` |
| Request rates, errors, tool calls, callback outcomes, dead letters, dependency status | `GET /metrics` (`lifeloop_http_requests_total`, `lifeloop_agent_tool_calls_total`, `lifeloop_callbacks_total`, `lifeloop_events_consumed_total{outcome="dead_letter"}`, `lifeloop_dependency_up`) |
| Denied actions and violations | `audit_logs` (`GET /api/v1/officer/audit`): `AgentToolDenied`, `CaseAccessDenied`, `*Denied` officer actions, `WebhookRejected`, `LoginFailed`, `AccountLocked`, `DisclosureMissing` |
| Every decision on a case | Case timeline and `officer_reviews` (`GET /api/v1/officer/cases/{ref}`) |
| Request correlation | `X-Request-ID` and `X-Trace-ID` on responses; the same ids in logs, audit rows, outbox events and traces |
| Agent behaviour | Agent Testing suite (`make agent-test`); transcripts on the officer case page |

## 2. Contain

| Situation | Action |
|---|---|
| Suspected leak of `VOICE_TOOL_SECRET` | Rotate it, re-sync the agent (`POST /api/v1/agent/sync?dry_run=false`) so the server tools send the new header, update the header on the conversation-initiation webhook in the ElevenLabs workspace, restart the backend. Until then, requests with the old secret fail closed (`401`) |
| Suspected leak of `ELEVENLABS_WEBHOOK_SECRET` | Rotate it in ElevenLabs and in the environment; restart |
| Suspected leak of `JWT_SECRET` | Rotate it and restart: every access and refresh token becomes invalid and all users sign in again. Emirates ID matching is unaffected when `PII_HASH_KEY` is set (production requires it); in development without it, the hash key falls back to `JWT_SECRET` |
| Suspected leak of `PII_HASH_KEY` | The key protects stored Emirates ID hashes against guessing. Rotating it means stored hashes no longer match newly captured IDs, and they cannot be re-hashed because the raw numbers are never stored; plan rotation with a re-capture step for open cases ([Production](../deployment/production.md)) |
| Leaked ElevenLabs, Twilio, Langfuse or Gmail credentials | Revoke in the provider console, replace in the environment, restart |
| Compromised user account | Deactivate it (`PATCH /api/v1/users/{id}` with `is_active: false`, admin): its tokens stop working on the next request. For a resident, a password reset also invalidates older tokens |
| Callbacks misbehaving | Stop the dialler: set `RUN_WORKERS=false` and restart (all workers stop), or opt the affected case out (`POST /api/v1/cases/{ref}/opt-out` as the resident) |
| Agent producing unsafe answers | Switch voice to the simulated channel by removing `ELEVENLABS_AGENT_ID` and restarting, fix the prompt, run the Agent Testing suite, re-sync |
| Demo controls exposed | Set `DEMO_MODE=false` and restart: every `/api/v1/demo` route returns `403` |
| A filing released in error | The officer cannot un-send a request to a real authority; in this prototype the authority is a mock. Record an officer note, escalate, and contact the authority through its own channel in a pilot |

## 3. Investigate

- Reconstruct the sequence from the case timeline, `audit_logs` (actor, action, result, trace id, request id, hashed
  client IP), `officer_reviews`, `approvals`, `entity_requests` (`fields_sent`, releasing officer) and `outbox_events`.
- For calls: `call_sessions`, redacted `transcripts`, `agent_sessions` (graph path and tools used), and the
  ElevenLabs conversation, if the call ran on ElevenLabs.
- For webhooks: `integration_events` (signature validity, idempotency key, status).
- Preserve evidence before cleaning up: export the relevant rows and logs.

## 4. Recover

- Re-drive dead-lettered events once the cause is fixed (manual in this prototype; see
  [Event-driven architecture](../architecture/event-driven-architecture.md#dead-letter)).
- Let the outbox drain after a broker outage; check `outbox_pending` returns to 0 in `/ready`.
- Retry stalled filings (`POST /api/v1/officer/cases/{ref}/nodes/{node_key}/retry`).
- Run the Agent Testing suite and the test suite before re-enabling anything that was turned off.

## 5. Notify and learn

- Notify affected residents in their language, through the app and SMS, with their case reference.
- In a pilot, notify the operating authority and follow UAE data-protection notification requirements.
- Write a short post-incident review: timeline, root cause, what detected it, what would have detected it sooner,
  follow-up changes (with owners).

## Reporting a vulnerability

See [SECURITY.md](../../SECURITY.md#reporting-a-vulnerability).

## Related

- [Threat model](threat-model.md)
- [PII handling](pii-handling.md)
- [Production](../deployment/production.md)

[Documentation index](../README.md)
