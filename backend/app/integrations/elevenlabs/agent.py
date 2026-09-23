"""Builds and syncs the "LifeLoop Life Event Assistant" agent definition in ElevenLabs.

The prompt encodes the safety rules; every factual statement must come from a backend tool.
"""
from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.integrations.elevenlabs.client import ElevenLabsClient
from app.integrations.elevenlabs.schemas import ToolSpec

AGENT_NAME = "LifeLoop Life Event Assistant"

FIRST_MESSAGE = (
    "Hello, this is the LifeLoop assistant, an AI assistant that coordinates government services after a life event. "
    "How can I help today?"
)

SYSTEM_PROMPT = """\
You are the LifeLoop Life Event Assistant, an AI voice assistant for a government life-event service (prototype).
You coordinate a resident's services across several authorities. You are NOT a government officer and you have
no authority to approve, reject, or decide anything.

STYLE: calm, warm, concise, professional. One or two short sentences per turn. Handle interruptions gracefully.
Speak the resident's language (English or Arabic). Never read out IDs, URLs or technical terms.

IDENTITY: Say you are an AI assistant at the start of every call. Never impersonate an officer.

WHAT YOU DO
- Understand the life event the resident reports (for example "my daughter was born yesterday").
- Explain what you can coordinate and ASK FOR CONSENT before starting anything. Only after the resident clearly
  says yes, call create_life_event_case with consent_confirmed=true.
- Answer "where are we?", "what's next?", "what do I need to do?" using get_case_status, get_pending_actions,
  get_required_documents and get_case_timeline. Do not make the resident repeat what the case already knows.
- Record documents the resident says they are providing (record_document). If they can't provide something now,
  say that's okay, that you will keep the case open, and offer request_callback for later.
- Offer a human officer (escalate_case) whenever the resident asks or you cannot help.

HARD RULES (never break)
1. NEVER invent an application status, approval, rejection, eligibility outcome, legal requirement, document
   requirement, or official decision. Every fact about the case MUST come from a tool result.
2. If a tool has no answer, say exactly: "I don't have a confirmed update from the relevant authority yet."
3. Never say an application is approved, denied, or complete unless a tool returned that status.
4. Never mark anything complete on the resident's behalf. Authorities decide; you report.
5. Do not call complete_case unless the resident asks to close the case; the backend will refuse if authorities
   have not confirmed every service.
6. Do not ask for sensitive personal data you do not need. Never read out full document contents.

The resident id for tool calls is {{resident_id}}. Current case (may be empty): {{case_reference}}.
Preferred language: {{language}}.
"""

_SCHEMA_TYPES = {"string": "string", "boolean": "boolean", "integer": "integer"}


def tool_to_webhook(spec: ToolSpec, settings: Settings) -> dict[str, Any]:
    """Render a ToolSpec as an ElevenLabs *webhook* tool that calls our /voice/tools/{name} endpoint."""
    properties = {
        "resident_id": {"type": "string", "description": "The resident's id.", "dynamic_variable": "resident_id"},
        **spec.parameters,
    }
    return {
        "type": "webhook",
        "name": spec.name,
        "description": spec.description,
        "api_schema": {
            "url": f"{settings.public_base_url.rstrip('/')}/api/v1/voice/tools/{spec.name}",
            "method": "POST",
            "request_headers": {"X-LifeLoop-Tool-Secret": settings.voice_tool_secret},
            "request_body_schema": {
                "type": "object",
                "properties": properties,
                "required": spec.required,
            },
        },
    }


def build_agent_config(settings: Settings, tools: list[ToolSpec]) -> dict[str, Any]:
    """Payload for POST /v1/convai/agents/create (and PATCH for updates)."""
    tts: dict[str, Any] = {"model_id": "eleven_flash_v2"}
    if settings.elevenlabs_voice_id:
        tts["voice_id"] = settings.elevenlabs_voice_id
    return {
        "name": AGENT_NAME,
        "conversation_config": {
            "agent": {
                "first_message": FIRST_MESSAGE,
                "language": "en",
                "prompt": {
                    "prompt": SYSTEM_PROMPT,
                    "tools": [tool_to_webhook(t, settings) for t in tools],
                },
            },
            "tts": tts,
        },
        "platform_settings": {
            "overrides": {
                "conversation_config_override": {"agent": {"first_message": True, "language": True}}
            }
        },
    }


async def sync_agent(client: ElevenLabsClient, settings: Settings, tools: list[ToolSpec]) -> dict[str, str]:
    """Create the agent if no ELEVENLABS_AGENT_ID is configured, otherwise update it in place."""
    config = build_agent_config(settings, tools)
    if settings.elevenlabs_agent_id:
        await client.update_agent(settings.elevenlabs_agent_id, config)
        return {"agent_id": settings.elevenlabs_agent_id, "action": "updated"}
    agent_id = await client.create_agent(config)
    return {"agent_id": agent_id, "action": "created"}
