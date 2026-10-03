# Personal data handling

LifeLoop handles the identity data of newborns and their parents. The rules below are implemented in code, mostly
in [`backend/app/core/pii.py`](../../backend/app/core/pii.py), and apply to every store and every outbound flow.
Boundary-by-boundary detail is in [Data flow](../architecture/data-flow.md#personal-data-at-each-boundary).

## What is collected, and why

Collected once, on the first call or in the web intake (canvas box M: "captured once on call one"):

| Data | Purpose | Stored as |
|---|---|---|
| Child's name (English, optional Arabic), date of birth, sex, place of birth, nationality, hospital notification reference | Birth certificate, visa, Emirates ID and insurance forms | Plain columns in `children` |
| Each parent's name and nationality | Birth certificate form | Plain columns in `parents` |
| Each parent's Emirates ID | Birth certificate form (sent as a token); visa sponsor | **Keyed hash + last four digits only** |
| Emirate | Routing to DHA, MOHAP or DOH and GDRFA or ICP | Plain |
| Marriage certificate attested (yes/no) | Whether the birth certificate step can open | Document status |
| Resident's email, name, phone, preferred language | Account, callbacks, SMS, email | `users`; the password as a bcrypt hash |
| Caller ID of a call to the life-event number | Binding the call to a resident | Matched against residents' phone numbers. A first-time caller becomes a phone-only resident: the number is stored as the phone, the display name is masked ("Caller +971•••••NN"), the email is a generated placeholder, and there is no password |
| Consents | Legal basis for processing, filing and calling | `consents` with scope text, version, source, timestamp, call reference |
| Consulate milestones | The parent-reported consulate step | Node `parent_report`, with a "passport number available" flag only |

## Identifiers

| Identifier | Rule | Code |
|---|---|---|
| Emirates ID | Validated (15 digits, starts with 784). Stored only as an HMAC-SHA256 keyed hash (for matching) and the last four digits. The hash key is `PII_HASH_KEY`, separate from `JWT_SECRET` so token-key rotation never breaks matching; outside production it falls back to `JWT_SECRET` when unset, and with `ENVIRONMENT=production` the service refuses to start without a key of at least 32 characters. Sent to authorities only as an opaque `eidtok_<16 hex>` token derived from the hash. Never read aloud, never repeated back, never asked for on a callback. Redacted from transcripts, logs, traces and payloads | `keyed_hash`, `last4`, `EID_RE`, `contains_eid` in `pii.py`; `create_from_intake` in [`case_service.py`](../../backend/app/services/case_service.py); `_passport` in [`entity_service.py`](../../backend/app/services/entity_service.py) |
| Passport number | **Never stored.** The consulate milestone "passport issued" requires the parent to confirm the number is available; only that boolean is kept (`passport_number_present`, `child.passport_present`). Passport-like numbers in free text are redacted | [`consulate_service.py`](../../backend/app/services/consulate_service.py), `PASSPORT_RE` |
| Phone number | Stored on the user for callbacks and SMS; masked (`+971•••••01`) in case views, logs and the mock SMS outbox | `mask_phone` |
| Email | Masked (`a•••@domain`) in logs | `mask_email` |

During voice intake, spoken Emirates IDs are held in process memory only (never Redis, so never on disk) under `intake:eid:<call id>`
for at most 30 minutes, until `create_case` hashes them; the key is then deleted. They are never placed in the agent
state or the transcript. The Compose Redis uses append-only persistence, so while such a key exists it can be written
to the `redisdata` volume; a production deployment should not persist these keys.

Display rules: residents see their own Emirates IDs as `784-****-*******-N`; officers see "ending NNNN".

## Redaction

`redact_text` scrubs free text: JWTs and bearer tokens, `key=value` secrets, Emirates IDs (`[EMIRATES_ID]`), long
digit runs (`[NUMBER]`), passport-like numbers (`[PASSPORT]`), phone numbers (`[PHONE]`) and emails (partially
masked). `redact_value` walks structures: values under sensitive keys (`password`, `token`, `secret`, `api_key`,
`authorization`, `signature`, `cookie`, `emirates_id`, `eid`, `passport_number`, `otp`, `credential`,
`private_key`, `audio`, `recording`) become `[REDACTED]`; phone and email fields are masked; strings are scrubbed;
depth and list length are capped.

| Where | Applied |
|---|---|
| Transcripts (every turn, both transports) | `redact_text` before storage |
| Post-call webhook payloads | `redact_value` before storage in `integration_events`; summary and extracted fields redacted |
| Domain event payloads (outbox, Kafka messages) | `redact_value` in the event recorder |
| Audit log details | `redact_value`; transcripts excluded |
| Application logs | structlog `_redact` processor, then Logifyx masking as a second net. Library loggers (SQLAlchemy statements and their parameters, HTTP clients, Kafka) are held at WARNING, including loggers created after start-up such as `sqlalchemy.engine.Engine` |
| Traces (Langfuse or local) | `redact_value` on inputs, outputs, metadata and errors, plus the Langfuse `mask` hook |
| Tool-call events | Argument **names** only, never values |
| Consulate notes | `redact_text` |

Redaction is pattern-based. It reliably removes the identifier formats above, but it cannot recognise every way a
person might say a number. That is why identifiers are also kept out of the agent's state by design, not only
scrubbed afterwards.

## Voice recordings

LifeLoop does **not** record or store call audio. Uploading audio to `/api/v1/agent/stt` transcribes it through
ElevenLabs and discards it; LifeLoop keeps only the returned text. When a call runs on ElevenLabs, audio and
transcripts are processed and retained by ElevenLabs according to the ElevenLabs workspace's settings; LifeLoop
stores the redacted transcript and a reference to the provider conversation. The disclosure tells every caller that
the call is recorded.

## Minimisation at the authority boundary

Each authority adapter accepts only the fields of that authority's own form and refuses anything else
(`FieldsNotAllowed`). The `entity_requests.fields_sent` column records the field **names** sent, so an officer or
auditor can see exactly what crossed. See [Government adapters](../integrations/government-adapters.md).

## Neo4j and analytics

The Neo4j projection holds ids, references, states and entity codes only: no names, dates or identifiers. Analytics
figures are counts and durations.

## Retention and deletion

The prototype has no automated retention schedule. Deleting a case (for example the demo reset) deletes its
dependants through cascading foreign keys, including the timeline. **Audit rows survive**: `audit_logs.case_id` is
`ON DELETE SET NULL`, so the record of who did what stays, without the link to the deleted case.
`integration_events` (redacted webhook payloads) are not linked by a foreign key and remain. Uploaded files remain in
`STORAGE_DIR` until removed. A production deployment needs a retention schedule agreed with the authorities, deletion
on request where the law allows, and encrypted backups with the same retention
([Production](../deployment/production.md)).

## Related

- [Threat model](threat-model.md)
- [Data flow](../architecture/data-flow.md)
- [Langfuse](../integrations/langfuse.md)
- [SECURITY.md](../../SECURITY.md)

[Documentation index](../README.md)
