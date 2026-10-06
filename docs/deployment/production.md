# From prototype to production

LifeLoop is a prototype built for the "Ignyte × ElevenLabs Voice Agent Challenge". **It is not production-ready and
is not connected to any real government system.** This page lists what would change before a real pilot with
Digital Dubai and GDRFA-Dubai (the buyers named in canvas box E). It is a plan, not a description of the current
build.

## What already carries over

These parts were built to survive the move to production unchanged:

- The **integration contract** each authority would implement ([Government adapters](../integrations/government-adapters.md#the-contract)),
  including data minimisation (`allowed_fields`) and idempotent submission.
- The **human gate**: no code path releases a filing without an officer of the case's service centre.
- The **transactional outbox**, consumer receipts and dead-lettering, which are independent of the broker size.
- **Alembic-only schema changes**, with an advisory lock so several replicas can start at once.
- **Fail-closed production guards** already in [`config.py`](../../backend/app/core/config.py): with
  `ENVIRONMENT=production`, start-up fails if `JWT_SECRET` is the development value or shorter than 32 characters,
  if `VOICE_TOOL_SECRET` is the default, or if `PII_HASH_KEY` is shorter than 32 characters; unsigned ElevenLabs webhooks are rejected; HSTS is added; the dev mailbox
  is disabled; demo users are not created without `DEMO_USER_PASSWORD`.

## What would change

| Area | Prototype | Production |
|---|---|---|
| Government integrations | DEMO / MOCK adapters with simulated approvals | Real adapters per authority (DHA, MOHAP, DOH, MOFA, GDRFA-Dubai, ICP, insurers via DHA eClaimLink), each under a signed data-sharing and integration contract with the authority, using the published contract unchanged. Mutual TLS or the authority's mandated gateway; per-authority credentials; status webhooks where an authority offers them, polling otherwise |
| Consulate | Parent-reported only | Unchanged by design: a foreign mission has no API. Bilateral consulate integrations would be a separate track |
| Identity | Email + password accounts; **UAE Pass simulated** as a one-tap button | Real UAE Pass integration (OIDC) for residents, for sign-in and for callback verification through the UAE Pass mobile approval flow; officer accounts federated with the service centre's identity provider |
| Secrets | `.env` file | A secrets manager (for example a cloud KMS-backed store) for `JWT_SECRET`, `PII_HASH_KEY`, `VOICE_TOOL_SECRET`, `ELEVENLABS_*`, `TWILIO_*`, `LANGFUSE_*`, Gmail or institutional email credentials, database credentials; rotation runbooks |
| Keyed hashing | Emirates IDs are hashed with `PII_HASH_KEY`, independent of `JWT_SECRET` (development falls back to `JWT_SECRET` when it is unset) | The key held in an HSM or KMS, with a documented rotation and re-capture procedure (stored hashes cannot be re-keyed because raw IDs are never stored) |
| Hosting | One Docker host (the backend container already runs as a non-root user, with Uvicorn `--proxy-headers` for a reverse proxy) | Multiple backend replicas behind a load balancer; workers (relay, consumers, dialler, poller, SLA watchdog) as separate processes or deployments; managed PostgreSQL with high availability and point-in-time recovery |
| Kafka | Single KRaft node, replication factor 1 | A multi-broker cluster (replication factor 3, `min.insync.replicas` 2), TLS and SASL, topic ACLs per consumer, a real dead-letter topic and a re-drive tool |
| Redis | Single instance, no auth, append-only persistence to a local volume | Authenticated, TLS, highly available; no persistence of the short-lived personal-data keys |
| Neo4j | Single community instance | Optional; if kept, a managed or enterprise deployment, still without personal data |
| Server-Sent Events | In-process hub | Redis pub/sub (or similar) so every replica sees every event; the API stays the same |
| Edge | Uvicorn behind Vite preview / a dev proxy | TLS termination, a WAF, DDoS protection, request size limits, rate limiting at the edge, `/metrics` and `/ready` restricted to the monitoring network, strict CORS |
| Data residency | Wherever the Docker host runs | UAE data residency for case data, transcripts, logs, traces and backups, in line with the authorities' and TDRA's requirements; a self-hosted Langfuse in region; a reviewed data-processing agreement with ElevenLabs covering where call audio and transcripts are processed and retained |
| Voice | ElevenLabs agent synced from code; browser console for evaluators; phone line and phone callbacks bound to LifeLoop calls when a Twilio / SIP number is configured | Phone-first on an official, published life-event number with caller ID published on the entity's site (canvas box N); real UAE Pass verification at the start of phone calls; a live audio transfer to officers ([Telephony known gaps](../integrations/telephony.md#known-gaps)) |
| SMS | Twilio or mock, outbound only | An approved sender ID; inbound SMS handling ("Reply CALL") |
| Email | Gmail API or console | Institutional email service with SPF, DKIM and DMARC |
| Documents | Local disk (`STORAGE_DIR`) | Encrypted object storage with malware scanning, retention rules and signed, short-lived download URLs |
| Encryption at rest | Whatever the host provides | Encrypted database, volumes, backups and object storage with managed keys |
| Observability | JSON logs, Prometheus endpoint, optional Langfuse | Central log store with retention policy, dashboards and alerts on `/ready`, outbox backlog, dead letters, consumer lag, callback failures and SLA breaches |
| Agent quality | Agent Testing suite run on demand | Agent Testing as a release gate in CI for every agent and prompt change, plus the ElevenLabs Agent Testing suite run against the live agent |
| Demo controls | `DEMO_MODE=true` | `DEMO_MODE=false`: every `/api/v1/demo` route returns `403` |
| Compliance | Prototype | DPIA, penetration test, accessibility review, Arabic content review, records-retention schedule, incident-response drills |

## Configuration checklist for any non-development deployment

- `ENVIRONMENT=production`
- `JWT_SECRET`: random, at least 32 characters (start-up fails otherwise)
- `PII_HASH_KEY`: random, at least 32 characters, different from `JWT_SECRET` (start-up fails otherwise)
- `VOICE_TOOL_SECRET`: random (start-up fails if left at the default); the same value on the ElevenLabs server tools
  and conversation-initiation webhook
- `ELEVENLABS_WEBHOOK_SECRET`: set (webhooks are rejected otherwise)
- `DEMO_MODE=false`, `SEED_DEMO_DATA=false`
- `CORS_ORIGINS`, `PUBLIC_BASE_URL` and `FRONTEND_URL` set to the real HTTPS origins
- `LOG_LEVEL=INFO`, `LOG_JSON=true`
- `REQUIRE_EMAIL_VERIFICATION=true`

## Related

- [Threat model](../security/threat-model.md)
- [Incident response](../security/incident-response.md)
- [Docker](docker.md)
- [SECURITY.md](../../SECURITY.md)

[Documentation index](../README.md)
