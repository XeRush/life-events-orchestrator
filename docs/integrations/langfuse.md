# Langfuse

LifeLoop traces agent runs, LangGraph nodes, tool calls and integration calls. With Langfuse credentials the spans
go to Langfuse (Python SDK v4); without them, or if Langfuse is down, the same spans become structured log lines
and a small in-memory buffer. Personal data is redacted **before** anything leaves the process
([`tracing.py`](../../backend/app/observability/tracing.py)).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `LANGFUSE_PUBLIC_KEY` | empty | Both keys set enables Langfuse |
| `LANGFUSE_SECRET_KEY` | empty | |
| `LANGFUSE_HOST` | `https://cloud.langfuse.com` | Langfuse Cloud or a self-hosted instance |

The client is created with `environment = ENVIRONMENT` and release `0.2.0`. `/ready` reports
`dependencies.langfuse.backend` (`langfuse` or `local`), whether it is configured, and the number of recent spans
held locally.

For UAE data-residency requirements, a production deployment would point `LANGFUSE_HOST` at a self-hosted Langfuse
inside the permitted region (see [Production](../deployment/production.md)).

## What is traced

| Span name | Kind | Where | Inputs / outputs (after redaction) |
|---|---|---|---|
| `langgraph.conversation.turn` | agent | Each simulated voice turn ([`call_service.py`](../../backend/app/services/call_service.py)) | Utterance; reply, tools called, graph path |
| `langgraph.orchestrator.<NODE>` | chain | Each orchestrator node ([`case_orchestrator.py`](../../backend/app/workflows/case_orchestrator.py)) | Unlockable nodes, plan, actions, escalate, complete |
| `tool.<name>` | tool | Each agent tool call ([`tools.py`](../../backend/app/agents/tools.py)) | Validated arguments; `ok`, `error`, `state`, `reference` |
| `adapter.<ENTITY>.submit` | tool | Each authority submission ([`entity_service.py`](../../backend/app/services/entity_service.py)) | Field **names** only; external reference and status, or the error |

Spans carry `case_id` and, for calls, `session_id` (the call id) as metadata, so one case or one call can be followed
across spans. The request's trace id is also returned in the `X-Trace-ID` response header and stored on outbox
events, timeline entries and audit records.

## Redaction

Two layers, both applied before data leaves the process:

1. **`redact_value`** ([`pii.py`](../../backend/app/core/pii.py)) on every span input, output, metadata and error:
   - values under keys containing `password`, `token`, `secret`, `api_key`, `authorization`, `signature`, `cookie`,
     `emirates_id`, `eid`, `passport_number`, `otp`, `credential`, `private_key`, `audio` or `recording` become
     `[REDACTED]` (keys ending in `_present`, `_last4`, `_hash`, `_status` or `_at` are kept);
   - phone and email fields are masked;
   - free text is scrubbed: Emirates IDs → `[EMIRATES_ID]`, long digit runs → `[NUMBER]`, passport-like numbers →
     `[PASSPORT]`, phone numbers → `[PHONE]`, emails → `a•••@domain`, bearer tokens and JWTs removed.
2. **The Langfuse `mask` hook**: the client is constructed with `mask=lambda *, data, **_: redact_value(data)`, so
   anything the SDK captures is redacted again.

For example, the `create_case` tool span shows `father_emirates_id: "[REDACTED]"`, and a turn in which the parent
reads an Emirates ID shows `[EMIRATES_ID]` in the utterance.

## Local fallback

Without Langfuse, each span is logged as a structured `span` event (name, kind, trace id, duration, status, and the
`case_id`, `tool`, `node` and `error` metadata) and kept in a 200-entry in-memory ring buffer. Observability never
breaks a request: any Langfuse error is logged as a warning and the span continues locally.

## Related

- [PII handling](../security/pii-handling.md)
- [Threat model](../security/threat-model.md)
- [Agent tools](../agent/tools.md)

[Documentation index](../README.md)
