# Demo script (5-10 minutes)

A timed walkthrough for evaluators. It follows one new family from the first call to an officer's release, then
shows a blocked node, a callback, the opt-out and an escalation. Everything runs on the real pipeline; only the
government authorities are mocks, and the demo panel changes their state through the same `get_status` contract a
real authority would use.

> Government integrations are **DEMO / MOCK**. UAE Pass is **simulated**. Without ElevenLabs credentials, the voice
> channel is the **simulated** dialog engine (same tools, same guardrails, typed or browser speech instead of
> ElevenLabs audio).

## Before the clock starts (about 5 minutes, once)

1. `make demo` (it creates `.env` from `.env.example` if missing; or the PowerShell block in
   [Docker](../deployment/docker.md#quick-start)). Check `make health`.
2. Open three browser windows (use separate profiles or a private window so the sessions do not collide):
   - **Resident**: register a new account at `/register` (for example "Evaluator Parent", with a phone number),
     confirm the email from the link (in development: `http://localhost:8000/api/v1/dev/mailbox?email=<address>`),
     and sign in. A fresh resident is needed because a resident who already has an active case is taken straight to
     Status instead of Intake.
   - **Officer**: sign in as `demo.officer@lifeloop.local` (Mariam Al Ali, Amer Officer) and open `/officer`.
   - **Demo panel**: in the officer's window, open `/demo` in a second tab. It is visually separate from the officer
     interface on purpose.
3. Password for the demo accounts: `DEMO_USER_PASSWORD` from `.env` (`LifeLoop-Demo-2026` in `.env.example`).

## The script

| Time | Window | Do | Say / point out |
|---|---|---|---|
| 0:00 | Resident | Open `/`, then **Start** → `/app/voice` | "LifeLoop: your life-event case, coordinated. One call after a birth replaces seven visits to six entities." |
| 0:20 | Resident | Choose **English** or **Arabic**, press **Start call** | The first line of the transcript is the fixed **disclosure**: "LifeLoop, an AI agent for Dubai's life-event service. This call is recorded. English or Arabic?" It is written before anything else (canvas box I step 1) |
| 0:40 | Resident | Answer: `English` (or `العربية`) | Language confirmed; the agent asks whether the call is about a new baby |
| 0:50 | Resident | `Yes, our daughter was born yesterday at Latifa Hospital in Dubai` | One sentence fills date, hospital and emirate. The agent asks only for what is missing |
| 1:10 | Resident | `Aisha Khan` → `Ahmed Khan` → `784-1990-1234567-1` → `Fatima Khan` → `784-1992-7654321-2` → `Indian` | The agent says it will not read the Emirates IDs back. Point at the transcript: the IDs show as `[EMIRATES_ID]` |
| 2:00 | Resident | `Yes` (marriage certificate attested) → `Yes` (consent to file) → `Yes` (consent to call back) | **Consent** is captured; the callback consent carries the token the callback engine needs |
| 2:20 | Resident | Listen to the summary | Case reference, the six services, "LifeLoop files five, an Amer officer releases every submission, you attend two things: the consulate appointment and ICP biometrics", the legal deadline in days |
| 2:40 | Resident | Open the case → **Graph** (`/app/cases/:ref/graph`) | The **six-node graph**: Birth certificate "prepared, awaiting officer release"; the others waiting. The consulate node is marked parent-reported |
| 3:00 | Demo panel | Select the new case → Birth certificate → **RELEASE**, then **PROCESSING**, then **CLEARED** | RELEASE goes through the officer gate as Mariam. PROCESSING and CLEARED change the mock DHA's state; LifeLoop learns it by polling the contract. Watch the resident's graph update live: **birth certificate progressing** to "Cleared by DHA (mock)". A first callback ("birth certificate cleared") rings in the resident window a few seconds later: **decline** it for now; it is recorded as not answered |
| 3:40 | Demo panel | MOFA attestation → **RELEASE**, then **CLEARED** | **MOFA** cleared (mock). The consulate node opens as "waiting for you": no API, no SLA, no status feed |
| 4:10 | Resident | A **callback** rings in `/app/voice` → **Answer** | The callback disclosure is spoken first ("calling about case LL-..."). The MOFA update and the consulate question were coalesced into this one call. Callbacks left ringing become an SMS after the ring timeout |
| 4:20 | Resident | `English` → `UAE Pass` (or the UAE Pass button) | Verification without secrets: UAE Pass one-tap (simulated) or date of birth + hospital. No ID number is asked for |
| 4:35 | Resident | Listen | The update: MOFA attestation cleared by MOFA; "the consulate step has no status feed, so I'll ask you" |
| 4:50 | Resident | `The passport is ready` → `Yes` (passport number available) | **Report milestone**: recorded as **parent-reported**; the number itself is never stored. "I'm re-planning the residence visa filing now" |
| 5:10 | Resident | Back to the graph / timeline | Consulate "Parent-reported: passport issued". The **visa request** is prepared at once and waits for an officer. Timeline sources: AI agent, human officer, government (mock), parent-reported |
| 5:30 | Officer | `/officer/approvals` → open the residence visa | **Officer dashboard** and **review**: the prepared fields are only those on the GDRFA form; Emirates IDs appear as "token (no ID number shared)"; passport shown as available, not as a number |
| 5:50 | Officer | **Approve and Release** (add a note) | Audited with the officer's name. The **graph advances**: Residence visa submitted to GDRFA-Dubai (mock) with an external reference |
| 6:10 | Demo panel | Residence visa → **BLOCKED** | **Block a node**: the mock authority puts the file on hold. The node turns blocked with the authority's reason; a callback is scheduled with reason BLOCKED |
| 6:30 | Resident | Answer the callback, verify (`UAE Pass`) | **Callback** on a blocked node: "Residence visa is blocked: ..." |
| 6:50 | Resident | Say `Stop calling` | **Opt-out**: calls stop immediately, the case switches to SMS-only, pending callbacks are cancelled. The demo panel's mock SMS list shows the confirmation |
| 7:10 | Officer | `/officer/cases/:ref` → re-prepare the visa node for release (`POST /api/v1/officer/cases/{ref}/nodes/RESIDENCE_VISA/prepare`), then `/officer/approvals` → **Approve and Release** | The officer resolves the hold; the graph advances again. Any further update goes by SMS, not by phone, because the parent opted out |
| 7:40 | Resident | Start a new call → `English` → `I'm really scared - will the visa be approved?` | **Escalation**: the agent does not predict a decision. "I'm transferring you now to {officer}, an officer at Amer Centre - Al Barsha, with your case." |
| 8:00 | Officer | `/officer/escalations` | The escalation with reason distress / approval question, the named officer, the summary and a link to the case. **Take** and **Resolve** |
| 8:30 | Officer | `/officer/analytics` | Canvas KPIs: baseline 6 / 7 / 6, target 1 / 2 / 1, measured on demo cases and labelled DEMO / SIMULATED |
| 9:00 | | Close | "The agent prepares, an officer releases, the authority decides. LifeLoop never invents government status." |

**Arabic variant.** Choose Arabic and the whole call, including the disclosure, step names and the plan, is in
Modern Standard Arabic. The intake sequence used by the Agent Testing `multilingual` scenario works as a script:
`العربية` → `نعم، ولدت بنتي أمس` → `عائشة` → `دبي` → `مستشفى لطيفة` → `أحمد خان` → `784-1990-1234567-1` →
`فاطمة خان` → `784-1992-7654321-2` → `هندي` → `نعم` → `نعم` → `نعم`. The page switches to right-to-left.

The new case is assigned to the least-loaded officer of the Amer centre, which may be Khalid Al Mansoori (invitation
pending) rather than Mariam. Mariam still sees and acts on it because officers are scoped to their service centre;
the escalation names whichever officer the case is assigned to.

## Optional extras (if time allows)

| Extra | How | What it shows |
|---|---|---|
| Kafka failure | Demo panel → simulate Kafka failure → release or advance any node → show `/ready` `outbox_pending` growing and the timeline still updating → turn the failure off | Transactional outbox: nothing lost, nothing reordered; downstream effects resume in order |
| Authority outage | Demo panel → government failure for `GDRFA`, mode `unavailable` → release the visa | The node becomes STALLED "not cleared yet"; the agent says "not cleared yet"; an officer can **retry** |
| Missing marriage certificate | Open `LL-DEMO-002` (Sharjah, MOHAP, Tagalog) | The chain starts with the attested marriage certificate (canvas box G): the birth certificate is DOCUMENT_MISSING until it is uploaded |
| Approval question already escalated | Open `LL-DEMO-003` (Dubai, Urdu) | Birth certificate awaiting release plus an open APPROVAL_QUESTION escalation |
| Agent Testing | `/agent-testing` → run | Ten scenarios: eight forbidden behaviours caught (including live refusals), two live conversations pass |
| Post-call webhook | Demo panel → send post-call webhook on a case | An ElevenLabs-format webhook goes through the real HMAC verification and appears as "Post-call webhook processed" on the timeline |
| Agent definition | As `demo.admin@lifeloop.local`: `POST /api/v1/agent/sync?dry_run=true` | The ElevenLabs workflow, sub-agents, 18 tools, language presets and data collection, generated from code |

## Shortcut using the seeded case

If the intake part has to be skipped, sign in as `demo.resident@lifeloop.local` and use `LL-DEMO-001` (its callbacks
ring in this account's app): birth
certificate and MOFA cleared, consulate parent-reported, visa processing. From the demo panel: visa **CLEARED** →
Emirates ID is prepared → **RELEASE** → **WAITING_FOR_PARENT** (ICP biometrics, "resident present") → **COMPLETED**
→ insurance **RELEASE** → **COMPLETED** → "Every service in your case is complete." `POST /api/v1/demo/reset`
rebuilds `LL-DEMO-001` afterwards.

## With ElevenLabs connected

With `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID` set, the resident speaks instead of typing: the browser opens an
ElevenLabs session, the disclosure is the agent's first message, the agent calls LifeLoop's server tools, and the
post-call webhook writes the transcript and extracted fields back to the case. The officer, demo-panel and callback
steps are the same. Callbacks ring in the app unless `ELEVENLABS_PHONE_NUMBER_ID` is set; then they ring the
resident's phone, and the call id is passed so the agent's tools bind to the call (the person who answers must still
verify). If the life-event number's conversation-initiation webhook is configured, an evaluator can also **call the
number**: the disclosure comes first, a first-time caller can open a case by voice, and case details are shared only
after verification ([Telephony](../integrations/telephony.md#inbound-calls-to-the-life-event-number)).

## Related

- [Evaluator walkthrough](evaluator-walkthrough.md)
- [Call flow](../agent/call-flow.md)
- [Government adapters](../integrations/government-adapters.md#driving-a-mock-authority-demo)

[Documentation index](../README.md)
