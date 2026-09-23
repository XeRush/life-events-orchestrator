# Security

| Area | Implementation |
|---|---|
| **Authentication** | JWT (HS256) access (30 min) + refresh (7 days) tokens; refresh **rotation** with replay protection; logout revokes tokens via a `revoked_tokens` denylist; wrong-type tokens rejected. |
| **Passwords** | bcrypt (12 rounds; 72-byte input cap), constant-time verification. |
| **RBAC** | `RESIDENT` (own cases only), `OPERATOR`, `GOVERNMENT_ENTITY` (entity webhooks/simulation), `ADMIN`. Ownership enforced in `CaseService.resolve`; staff-only routes via `require_roles`. Demo control, entity operations and voice-agent admin are role-gated. |
| **Input validation** | Pydantic v2 schemas (lengths, patterns, enums); uniform 422 payloads; upload cap 5 MB; storage keys sanitised against path traversal. |
| **Rate limiting** | `RateLimiter` abstraction (in-memory now; Redis-ready). Stricter limit on `/auth/*`, general limit on case/voice routes. |
| **CORS / headers** | Explicit allowed origins from env; `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cache-Control: no-store` (docs excluded). |
| **Secrets** | Environment only (`.env`, never committed). ElevenLabs keys live on the server; the browser receives only a short-lived signed URL. |
| **Webhooks** | ElevenLabs post-call webhook: HMAC-SHA256 `t=..,v0=..` with replay window; agent tools: shared secret header, constant-time compare. Duplicate deliveries are idempotent. |
| **Audit** | Every meaningful action is an `events` row: actor, actor type, case, task, before/after state, source, metadata. |
| **Logging** | structlog JSON; per-request `request_id`; key-based redaction of `password`, `token`, `secret`, `api_key`, `authorization`, `signature`. Case ids/task ids are logged, personal data and documents are not. |
| **AI guardrails** | The agent cannot approve, reject, decide eligibility or close unconfirmed cases (tool contracts + prompt). See [voice-agent.md](voice-agent.md). |
| **Consent** | First-class, versioned records. No submission before service-initiation consent; no proactive call without callback consent. |
| **Data minimisation** | Adapters receive a resident reference, event type/date and participant roles - not names or emails. |

## Known prototype limits / production checklist

- Replace the default `JWT_SECRET` and `VOICE_TOOL_SECRET`; store secrets in a manager.
- Serve behind TLS; consider httpOnly cookies instead of localStorage tokens for the SPA.
- Move rate limiting and the SSE hub to Redis for multi-instance deployments.
- Add malware scanning and object storage (KMS-encrypted) behind `FileStorage`.
- Real identity assurance (e.g. UAE Pass) instead of email/password; data-residency and retention policy; DPIA for voice recording.
- The mock authorities are unauthenticated beyond RBAC; real authorities need mutual TLS / signed webhooks.
