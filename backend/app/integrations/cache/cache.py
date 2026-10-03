"""Redis-backed cache with an in-process fallback.

Redis holds only short-lived, reconstructible data: knowledge-base documents, entity metadata, SLA config, case
summary snapshots, agent-session metadata, rate-limit windows, verification attempt counters and webhook replay
nonces. PostgreSQL stays the source of truth for case state - losing Redis loses nothing that matters.
"""
from __future__ import annotations

import json
import time
from typing import Any

from app.core.config import Settings
from app.observability import metrics
from app.observability.logging import get_logger

log = get_logger("lifeloop.cache")


class MemoryCache:
    name = "memory"

    def __init__(self) -> None:
        self._data: dict[str, tuple[float | None, Any]] = {}

    def _alive(self, key: str) -> Any:
        item = self._data.get(key)
        if not item:
            return None
        expires, value = item
        if expires and expires < time.monotonic():
            self._data.pop(key, None)
            return None
        return value

    async def get(self, key: str) -> Any:
        return self._alive(key)

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        self._data[key] = (time.monotonic() + ttl if ttl else None, value)

    async def delete(self, *keys: str) -> None:
        for key in keys:
            self._data.pop(key, None)

    async def incr(self, key: str, ttl: int) -> int:
        current = self._alive(key) or 0
        expires = self._data.get(key, (time.monotonic() + ttl, 0))[0] if current else time.monotonic() + ttl
        self._data[key] = (expires, current + 1)
        return current + 1

    async def set_if_absent(self, key: str, ttl: int) -> bool:
        if self._alive(key) is not None:
            return False
        await self.set(key, 1, ttl)
        return True

    async def delete_prefix(self, prefix: str) -> None:
        for key in [k for k in self._data if k.startswith(prefix)]:
            self._data.pop(key, None)

    async def ping(self) -> bool:
        return True


class RedisCache:
    name = "redis"

    def __init__(self, url: str) -> None:
        import redis.asyncio as redis

        self._r = redis.from_url(url, decode_responses=True, socket_timeout=2, socket_connect_timeout=2)

    async def get(self, key: str) -> Any:
        raw = await self._r.get(key)
        return json.loads(raw) if raw is not None else None

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        await self._r.set(key, json.dumps(value, default=str), ex=ttl)

    async def delete(self, *keys: str) -> None:
        if keys:
            await self._r.delete(*keys)

    async def incr(self, key: str, ttl: int) -> int:
        async with self._r.pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, ttl, nx=True)
            value, _ = await pipe.execute()
        return int(value)

    async def set_if_absent(self, key: str, ttl: int) -> bool:
        return bool(await self._r.set(key, "1", ex=ttl, nx=True))

    async def delete_prefix(self, prefix: str) -> None:
        async for key in self._r.scan_iter(match=f"{prefix}*", count=200):
            await self._r.delete(key)

    async def ping(self) -> bool:
        return bool(await self._r.ping())

    async def close(self) -> None:
        await self._r.aclose()


class CacheManager:
    """Uses Redis when reachable; on any Redis error falls back to memory for that call and reports degraded."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.memory = MemoryCache()
        self.redis: RedisCache | None = None
        self.mode = "memory"
        self.last_error: str | None = None

    async def start(self) -> None:
        if not self.settings.redis_url:
            metrics.DEPENDENCY_UP.labels("redis").set(0)
            return
        try:
            candidate = RedisCache(self.settings.redis_url)
            await candidate.ping()
            self.redis, self.mode = candidate, "redis"
            metrics.DEPENDENCY_UP.labels("redis").set(1)
            log.info("cache_selected", mode="redis")
        except Exception as exc:
            self.last_error = f"{type(exc).__name__}: {exc}"[:300]
            self.mode = "memory-fallback"
            metrics.DEPENDENCY_UP.labels("redis").set(0)
            log.warning("redis_unavailable_using_memory_cache", error=self.last_error)

    async def stop(self) -> None:
        if self.redis:
            await self.redis.close()

    async def _call(self, method: str, *args: Any) -> Any:
        if self.redis is not None:
            try:
                return await getattr(self.redis, method)(*args)
            except Exception as exc:
                self.last_error = f"{type(exc).__name__}: {exc}"[:300]
                metrics.DEPENDENCY_UP.labels("redis").set(0)
                log.warning("redis_call_failed_fallback", method=method, error=self.last_error)
        return await getattr(self.memory, method)(*args)

    async def get(self, key: str) -> Any:
        return await self._call("get", key)

    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        await self._call("set", key, value, ttl)

    async def delete(self, *keys: str) -> None:
        await self._call("delete", *keys)

    async def incr(self, key: str, ttl: int) -> int:
        return await self._call("incr", key, ttl)

    async def set_if_absent(self, key: str, ttl: int) -> bool:
        return await self._call("set_if_absent", key, ttl)

    async def delete_prefix(self, prefix: str) -> None:
        await self._call("delete_prefix", prefix)

    async def allow(self, key: str, limit: int, window_seconds: int = 60) -> bool:
        """Fixed-window rate limiter (per key per window)."""
        bucket = int(time.time() // window_seconds)
        return await self.incr(f"rl:{key}:{bucket}", window_seconds + 1) <= limit

    async def status(self) -> dict[str, Any]:
        healthy = False
        if self.redis is not None:
            try:
                healthy = await self.redis.ping()
            except Exception as exc:
                self.last_error = str(exc)[:300]
        metrics.DEPENDENCY_UP.labels("redis").set(1 if healthy else 0)
        return {"mode": self.mode, "healthy": healthy, "fallback": not healthy, "last_error": None if healthy else self.last_error}
