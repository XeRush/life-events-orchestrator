"""Thin, resilient HTTP client for the ElevenLabs Conversational AI API.

The rest of the backend never imports httpx or ElevenLabs paths directly; everything goes through this class
(and the higher-level modules in this package), so the provider can be swapped or mocked.
"""
from __future__ import annotations

import asyncio
from typing import Any

import httpx

from app.core.config import Settings
from app.core.logging import get_logger

log = get_logger("lifeloop.elevenlabs")


class ElevenLabsError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None, retriable: bool = False):
        super().__init__(message)
        self.status_code = status_code
        self.retriable = retriable


class ElevenLabsClient:
    def __init__(
        self, api_key: str, *, base_url: str = "https://api.elevenlabs.io", timeout: float = 15.0,
        max_attempts: int = 3, transport: httpx.AsyncBaseTransport | None = None, backoff: float = 0.5,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._max_attempts = max_attempts
        self._transport = transport
        self._backoff = backoff

    @classmethod
    def from_settings(cls, settings: Settings, **kwargs: Any) -> ElevenLabsClient:
        return cls(settings.elevenlabs_api_key, base_url=settings.elevenlabs_base_url, timeout=settings.elevenlabs_timeout_seconds, **kwargs)

    async def _request(self, method: str, path: str, *, params: dict | None = None, json: dict | None = None) -> dict[str, Any]:
        """Retries timeouts, 429 and 5xx with exponential backoff; maps everything else to ElevenLabsError."""
        last: ElevenLabsError | None = None
        for attempt in range(self._max_attempts):
            try:
                async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout, transport=self._transport) as http:
                    response = await http.request(method, path, params=params, json=json, headers={"xi-api-key": self._api_key})
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last = ElevenLabsError(f"ElevenLabs unreachable: {type(exc).__name__}", retriable=True)
            else:
                if response.status_code < 400:
                    try:
                        return response.json()
                    except ValueError as exc:
                        raise ElevenLabsError("ElevenLabs returned a malformed (non-JSON) response") from exc
                retriable = response.status_code == 429 or response.status_code >= 500
                last = ElevenLabsError(
                    f"ElevenLabs {method} {path} failed with HTTP {response.status_code}",
                    status_code=response.status_code, retriable=retriable,
                )
                if not retriable:
                    raise last
            if attempt < self._max_attempts - 1:
                log.warning("elevenlabs_retry", path=path, attempt=attempt + 1, reason=str(last))
                await asyncio.sleep(self._backoff * (2**attempt))
        assert last is not None
        raise last

    # ---- conversational AI --------------------------------------------------------------------
    async def get_signed_url(self, agent_id: str) -> str:
        data = await self._request("GET", "/v1/convai/conversation/get-signed-url", params={"agent_id": agent_id})
        url = data.get("signed_url")
        if not url:
            raise ElevenLabsError("ElevenLabs response did not include a signed_url")
        return url

    async def create_agent(self, config: dict[str, Any]) -> str:
        data = await self._request("POST", "/v1/convai/agents/create", json=config)
        agent_id = data.get("agent_id")
        if not agent_id:
            raise ElevenLabsError("ElevenLabs response did not include an agent_id")
        return agent_id

    async def update_agent(self, agent_id: str, config: dict[str, Any]) -> dict[str, Any]:
        return await self._request("PATCH", f"/v1/convai/agents/{agent_id}", json=config)

    async def get_agent(self, agent_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/v1/convai/agents/{agent_id}")

    async def get_conversation(self, conversation_id: str) -> dict[str, Any]:
        return await self._request("GET", f"/v1/convai/conversations/{conversation_id}")

    async def outbound_call(self, *, agent_id: str, phone_number_id: str, to_number: str, client_data: dict[str, Any]) -> dict[str, Any]:
        return await self._request(
            "POST", "/v1/convai/twilio/outbound-call",
            json={
                "agent_id": agent_id, "agent_phone_number_id": phone_number_id, "to_number": to_number,
                "conversation_initiation_client_data": client_data,
            },
        )
