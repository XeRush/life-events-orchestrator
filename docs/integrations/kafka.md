# Kafka

Kafka carries LifeLoop's domain events from the transactional outbox to the consumers. It is optional: with
`KAFKA_BOOTSTRAP_SERVERS` empty or Kafka unreachable, an in-memory broker with the same contract takes over. The
event model itself (catalogue, outbox, consumers, dead-letter) is described in
[Event-driven architecture](../architecture/event-driven-architecture.md); this page covers the Kafka specifics.

## Deployment

Docker Compose runs a single `apache/kafka:3.9.1` node in **KRaft mode** (broker and controller in one process, no
ZooKeeper), with a health check and its data in the `kafkadata` volume:

| Listener | Address | Used by |
|---|---|---|
| `INTERNAL` | `kafka:19092` | The backend container and inter-broker traffic |
| `EXTERNAL` | `localhost:${KAFKA_PORT}` (default 9092) | A backend running on the host (`.env.example`: `KAFKA_BOOTSTRAP_SERVERS=localhost:9092`) and local tools |
| `CONTROLLER` | `kafka:9093` | KRaft quorum |

Auto-creation of topics is enabled (3 partitions), internal topics use replication factor 1, and the JVM heap is
capped at 512 MB. A single broker with replication factor 1 is a prototype setting; see
[Production](../deployment/production.md).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `KAFKA_BOOTSTRAP_SERVERS` | empty | Broker list. Empty means the in-memory broker |
| `KAFKA_CLIENT_ID` | `lifeloop-backend` | Client id (`-admin` and `-consumer` suffixes for those clients) |
| `KAFKA_CONSUMER_GROUP` | `lifeloop-workers` | Consumer group for all handlers |
| `CONSUMER_MAX_ATTEMPTS` | 3 | Attempts per handler before dead-lettering |
| `WORKER_POLL_SECONDS` | 0.5 | Relay idle poll interval (it is also woken after every commit) |

## Topics

Created at start-up by the admin client if missing, with **3 partitions** and **replication factor 1**
([`broker.py`](../../backend/app/events/broker.py)):

| Topic | Carries |
|---|---|
| `lifeloop.case.events` | Case lifecycle, officer decisions, every node transition |
| `lifeloop.case.callbacks` | `CallbackRequired` and the callback lifecycle |
| `lifeloop.entity.requests` | `EntityRequestReleased` |
| `lifeloop.entity.status` | `EntityStatusReceived` |
| `lifeloop.agent.events` | Calls, tool calls, post-call webhooks |
| `lifeloop.notifications` | `NotificationRequested` |
| `lifeloop.audit` | A copy of every relayed event (`audit_copy: true`), for downstream audit consumers |

## Producer

- `AIOKafkaProducer` with `acks="all"`, `enable_idempotence=True`, `request_timeout_ms=5000`; each publish waits at
  most 8 s.
- **Key = case id**, so all events of one case land on one partition and stay ordered.
- Value: JSON with `id`, `event_type`, `category`, `topic`, `case_id`, `node_key`, `payload` (redacted), `actor`,
  `source`, `trace_id`, `created_at`.
- Only the relay publishes, and only rows already committed in the outbox. A failed publish raises
  `BrokerUnavailable`; the row stays `PENDING` with exponential backoff and the relay stops so ordering holds
  ([`relay.py`](../../backend/app/events/relay.py)).

## Consumer

- One `AIOKafkaConsumer` subscribed to all seven topics, group `KAFKA_CONSUMER_GROUP`, `auto_offset_reset="earliest"`,
  `enable_auto_commit=False`.
- Each message is dispatched to every registered handler for its topic and event type, then the offset is committed.
  A crash before commit means redelivery; consumer receipts make the redelivery a no-op for handlers that already
  succeeded.
- Audit copies are counted (`lifeloop_events_consumed_total{outcome="audited"}`) and not handled further.

## Fallback modes

| `/ready` `dependencies.kafka.mode` | Meaning |
|---|---|
| `kafka` | Connected |
| `in-memory` | `KAFKA_BOOTSTRAP_SERVERS` not set |
| `in-memory-fallback` | Kafka was configured but unreachable at start-up (`last_error` shows why). Restart the backend after Kafka is healthy |

`simulated_failure: true` means the demo switch is on; `outbox_pending` shows the backlog. See
[When Kafka is down](../architecture/event-driven-architecture.md#when-kafka-is-down).

The in-memory broker is a single asyncio queue in the API process. It is suitable for development, tests and a
single-instance demo; it does not survive a restart (the outbox does: unpublished events are relayed after
restart).

## Inspecting events

- `GET /api/v1/cases/{ref}/events`: outbox rows for one case (status, topic, actor, attempts).
- `GET /api/v1/demo/outbox?status=PENDING|PUBLISHED|PROCESSED|FAILED`: the event inspector (demo mode).
- Metrics: `lifeloop_outbox_pending`, `lifeloop_case_events_total{event_type}`,
  `lifeloop_events_consumed_total{topic,outcome}`, `lifeloop_dependency_up{dependency="kafka"}`.
- Inside Compose, the Kafka image's CLI tools (in `/opt/kafka/bin`) can list topics and consumer group lag, for
  example `docker compose exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:19092
  --describe --group lifeloop-workers`.

## Related

- [Event-driven architecture](../architecture/event-driven-architecture.md)
- [Docker](../deployment/docker.md)
- [Redis](redis.md)

[Documentation index](../README.md)
