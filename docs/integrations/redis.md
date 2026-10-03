# Redis

Redis holds only short-lived, reconstructible data. PostgreSQL stays the source of truth for case state: losing
Redis loses nothing that matters for a case ([`cache.py`](../../backend/app/integrations/cache/cache.py)).

## Configuration and fallback

| Variable | Default | Purpose |
|---|---|---|
| `REDIS_URL` | empty | Compose sets `redis://redis:6379/0` for the backend container; `.env.example` sets `redis://localhost:6379/0` for host runs. Empty means the in-process memory cache |

`CacheManager` connects at start-up (2 s socket timeouts). If `REDIS_URL` is empty the mode is `memory`; if Redis
is unreachable the mode is `memory-fallback`. If a Redis call fails later, that call is served from memory and the
dependency is reported degraded. `/ready` shows `dependencies.redis` with `mode`, `healthy`, `fallback` and
`last_error`; the metric is `lifeloop_dependency_up{dependency="redis"}`.

The memory cache is per process. With more than one backend replica, rate limits, verification counters and
webhook nonces are only correct with Redis.

## What is stored

| Key pattern | Content | TTL | Written by |
|---|---|---|---|
| `kb:documents:v1` | Parsed knowledge-base documents | 1 hour | [`knowledge_service.py`](../../backend/app/services/knowledge_service.py) |
| `case:summary:<case id>` | Reserved for a case summary snapshot. In this build the key is only invalidated (on every case or node event), never written | n/a | `graph-projection` consumer |
| `mockgov:<ENTITY>:<ref>` | A mock authority's application state (case reference, status, detail, missing documents, field **names**) | 60 days | [`base.py`](../../backend/app/integrations/government/base.py) |
| `rl:<kind>:<ip hash>:<window>` | Fixed-window rate-limit counters | 61 s | [`deps.py`](../../backend/app/api/deps.py) |
| `verify:<call id>` | Verification failures and result for a call | 1 hour | [`verification_service.py`](../../backend/app/services/verification_service.py) |
| `verify:dob:<call id>` | The spoken date of birth between the two verification questions | 10 minutes, deleted after use | [`graph.py`](../../backend/app/agents/dialog/graph.py) |
| `webhook:nonce:<sha256 of signature>` | Accepted webhook signatures (replay protection) | 2 × `WEBHOOK_TOLERANCE_SECONDS` | [`webhook_service.py`](../../backend/app/services/webhook_service.py) |

Two of these hold personal data briefly: the spoken date of birth during verification and the Emirates IDs during
intake. Both have short TTLs and are deleted as soon as they are used. Note that the Compose Redis runs with
append-only persistence (`--appendonly yes`, data in the `redisdata` volume), so these keys can reach the volume on
disk until they expire or are deleted. In production, Redis should require authentication and TLS, and the
short-lived personal-data keys should not be persisted; see [PII handling](../security/pii-handling.md).

## Rate limits

| Limit | Default | Applies to |
|---|---|---|
| `AUTH_RATE_LIMIT_PER_MINUTE` | 20 | Register, login, refresh, resend verification, forgot and reset password, accept invite (per client IP hash) |
| `RATE_LIMIT_PER_MINUTE` | 300 | Simulated voice turns (`POST /api/v1/agent/calls/{id}/turn`) |

Exceeding a limit returns `429 rate_limited`.

## Related

- [Docker](../deployment/docker.md)
- [Kafka](kafka.md)
- [Neo4j](neo4j.md)

[Documentation index](../README.md)

Not in Redis by design: Emirates IDs spoken during voice intake are held in process memory only (`intake:eid:<call id>`, 30 minutes, deleted after `create_case`), so they never reach Redis' append-only file.
