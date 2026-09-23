# For judges: what LIFELOOP is and why it matters

**Track 2 - Government Services · Life-event service orchestration**

> One event. One call. Every next step.

## Problem

After a major life event a resident faces obligations across several departments, each with its own portal, forms, order of operations and status page. The resident becomes the integration layer: repeating the same story, tracking applications, and guessing what unlocks what.

## Solution

**One voice interaction creates a persistent life-event case.** With consent captured on that first call, LIFELOOP determines the triggered services, builds the dependency graph, initiates each permitted task with the right authority, tracks them, reacts to their events, replans when something is delayed or rejected, and **calls back only when something meaningful changes**.

> Government services are transaction-oriented. **LIFELOOP is life-event-oriented.**

| Traditional | LIFELOOP |
|---|---|
| Resident -> Service A, B, C | Resident -> Life event |
| Resident tracks each one | LIFELOOP manages the dependency graph |
| Same story told repeatedly | Persistent passport - "Where are we?" just works |
| Notifications for every status change | Notification policy: milestones, actions, exceptions only |

## Innovation

- **Persistent, event-driven orchestration** rather than a chatbot: domain events -> validated state machine -> dependency resolution -> replanning -> callback decision -> timeline, all in one transaction.
- **Dependency-aware replanning**: a delayed certificate keeps identity blocked *silently*; a rejection becomes retry, permitted alternative path (dependants rewired), resident action, wait, or a human.
- **Zero-repetition passport** and a **digital life timeline** built from persisted events.
- **Provider-neutral voice** with ElevenLabs as the real voice layer: 15 backend tools, signed-URL browser sessions, proactive outbound callbacks, HMAC-verified webhooks, and a fully working simulated channel.
- **Idempotency and auditability** everywhere: idempotent submissions and events, actor/actor-type/before-after audit for regulated workflows.

## Roles

| AI (LIFELOOP) | Government (authorities) |
|---|---|
| Understand the event | Approve |
| Plan the journey | Reject |
| Coordinate services | Determine eligibility |
| Monitor progress | Authorize |
| Explain status | Maintain official records |
| Notify · Replan · Escalate | |

The system **does not replace government authorities; it coordinates the journey between them.** It never approves or denies, never decides eligibility, never impersonates an officer, and never states a fact that did not come from a backend tool.

## What to try (5 minutes)

1. `make demo`, click **Watch Demo**.
2. Voice center: report a birth, consent, watch the case and graph appear.
3. Demo mode: complete registration/certificate, delay identity (no call), require a document (call), say "I don't have it right now" (case stays open), submit, approve.
4. Ask **"Where are we?"** - answered from persistent state.
5. Entity operations, callback center (policy), audit tab, Swagger.

## Honest scope

Prototype. Mock government entities and a demonstration workflow; BIRTH is fully implemented, MARRIAGE / MOVE / BUSINESS_START are definitions only. Government-authorized integrations would be required for production.
