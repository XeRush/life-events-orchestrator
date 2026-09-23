# Event model

## Bus abstraction

```python
class EventBus(ABC):
    async def publish(self, event_type, **kwargs) -> Event | None   # None = duplicate idempotency key
    async def drain(self) -> int                                     # run handlers until the queue is empty
```

`PostgresEventBus` persists each event to the `events` table (the audit log **and** the outbox), queues it, and dispatches to handlers registered with `@subscribe(...)` in `events/handlers.py`. Handlers run in registration order inside the caller's transaction:

1. `write_timeline` (every event)
2. `start_workflow_on_consent` (`CONSENT_CAPTURED`)
3. `propagate_completion` (`TASK_COMPLETED`)
4. `hold_dependants` (`TASK_DELAYED`), `replan_rejection` (`TASK_REJECTED`), `escalate_failure` (`TASK_FAILED`)
5. `register_document_request` (`DOCUMENT_REQUIRED`), `resume_after_document` (`DOCUMENT_RECEIVED`)
6. `decide_callback` (events the notification policy may care about)

`ServiceContainer.commit()` = drain -> commit -> notify SSE subscribers. `events/consumers.py` re-dispatches events stuck `processed = false` (crash recovery). To move to Kafka/Redis, implement `EventBus` and keep `subscribe`.

## Event catalogue

| Event | Emitted when | Timeline | Callback |
|---|---|---|---|
| `LIFE_EVENT_CREATED` | Case created | yes | no |
| `CONSENT_CAPTURED` | Consent granted/declined/revoked | yes | no |
| `TASK_CREATED` | Workflow instantiated | no | no |
| `TASK_STARTED` | Submitted to an authority | yes | no |
| `TASK_PROCESSING` | Authority accepted | yes | **no** |
| `TASK_COMPLETED` | Authority confirmed | yes (not system nodes) | **yes** (milestone) |
| `TASK_DELAYED` | Authority reports delay | yes | only if >= 72h |
| `TASK_REJECTED` | Authority rejects | yes | via replan decision |
| `TASK_FAILED` | Submission failed permanently | yes | via escalation |
| `TASK_RESUMED` | Documents received, task continues | yes | no |
| `TASK_CANCELLED` | Replaced by alternative | no | no |
| `DOCUMENT_REQUIRED` | Authority needs information | yes | **yes** |
| `DOCUMENT_RECEIVED` | Resident provided a document | yes | no |
| `DEPENDENCY_RESOLVED` | Prerequisites complete | yes | no (covered by milestone) |
| `DEPENDENCY_BLOCKED` | Dependants held by a delay | no | no |
| `WORKFLOW_REPLANNED` | Retry / alternative / wait / re-evaluate | yes | if `notify_resident` |
| `CALLBACK_REQUIRED` | Callback scheduled | yes | - |
| `CALLBACK_COMPLETED` | Call finished | yes | - |
| `CASE_PAUSED` / `CASE_RESUMED` | Resident/operator action | yes | no |
| `CASE_ESCALATED` | Human officer needed | yes | **yes** |
| `CASE_COMPLETED` | All services complete | yes | **yes** |
| `RESIDENT_DEFERRED` | Resident cannot provide something now | yes | no |

## Audit fields (`events`)

`created_at` (timestamp), `actor`, `actor_type` (`SYSTEM`, `AI_AGENT`, `RESIDENT`, `GOVERNMENT_ENTITY`, `ADMIN`), `case_id`, `task_id`, `event_type`, `old_state`, `new_state`, `metadata` (JSON), `source`, `idempotency_key`, `processed`, `error`. Indexed on `case_id`, `event_type`, `task_id`, `processed`. The API never returns the whole log by default: `GET /events` is paginated (default 50, max 200).

## Notification policy

`NotificationPolicy.decide(event)` in `callback_service.py`. A call requires: a qualifying event, **callback consent**, and a case that is not paused. Qualifying events are coalesced into any `SCHEDULED` callback for the case (window `CALLBACK_DELAY_SECONDS`, default 4s) so the resident receives one call carrying every update. Suppressed calls are logged and, for missing consent, recorded on the timeline.

## Live updates

After commit the container publishes `{event_type, case_id, task_id}` to the in-process `EventHub`; `GET /events/stream` (SSE) forwards them (residents only see their own cases). The frontend invalidates its TanStack Query cache on each message and also polls every 6 seconds as a safety net.
