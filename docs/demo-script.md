# Demo script (3-5 minutes)

Setup: `make demo`, open http://localhost:5173, click **Watch Demo** (signs in as `demo@lifeloop.example` / `demo1234`, opens pre-seeded case **L-49281**). For live voice add ElevenLabs keys; otherwise the Voice center uses the identical simulated channel. Keep two views handy: the **Voice center** and a case page with the **Demo mode** panel.

> Pre-seeded story: registration and certificate are done, identity is in progress, health is submitted, next service is blocked. The live call in scenes 1-4 creates a *new* case (next reference, e.g. L-49282) so judges see creation end to end; scenes 5-15 can continue on either case.

## Scene 1 - Resident calls
Voice center -> **Start demo call**. Say (or click the suggestion): *"My daughter was born yesterday."*

## Scene 2 - Agent identifies the event
The agent replies that it is an AI assistant, recognises a birth, and moves to consent - it has not created anything yet (show the Life events list: unchanged).

## Scene 3 - Consent
Agent: *"Congratulations. I can coordinate the services associated with this event. With your permission, I can keep you updated as each stage is completed. Would you like me to proceed?"* Say **"Yes."** (Last action panel shows `create_life_event_case`.)

## Scene 4 - Case created
Open **Life events**: new case **L-4928x**, graph generated from the persisted workflow: Birth Reported ✓ -> Birth Registration (submitted) -> blocked chain behind it. Point at the passport tab (3 consents, participants, preferences) and the timeline (*event reported, consent captured, registration initiated*).

## Scene 5 - Birth registration completes
Demo mode -> **Complete Birth Registration**. The graph animates: registration ✓, **certificate unlocks and is submitted automatically**. Timeline updates live (SSE); no refresh.

## Scene 6 - Agent proactively calls
Open **Callbacks**: a callback for "Birth registration completed" is scheduled, then placed by the worker within seconds (duration, script, trigger). Note: *processing* and *blocked* events produced no call.

## Scene 7 - Identity becomes active
**Issue Birth Certificate** -> identity **and** health start in parallel. **Start Identity** -> in progress.

## Scene 8 - Identity requires an additional document
**Delay Identity** first (dependants stay blocked, *no* call - the policy at work), then **Require Document**. Identity turns amber "Requires action"; the case page shows *Your action is needed: Provide Proof of parent's address*.

## Scene 9 - Agent calls the resident
A new callback appears in Callbacks. Voice center -> **Answer the pending callback**: the agent opens with the document update.

## Scene 10 - "I don't have it right now"
Say *"I don't have it right now."* Agent: *"That's okay. I won't mark the application as complete. I'll keep the case open and contact you again when you're ready."* Show: identity still waiting, case still in progress, timeline entry "Resident will provide information later", a follow-up callback scheduled for tomorrow.

## Scene 11 - Operator submits the document
Demo mode -> **Submit Document** (or upload a file in the *Your action is needed* card).

## Scene 12 - Workflow resumes
Timeline: *Document submitted -> Identity process resumed*. Task back to in progress; nothing was marked complete by LIFELOOP.

## Scene 13 - Identity completes
**Approve Identity** (the authority approves - LIFELOOP only reports). **Additional Services unlocks and is submitted.** (Optional replan story: use **Reject Identity** instead to show the alternative path *Identity Manual Review*, dependants rewired, resident notified.)

## Scene 14 - Dashboard progresses automatically
Dashboard: completion ring and counts move; entity operations page shows per-authority throughput and observed processing times.

## Scene 15 - "Where are we?"
Voice center -> new call -> *"Where are we?"* Agent: *"Your case has five stages. Three are complete. One is currently with the Civil Identity Authority, and one will begin after that. You don't need to take any action right now."* - no re-explaining, straight from persistent case memory.

## Finale - Case completes
**Complete Health Service**, **Complete Additional Services** -> case **Completed** (system node *Case Complete* fires), final callback "all services complete", timeline closes the story. Show `GET /docs` and the audit log tab (actor, actor type, before/after state) to close on trust.

## If something goes wrong
Reset with the button at the bottom of the Demo mode panel (or `make reset`). `POST /demo/reset` rebuilds L-49281 from the seed.
