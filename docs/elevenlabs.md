# ElevenLabs integration

ElevenLabs powers the actual voice interaction: speech in/out, the conversational agent, and proactive callback conversations. The rest of the backend is decoupled from it (`OutboundCaller`, `ConversationManager`, the tool runner); code lives in `backend/app/integrations/elevenlabs/`.

| Module | Role |
|---|---|
| `client.py` | Async HTTP client: `xi-api-key` auth, timeouts, retry with backoff on network errors / 429 / 5xx, uniform `ElevenLabsError`. Endpoints: signed URL, create/update/get agent, get conversation, Twilio outbound call. |
| `agent.py` | Builds the **LifeLoop Life Event Assistant** definition (prompt, first message, TTS, 15 webhook tools) and `sync_agent` (create or update). |
| `conversation.py` | Session lifecycle (`start`, `turn`, `append_transcript`, `end`) and post-call webhook handling. |
| `callbacks.py` | `OutboundCaller` implementations: `ElevenLabsOutboundCaller` (real phone call) and `SimulatedCaller`; `build_caller()` chooses. |
| `schemas.py` | `ToolSpec`, call DTOs and the subset of webhook payloads consumed. |

## Environment variables

| Variable | Purpose |
|---|---|
| `ELEVENLABS_API_KEY` | Server-side API key. Never sent to the browser. |
| `ELEVENLABS_AGENT_ID` | The agent to converse with. If empty, `POST /voice/agent/sync` creates one and returns its id. |
| `ELEVENLABS_PHONE_NUMBER_ID` | Imported Twilio/SIP number for real outbound callbacks. |
| `ELEVENLABS_WEBHOOK_SECRET` | HMAC secret for `/voice/webhook` (recommended). |
| `VOICE_TOOL_SECRET` | Sent by ElevenLabs as `X-LifeLoop-Tool-Secret` when calling tools. |
| `PUBLIC_BASE_URL` | Public HTTPS URL of the backend (ElevenLabs must reach the tools; use ngrok/cloudflared locally). |

Without keys everything still works on the **simulated voice channel**, which runs the same tools and dialog logic in the backend.

## Agent architecture

The agent is a thin, stateless conversational layer:

- **Prompt** (`agent.py:SYSTEM_PROMPT`): identity (AI assistant), tone, consent-first behaviour, and hard safety rules (below).
- **Tools**: every backend function the agent may use; definitions come from `agents/tools.py:TOOL_SPECS` and are rendered as ElevenLabs *webhook tools* pointing at `POST {PUBLIC_BASE_URL}/api/v1/voice/tools/{name}` with the `X-LifeLoop-Tool-Secret` header. `resident_id` is bound to the dynamic variable of the same name.
- **Dynamic variables** injected per call: `resident_id`, `case_reference`, `language`, `lifeloop_conversation_id` (+ `callback_script` for callbacks).

## Conversation lifecycle

1. **Start.** `POST /voice/sessions` creates a `Conversation`, requests a signed URL (`GET /v1/convai/conversation/get-signed-url`) and returns it with the dynamic variables. If ElevenLabs is down or unconfigured the response says `provider: "simulated"` and includes an opening message.
2. **Talk.** The browser opens a WebSocket to ElevenLabs with `@elevenlabs/client` (`Conversation.startSession({signedUrl, dynamicVariables})`). Tool calls hit our `/voice/tools/*`, which read/write the persistent case and return JSON.
3. **Finish.** ElevenLabs posts `post_call_transcription` to `/voice/webhook`; we match it via `lifeloop_conversation_id` (or the provider conversation id), store transcript, summary and duration, and complete any linked callback. Duplicate deliveries are ignored.

## Callback flow (proactive calls)

1. A domain event passes the notification policy -> a `Callback` is scheduled (coalesced with siblings).
2. The callback worker calls `CallbackService.execute`: composes the script from the verified case snapshot (`LifeEventAgent.compose_callback_script`), creates a `Conversation`, and asks the `OutboundCaller` to place the call.
3. **ElevenLabs telephony**: `POST /v1/convai/twilio/outbound-call` with `conversation_initiation_client_data` (dynamic variables + `first_message` override = the script). Status `IN_PROGRESS` until the post-call webhook completes it (duration, transcript, outcome).
4. **Simulated**: the exact script is stored as the transcript, duration estimated deterministically, status `COMPLETED` immediately.
5. The resident can **answer** a callback in the Voice center (`mode: "callback"`): the agent opens with the script and continues with full case memory.

Missing phone number or `ELEVENLABS_PHONE_NUMBER_ID` -> automatic fallback to the simulated channel with the reason recorded.

## Authentication

- Browser -> backend: JWT. Browser -> ElevenLabs: short-lived signed URL from the backend.
- ElevenLabs -> backend tools: `X-LifeLoop-Tool-Secret` (constant-time compare).
- ElevenLabs -> backend webhook: `ElevenLabs-Signature: t=<ts>,v0=<hmac>` verified with a 30-minute tolerance.

## Failure handling

| Failure | Handling |
|---|---|
| Network error / timeout | retry with exponential backoff, then `ElevenLabsError(retriable=True)` |
| 429 / 5xx | retried; 4xx (bad key, bad agent) fails fast |
| Malformed response | `ElevenLabsError` (never partial state) |
| Signed URL failure | session falls back to the backend dialog engine, reason returned to the UI |
| Outbound call failure | callback rescheduled +5 min; `FAILED` after 3 attempts; logged, never silent |
| Duplicate webhook | detected by conversation state; no double completion |

## Local development

1. Put `ELEVENLABS_API_KEY` in `.env`. Expose the backend: `ngrok http 8000`, set `PUBLIC_BASE_URL=https://<id>.ngrok-free.app`.
2. Restart, sign in as admin, call `POST /api/v1/voice/agent/sync` (Swagger). Put the returned `agent_id` in `ELEVENLABS_AGENT_ID` and restart.
3. Voice center now shows "ElevenLabs live". Optionally set the agent's post-call webhook to `{PUBLIC_BASE_URL}/api/v1/voice/webhook` with the secret in `ELEVENLABS_WEBHOOK_SECRET`.

> ElevenLabs evolves its agent-config schema. `agent.py` keeps the payload in one function (`build_agent_config`), so adjusting fields is a one-place change.

## Production setup

Stable HTTPS `PUBLIC_BASE_URL`, secrets from a secret manager, webhook secret required, tool secret rotated, dedicated phone number for outbound, and rate limiting moved to Redis. For government deployment also review data residency, call recording/consent policy and language coverage per ElevenLabs configuration.
