# Evaluator walkthrough

This page maps each judging criterion of the Idea Canvas to what an evaluator can see in the running prototype and in
the code, box by box. It also states plainly what is mocked, simulated or not built.

| Criterion | Weight | Canvas boxes |
|---|---|---|
| Problem fit and depth of institutional understanding | 25% | B, C, D, F, G, H |
| Agent design and use of the ElevenLabs stack | 25% | I, J, L |
| Guardrail and compliance design | 20% | K, N |
| Commercial viability and readiness to build | 20% | E, M, O |
| Team | 10% | P, Q |

## 1. Problem fit (B, C, D, F, G, H)

| Box | Claim in the canvas | Where to see it |
|---|---|---|
| B | "An agent that runs the post-birth document chain for expatriate parents, so that six UAE entities are coordinated from one call, not seven visits." | One voice intake creates the case and the six-node graph ([Demo script](demo-script.md) 0:00-2:40) |
| C | Expatriates (88.5% of residents) sit outside Mabrouk Ma Yak; the chain breaks at the consulate; 120-day clock; AED 25-100 per day after it | The consulate node is parent-reported and drawn as such; every case shows the 120-day deadline and days remaining; the fine range is the only fine the agent may quote, with its source ([Life-Event Graph](../architecture/life-event-graph.md#slas-and-their-sources)) |
| D | Baseline: 6 entities, 7 visits or sessions, 6 re-entries | `/officer/analytics` shows the same baseline numbers next to the targets ([`analytics_service.py`](../../backend/app/services/analytics_service.py)) |
| F | "Parents usually struggle because they do not know when one document is ready or which step they can start next." | Every node has a next action and an owner (parent, officer, authority); callbacks on each state change |
| G | "The chain starts years earlier": the attested marriage certificate | Asked on call one; if not attested, the birth certificate is DOCUMENT_MISSING before any node opens (`LL-DEMO-002`; pytest `test_missing_marriage_certificate_blocks_birth_certificate`) |
| H | Six stages, actual system names, elapsed times, stage 4 fails most often, total 24-92 days | Entity labels name DHA Salama, MOHAP, DOH, MOFA, GDRFA-Dubai (via Amer), ICP, DHA eClaimLink; SLA labels and the AED 150 MOFA fee come from box H with the source attached |

## 2. Agent design and the ElevenLabs stack (I, J, L)

| Box | What to look at |
|---|---|
| I, step 1 | The disclosure is transcript turn 1 of every call and callback ([Call flow](../agent/call-flow.md#step-1-the-opening-disclosure)) |
| I, step 2 | Intake captures child's name, parents' Emirates IDs (never read back), nationality, consent to file and to call back |
| I, step 3 | The six-node graph is built and the agent states what it files and what the parent attends |
| I, step 4 | Officer-released filings; callbacks on cleared, blocked, document missing, stalled |
| I, step 5 (H) | Distress or an approval question → warm transfer to a named Amer officer ([Demo script](demo-script.md) 7:40) |
| J | Each ticked component and where it lives: [ElevenLabs](../integrations/elevenlabs.md#components-used-canvas-box-j). The agent definition is generated from code: `POST /api/v1/agent/sync?dry_run=true` shows the workflow, three sub-agents, 18 server tools, language presets, Eleven v3 TTS, Scribe v2 ASR, knowledge base with RAG, and post-call data collection |
| J (post-call webhooks) | HMAC-verified, replay-protected, idempotent; writes transcript, consent evidence and extracted fields to the case. Try the demo panel's webhook control |
| J (Agent Testing) | `/agent-testing` or `make agent-test`: ten scenarios, plus seven ElevenLabs test definitions created and run in the workspace by `POST /api/v1/agent/testing/sync` ([Agent Testing](../agent/testing.md)) |
| L | The three zones with every arrow labelled and personal-data crossings marked: [System architecture](../architecture/system-architecture.md). Dependency-down behaviour: try the demo panel's government, Kafka and ElevenLabs failure switches and watch `/ready` |

Two engineering choices worth checking in the code:

- **Deterministic orchestration.** The case orchestrator is a LangGraph state machine with no LLM in the loop; the
  LLM only converses and calls scoped tools ([`case_orchestrator.py`](../../backend/app/workflows/case_orchestrator.py)).
- **Transactional outbox.** State and event commit together; Kafka can fail without losing or reordering anything
  ([Event-driven architecture](../architecture/event-driven-architecture.md)).

## 3. Guardrails and compliance (K, N)

| Box K row | Mechanism you can observe | Proof |
|---|---|---|
| Opening disclosure | First transcript line on every call | Scenario `missing-disclosure` |
| Consent to be called | Consent records with token on the case; a case without callback consent never rings | Scenario `callback-without-consent` (live refusal) |
| Verification without secrets | Callbacks ask for UAE Pass (simulated) or date of birth + hospital; never an ID number | Scenario `eid-read-aloud`; two failures escalate |
| Human approval point | `/officer/approvals`; there is no approve tool for the agent | Scenario `approval-bypass` (live registry returns `unknown_tool`) |
| Opt-out path | "Stop calling" → SMS-only; mock SMS in the demo panel | Scenario `callback-after-opt-out` (live engine sends SMS) |
| Escalation trigger | `/officer/escalations` with the named officer and reason | Scenario `escalation` (live dialog engine) |

Full mapping: [Guardrails](../agent/guardrails.md). Box N risks are answered in the
[Threat model](../security/threat-model.md#risks-named-in-the-idea-canvas-box-n).

## 4. Commercial viability and readiness (E, M, O)

**Box E (buyer).** Digital Dubai with GDRFA-Dubai as co-sponsor. The officer dashboard is organisation-scoped (Amer
service centres), which is how a pilot with Amer centres would be operated.

**Box M (KPIs).** `/officer/analytics` shows each KPI's baseline (from box D), target and the value measured on the
demo data, labelled "DEMO / SIMULATED - measured on demo cases against mock authorities; not production results".

| KPI | Baseline | Target | How LifeLoop measures it |
|---|---|---|---|
| Entities the family contacts and tracks itself | 6 | 1 (the consulate appointment stays with the family) | Parent-reported nodes per case: only the consulate |
| Separate visits or portal sessions, birth → Emirates ID | 7 | 2 (consulate appointment and ICP biometrics) | Timeline events flagged "resident present" per case; the pytest journey asserts exactly 2 |
| Re-entries of the same details | 6 | 1 (captured once on call one) | The Life-Event Passport write log: fields captured on call one vs re-collected later (`re_entry_count`) |

**Box O (what works by 14 October).** Honest status:

| Canvas promise | Status in this build |
|---|---|
| One inbound Arabic/English call | Works in the web voice console, in the simulated channel without credentials or with ElevenLabs when configured; the full Arabic intake is an Agent Testing must-PASS scenario |
| ... on a real number | **Implemented; needs live credentials.** A call to a Twilio / SIP number imported in ElevenLabs is bound to a LifeLoop call by the conversation-initiation webhook (resident matched by caller ID, disclosure first, caller unverified until UAE Pass or two facts), covered by a backend test. Running it on a real number requires an ElevenLabs workspace, a number and a public HTTPS backend ([Telephony](../integrations/telephony.md#inbound-calls-to-the-life-event-number)) |
| Consent captured, case created, six-node graph built | Works |
| Three event-driven outbound callbacks including one blocked-node call | Works with simulated telephony (callbacks ring in the app). With `ELEVENLABS_PHONE_NUMBER_ID`, callbacks ring the resident's phone and pass `lifeloop_call_id`, so the agent's tools bind to the call |
| Live officer dashboard with the release gate | Works |
| Mocked GDRFA, MOFA and DHA APIs with real request/response contracts, simulated approvals | Works, plus MOHAP, DOH, ICP and the insurer ([Government adapters](../integrations/government-adapters.md)) |
| The consulate node stays parent-reported by design | Works |

## 5. Team (P, Q)

| Member | Role on this build (canvas box P) | Where to look |
|---|---|---|
| Madhur Prakash Mangal | Agent design and orchestration: call flow, Agent Workflows, life-event state machine | [`case_orchestrator.py`](../../backend/app/workflows/case_orchestrator.py), [`state_machine.py`](../../backend/app/workflows/state_machine.py), [`agent.py`](../../backend/app/integrations/elevenlabs/agent.py) |
| Bhanvi Nayer | Backend and entity integrations: scoped tool layer, mocked GDRFA / MOFA / DHA contracts, case store | [`tools.py`](../../backend/app/agents/tools.py), [`government/`](../../backend/app/integrations/government/), [`case_service.py`](../../backend/app/services/case_service.py) |
| Archit Nirula | Officer dashboard and case timeline UI; post-call webhook pipeline | `/officer`, `/app/cases/:ref/timeline`, [`webhook_service.py`](../../backend/app/services/webhook_service.py) |
| Saisha Goel | Institutional research, guardrails, multilingual conversation design and the Agent Testing suite | [`guardrails.py`](../../backend/app/agents/guardrails.py), [`scenarios.py`](../../backend/app/agents/testing/scenarios.py), [`nlu.py`](../../backend/app/agents/dialog/nlu.py) |

Box Q (proof of build): the build repository is `github.com/XeRush/life-events-orchestrator`.

## What is mocked, simulated or not built

| Item | Status |
|---|---|
| Government authorities | **Mock** adapters with realistic contracts; approvals simulated |
| UAE Pass | **Simulated** one-tap |
| Telephony without ElevenLabs phone credentials | **Simulated**: callbacks ring in the app |
| SMS without Twilio credentials | **Mock**: recorded and shown, not sent |
| Email without Gmail credentials | Console transport with a development mailbox |
| Voice without ElevenLabs credentials | **Simulated** dialog engine with the same tools and guardrails |
| Inbound SMS ("Reply CALL"), live audio bridge to officers (a warm transfer hands over the case, transcript and reason) | **Not built** (planned) |
| Production hosting, secrets manager, UAE data residency, real UAE Pass | **Not built** ([Production](../deployment/production.md)) |

## Related

- [Demo script](demo-script.md)
- [Architecture overview](../architecture/overview.md)
- [SECURITY.md](../../SECURITY.md)

[Documentation index](../README.md)
