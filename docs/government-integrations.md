# Government integrations (mock)

> **Prototype notice.** All authorities are *mock government entities* used to demonstrate the orchestration end to end. Government-authorized integrations would be required for production; nothing here has authority over real systems.

## Adapter contract (`integrations/government/base.py`)

```python
class GovernmentAdapter(ABC):
    entity_code: str; slug: str; name: str; description: str; catalog: list[ServiceDefinition]
    async def submit(session, SubmissionRequest) -> SubmissionResult          # idempotent on idempotency_key
    async def get_status(session, reference) -> EntityStatus
    async def forward_documents(session, reference, documents) -> EntityStatus
```

Error taxonomy: `EntityTimeout`, `EntityRateLimited`, `EntityUnavailable` (transient, retried with backoff), `MalformedResponse`, `SubmissionRejected` (permanent), `ApplicationNotFound`, `EntityConflict`. The orchestrator retries transient errors, defers and escalates persistent ones, and fails permanent ones - never silently.

`AdapterRegistry` maps entity code -> adapter; tests inject flaky adapters, production would register real ones.

## Mock authorities

| Entity (code) | Services (catalog) | Notes |
|---|---|---|
| **Birth Registration Authority** (`BIRTH_REGISTRATION`) | Birth Registration, Birth Certificate | ~18h |
| **Civil Identity Authority** (`IDENTITY`) | Identity Application, Identity Manual Review | requires a proof-of-address document when asked; manual review is the permitted alternative path |
| **Health / Insurance Authority** (`HEALTH`) | Health Insurance Enrolment | |
| **Additional Services Authority** (`ADDITIONAL_SERVICES`) | Family Services Review | authority-run review; LIFELOOP never determines eligibility |

Each has an id, name, adapter, catalog, processing state, task submission, status retrieval and webhook simulation. `MockGovernmentAdapter` implements them over the `mock_applications` table: application states `RECEIVED -> PROCESSING -> COMPLETED`, plus `DELAYED`, `DOCUMENT_REQUIRED`, `REJECTED`; each with a history and a generated reference (`CIA-2026-000001`).

## Simulation = real events

`POST /mock/entities/{slug}/simulate-*` and the Demo Control Center call the adapter (which mutates the authority's own store and returns the webhook it would send), then feed it to `OrchestrationService.ingest_entity_event` - the same function behind `POST /api/v1/events`. So a simulated completion produces exactly the domain events, timeline, dependency resolution, replanning and callbacks a real authority webhook would.

## Adding a real authority

1. Implement `GovernmentAdapter` (HTTP client with its own timeout -> raise `EntityTimeout`, map 429 -> `EntityRateLimited`, validate responses -> `MalformedResponse`).
2. Register it in `AdapterRegistry` and add the entity row/workflow node.
3. Point the authority's status webhook at `POST /api/v1/events` (role `GOVERNMENT_ENTITY`) with a stable `idempotency_key`.

Future: UAE Pass or other digital-identity integrations would plug in as authentication/consent providers in front of `create_case`; document verification would replace the mock `ACCEPTED/VERIFIED` transition.
