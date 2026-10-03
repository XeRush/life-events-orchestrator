"""Resilient HTTP client for the ElevenLabs APIs (Agents Platform, TTS, STT, Knowledge Base, Agent Testing).

The rest of the backend never builds ElevenLabs URLs; everything goes through this class, so the provider can be
mocked in tests and swapped without touching services. The API key never leaves the server.
"""
from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.core.config import Settings
from app.observability.logging import get_logger

log = get_logger("lifeloop.elevenlabs")


class ElevenLabsError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None, retriable: bool = False):
        super().__init__(message)
        self.status_code = status_code
        self.retriable = retriable


class ElevenLabsClient:
    def __init__(self, api_key: str, *, base_url: str = "https://api.elevenlabs.io", timeout: float = 15.0,
                 max_attempts: int = 3, transport: httpx.AsyncBaseTransport | None = None, backoff: float = 0.5) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._max_attempts = max_attempts
        self._transport = transport
        self._backoff = backoff
        self.simulate_unavailable = False

    @classmethod
    def from_settings(cls, settings: Settings, **kwargs: Any) -> ElevenLabsClient:
        return cls(settings.elevenlabs_api_key, base_url=settings.elevenlabs_base_url, timeout=settings.elevenlabs_timeout_seconds, **kwargs)

    async def _send(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        """Retries timeouts, 429 and 5xx with exponential backoff; maps everything else to ElevenLabsError."""
        if self.simulate_unavailable:
            raise ElevenLabsError("ElevenLabs unavailable (simulated by the demo control panel)", retriable=True)
        last: ElevenLabsError | None = None
        for attempt in range(self._max_attempts):
            try:
                async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout, transport=self._transport) as http:
                    response = await http.request(method, path, headers={"xi-api-key": self._api_key}, **kwargs)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last = ElevenLabsError(f"ElevenLabs unreachable: {type(exc).__name__}", retriable=True)
            else:
                if response.status_code < 400:
                    return response
                retriable = response.status_code == 429 or response.status_code >= 500
                last = ElevenLabsError(f"ElevenLabs {method} {path} failed with HTTP {response.status_code}",
                                       status_code=response.status_code, retriable=retriable)
                if not retriable:
                    raise last
            if attempt < self._max_attempts - 1:
                log.warning("elevenlabs_retry", path=path, attempt=attempt + 1, reason=str(last))
                await asyncio.sleep(self._backoff * (2 ** attempt))
        assert last is not None
        raise last

    async def _json(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        response = await self._send(method, path, **kwargs)
        try:
            return response.json()
        except ValueError as exc:
            raise ElevenLabsError("ElevenLabs returned a malformed (non-JSON) response") from exc

    # --- Agents Platform ------------------------------------------------------------------------------
    async def get_signed_url(self, agent_id: str) -> str:
        data = await self._json("GET", "/v1/convai/conversation/get-signed-url", params={"agent_id": agent_id})
        if not data.get("signed_url"):
            raise ElevenLabsError("ElevenLabs response did not include a signed_url")
        return data["signed_url"]

    async def create_agent(self, config: dict[str, Any]) -> str:
        data = await self._json("POST", "/v1/convai/agents/create", json=config)
        if not data.get("agent_id"):
            raise ElevenLabsError("ElevenLabs response did not include an agent_id")
        return data["agent_id"]

    async def update_agent(self, agent_id: str, config: dict[str, Any]) -> dict[str, Any]:
        return await self._json("PATCH", f"/v1/convai/agents/{agent_id}", json=config)

    async def get_agent(self, agent_id: str) -> dict[str, Any]:
        return await self._json("GET", f"/v1/convai/agents/{agent_id}")

    async def get_conversation(self, conversation_id: str) -> dict[str, Any]:
        return await self._json("GET", f"/v1/convai/conversations/{conversation_id}")

    async def outbound_call(self, *, agent_id: str, phone_number_id: str, to_number: str, client_data: dict[str, Any]) -> dict[str, Any]:
        return await self._json("POST", "/v1/convai/twilio/outbound-call", json={
            "agent_id": agent_id, "agent_phone_number_id": phone_number_id, "to_number": to_number,
            "conversation_initiation_client_data": client_data,
        })

    # --- Knowledge base (RAG) -----------------------------------------------------------------------
    async def create_kb_text(self, name: str, text: str) -> str:
        data = await self._json("POST", "/v1/convai/knowledge-base/text", json={"name": name, "text": text})
        return str(data.get("id"))

    # --- Agent Testing --------------------------------------------------------------------------------
    async def create_agent_test(self, test: dict[str, Any]) -> str:
        data = await self._json("POST", "/v1/convai/agent-testing/create", json=test)
        return str(data.get("id"))

    async def run_agent_tests(self, agent_id: str, test_ids: list[str]) -> dict[str, Any]:
        return await self._json("POST", f"/v1/convai/agents/{agent_id}/run-tests", json={"tests": [{"test_id": t} for t in test_ids]})

    # --- Eleven v3 TTS / Scribe v2 STT ------------------------------------------------------------------
    async def text_to_speech(self, *, voice_id: str, text: str, model_id: str, language_code: str | None = None) -> bytes:
        body: dict[str, Any] = {"text": text, "model_id": model_id}
        if language_code:
            body["language_code"] = language_code
        response = await self._send("POST", f"/v1/text-to-speech/{voice_id}", params={"output_format": "mp3_44100_128"}, json=body)
        return response.content

    async def speech_to_text(self, *, audio: bytes, filename: str, content_type: str, model_id: str,
                             language_code: str | None = None) -> dict[str, Any]:
        data = {"model_id": model_id}
        if language_code:
            data["language_code"] = language_code
        return await self._json("POST", "/v1/speech-to-text", data=data, files={"file": (filename, audio, content_type)})
