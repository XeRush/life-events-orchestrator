# Voice agent: behaviour, tools and safety

**Agent identity:** LifeLoop Life Event Assistant. It says it is an AI assistant, is calm, warm and concise, speaks English or Arabic, and never presents itself as an officer.

## Behaviour

- Identifies the reported event and the date ("yesterday" -> date).
- **Asks for consent before anything starts**: *"Congratulations. I can coordinate the services associated with this event. With your permission, I can keep you updated as each stage is completed. Would you like me to proceed?"* Only after a clear yes does it call `create_life_event_case(consent_confirmed=true)`; declining creates nothing.
- Explains what happens next, answers "where are we", "what's next", "what do I need to do" from tools.
- If the resident cannot provide something: *"That's okay. I won't mark the application as complete. I'll keep the case open and contact you again when you're ready."* - and schedules a follow-up callback.
- Offers a human (`escalate_case`) on request or when it cannot help.

## Tools (`agents/tools.py`)

All are exposed as ElevenLabs webhook tools at `POST /api/v1/voice/tools/{name}` and used identically by the backend dialog engine.

| Tool | What it does |
|---|---|
| `create_life_event_case` | Creates the case + consents (`SERVICE_INITIATION`, `DATA_PROCESSING`, `CALLBACK`) and starts the workflow. Refuses without `consent_confirmed`. Returns the existing case for a duplicate event/date. |
| `get_case_status` | Verified status, progress, stages and the plain-language summary ("Your case has five stages…"). |
| `get_case_timeline` | Recent timeline entries. |
| `get_pending_actions` | What, if anything, the resident must do. |
| `get_workflow_graph` | Services and what each waits for. |
| `submit_consent` | Records a consent decision. |
| `initiate_service` | Starts a READY service; idempotent; explains what a blocked service is waiting for. |
| `get_service_status` | Status of one service, `confirmed_by_authority`, and the "no confirmed update" note when applicable. |
| `get_required_documents` | Documents an authority requested and their state. |
| `record_document` | Records a document from the resident (resumes the task when complete). |
| `request_callback` | Schedules a call (`tomorrow`, `in 2 hours`, ISO). |
| `pause_case` / `resume_case` | Lifecycle. |
| `escalate_case` | Hands the case to a human officer. |
| `complete_case` | Asks the backend to close the case - **refused unless every authority has confirmed completion**. |

Tools return `{ok, error?, message?, ...}`; domain errors are returned as data so the agent can relay them, never raised into the conversation.

## Safety rules

The agent must **never invent** an application status, approval, rejection, eligibility, legal requirement, document requirement or official decision. Enforcement is layered:

1. **Prompt**: explicit hard rules, and the fixed fallback *"I don't have a confirmed update from the relevant authority yet."*
2. **Architecture**: the agent has no data source other than tools; statuses, document lists and summaries are produced by backend code from persisted state.
3. **Tool contracts**: `complete_case` cannot close an unconfirmed case; `create_life_event_case` cannot run without consent; `initiate_service` cannot start a blocked service; there is no tool that approves or rejects anything.
4. **Audit**: every agent action is recorded with `actor_type = AI_AGENT`.
5. **Tests** (`tests/test_voice_and_elevenlabs.py`) assert these refusals and that nothing is created before consent.

## Backend dialog engine

`LifeEventAgent.respond` (`agents/life_event_agent.py`) is a small intent router (event detection, consent yes/no, status, next, actions, documents, defer, pause/resume, callback, escalate, close) that always answers through the tools. It powers the demo voice console and the fallback when ElevenLabs is unavailable, and doubles as an executable specification of the agent's behaviour.
