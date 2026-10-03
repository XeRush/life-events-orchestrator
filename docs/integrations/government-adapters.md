# Government adapters

> **DEMO / MOCK INTEGRATION.** No adapter in this repository talks to a real UAE government system. Every
> authority is simulated with a realistic request/response contract. Every place that shows an authority's status
> labels it as mock: node status lines end in "(mock)", entity requests carry `is_mock: true`, documents issued by an
> adapter say "Issued by the authority's mock adapter in this prototype", the actor is "<authority> (mock)", and
> `GET /api/v1/entities` and `/ready` return the label "DEMO / MOCK INTEGRATION - no real government system is
> connected".

Canvas box N names the risk directly: entity integration is a multi-year procurement. The answer in the canvas, and
in the code, is to run the orchestrator live against mocked entity APIs with a real officer dashboard, and to
publish the integration contract each entity would implement, unchanged.

## The contract

[`contracts.py`](../../backend/app/integrations/government/contracts.py) and the abstract `GovernmentAdapter` in
[`base.py`](../../backend/app/integrations/government/base.py) are the contract an authority would implement.

| Operation | Request | Response |
|---|---|---|
| `submit_request` | `SubmitRequest`: `request_type`, `idempotency_key` (8-160 chars), `case_reference`, `fields` (only the authority's form fields), `declared_documents` | `SubmitResponse`: `external_ref`, `status`, `detail`, `received_at`, `duplicate` |
| `get_status` | `external_ref` | `StatusResponse`: `external_ref`, `status`, `detail`, `missing_documents`, `updated_at`, `resident_present` |
| `get_requirements` | none | `Requirements`: `entity`, `service`, `required_fields`, `required_documents`, `published_fee`, `fee_source`, `sla`, `has_api`, `has_status_feed`, `notes` |
| `get_document_requirements` | none | list of document types |
| `cancel_request` | `external_ref` | `StatusResponse` |

Authority statuses: `SUBMITTED`, `PROCESSING`, `CLEARED`, `COMPLETED`, `BLOCKED`, `DOCUMENT_MISSING`, `STALLED`,
`REJECTED`, `WAITING_FOR_PARENT`, `CANCELLED`.

Contract rules:

- **Idempotent submit**: the same `idempotency_key` returns the same application with `duplicate: true`. LifeLoop's
  key is `<case id>:<node key>:<attempt>`.
- **Data minimisation**: an adapter refuses any field outside its form with `FieldsNotAllowed`, so more personal
  data than the authority needs cannot cross the boundary. LifeLoop sends Emirates IDs only as tokens and never
  sends passport numbers.
- **Status only through `get_status`**: a node changes because LifeLoop polled the authority (or, in demo mode, the
  mock authority's state was changed and then polled). Nothing writes an authority status directly.

## The adapters

[`authorities.py`](../../backend/app/integrations/government/authorities.py), routed by
[`__init__.py`](../../backend/app/integrations/government/__init__.py) (`AdapterRegistry`).

| Adapter | Entity | Node | Reference prefix | Service | SLA | Published fee | Success |
|---|---|---|---|---|---|---|---|
| `DhaAdapter` | DHA (DHA Salama) | Birth certificate (Dubai) | `DHA-BC` | Birth certificate issuance | 1-5 days | none | CLEARED |
| `MohapAdapter` | MOHAP | Birth certificate (northern emirates) | `MOHAP-BC` | Birth certificate issuance | 1-5 days | none | CLEARED |
| `DohAdapter` | DOH | Birth certificate (Abu Dhabi) | `DOH-BC` | Birth certificate issuance | 1-5 days | none | CLEARED |
| `MofaAdapter` | MOFA | MOFA attestation | `MOFA-ATT` | Birth certificate attestation | 2 hours - 3 working days | AED 150 (canvas box H) | CLEARED |
| `GdrfaVisaAdapter` | GDRFA-Dubai (via Amer) | Residence visa (Dubai) | `GDRFA-RV` | Newborn residence visa | 3-10 days | none | CLEARED |
| `IcpVisaAdapter` | ICP | Residence visa (other emirates) | `ICP-RV` | Newborn residence visa | 3-10 days | none | CLEARED |
| `IcpEmiratesIdAdapter` | ICP | Emirates ID | `ICP-EID` | Emirates ID registration | 5-15 days, card by courier | none | COMPLETED |
| `InsurerAdapter` | Insurer via DHA eClaimLink | Insurance | `ECL-END` | Dependant insurance endorsement | No published SLA in our sources | none | COMPLETED |
| `ConsulateAdapter` | Home-country consulate | Consulate passport | none | Child's passport (home country) | None: 2 to 8 weeks with no status feed | none | (parent-reported) |

References look like `DHA-BC-2026-123456` (derived from the idempotency key). Each mock keeps its application state in
the cache (Redis when available, otherwise process memory) under `mockgov:<ENTITY>:<ref>` for 60 days. With the
memory fallback, mock applications do not survive a restart.

Each mock's status detail reads like the authority's own staff: "The civil registrar is validating the hospital birth
notification.", "The MOFA attestation officer is reviewing the certificate.", "The GDRFA-Dubai visa approver is
reviewing the file.", "ICP card production is in progress.", "The insurer's underwriting team is adding the
dependant."

### The consulate has no API

The `ConsulateAdapter` exists only to make the contract explicit: `submit_request`, `get_status` and
`cancel_request` all raise `NotSupported`, and `get_requirements` returns `has_api: false`,
`has_status_feed: false` with the note "Parent-reported milestones only: appointment booked, application submitted,
passport issued." No code path files with or polls the consulate. The node moves only on
[parent-reported milestones](../architecture/life-event-graph.md#the-consulate-node-parent-reported), and the agent
never claims a consulate status.

## Submit, poll, apply

[`entity_service.py`](../../backend/app/services/entity_service.py):

1. **Release** (officer): an `entity_requests` row is created with `fields_sent` (field names only), the approval and
   the releasing officer; the node moves to `SUBMITTING`; `EntityRequestReleased` is emitted.
2. **Submit** (`entity-submitter` consumer): the minimised fields are resolved from the Life-Event Passport and
   submitted with a timeout (`ADAPTER_TIMEOUT_SECONDS`, 5 s) and up to `ADAPTER_MAX_ATTEMPTS` (3) attempts with
   linear backoff (`ADAPTER_BACKOFF_SECONDS`). On success the node moves to `SUBMITTED` and its SLA clock starts. A
   refused request (`FieldsNotAllowed`, `NotSupported`) moves the node to `BLOCKED`. Exhausted retries move it to
   `STALLED` "unavailable - not cleared yet".
3. **Poll** (`entities` worker, every `ENTITY_POLL_SECONDS`): open requests are asked for their status; a changed
   status is recorded in `entity_statuses` and emitted as `EntityStatusReceived`. Poll failures are logged and
   retried on the next cycle; they never change the node.
4. **Apply** (`entity-status` consumer): the status is mapped onto the node through the state machine. A status that
   is not a valid transition is logged and ignored. Outputs (for example the birth certificate) are registered in the
   Document Center as issued by the mock authority.

An officer can retry a stalled submission that never reached the authority
(`POST /api/v1/officer/cases/{ref}/nodes/{node_key}/retry`), or re-prepare a blocked or rejected node for release
(`.../prepare`).

## Failure injection (demo)

`POST /api/v1/demo/failures` (officer or admin, `DEMO_MODE=true`):

```json
{"component": "government", "enabled": true, "entity": "GDRFA", "mode": "unavailable"}
```

| Field | Values |
|---|---|
| `component` | `government`, `kafka`, `elevenlabs` |
| `entity` | An entity code (`DHA`, `MOHAP`, `DOH`, `MOFA`, `GDRFA`, `ICP`, `INSURER`) or omitted for all (`*`) |
| `mode` | `unavailable` (simulated 503), `timeout`, `malformed` (unreadable response) |

`unavailable` and `timeout` are retried; `malformed` is not. A failing submit ends in `STALLED` "not cleared yet";
a failing poll leaves the node unchanged. `/ready` shows `government.failures` and `healthy: false` while a switch is
on. `POST /api/v1/demo/reset` clears all switches.

## Driving a mock authority (demo)

`POST /api/v1/demo/cases/{ref}/nodes/{node_key}/{action}` changes the **mock authority's** state and then fetches it
through the normal `get_status` contract, so the change flows through `EntityStatusReceived`, the consumer, the
validated transition, the orchestrator and the callback engine exactly as a real status would
([`demo_service.py`](../../backend/app/services/demo_service.py)).

| Node | Actions |
|---|---|
| Birth certificate | RELEASE, PROCESSING, CLEARED, BLOCKED, DOCUMENT_MISSING |
| MOFA attestation | RELEASE, PROCESSING, CLEARED, STALLED |
| Consulate passport | APPOINTMENT_BOOKED, APPLICATION_SUBMITTED, PASSPORT_ISSUED, DELAYED (recorded as parent-reported, by the signed-in staff member "as the parent") |
| Residence visa | RELEASE, PROCESSING, CLEARED, DOCUMENT_MISSING, BLOCKED, STALLED, REJECTED |
| Emirates ID | READY, RELEASE, WAITING_FOR_PARENT (ICP biometrics), COMPLETED |
| Insurance | READY, RELEASE, COMPLETED |

Generic actions `ADVANCE`, `BLOCK`, `STALL` and `CLEAR` are also accepted. `RELEASE` goes through
`ApprovalService.approve` with the signed-in officer as the actor; it is not a shortcut around the human gate. An
authority outcome on a node that has not been released returns `409 not_released`.

## Implementing a real adapter

A real integration would subclass `GovernmentAdapter`, implement the five operations against the authority's API,
keep `allowed_fields` equal to the authority's form, set `is_mock = False`, and be registered in `AdapterRegistry`
for its `(node, entity)` route. Nothing else in the orchestrator, the graph or the agent changes. See
[Production](../deployment/production.md) for what else a real integration needs (authority contracts, credentials
in a secrets manager, mutual TLS, data-sharing agreements).

## Related

- [Life-Event Graph](../architecture/life-event-graph.md)
- [Data flow](../architecture/data-flow.md)
- [API overview](../api/overview.md#entities)
- [Demo script](../demo/demo-script.md)

[Documentation index](../README.md)
