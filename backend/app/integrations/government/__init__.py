"""Adapter registry: swap in real authority adapters (or test doubles) by entity code."""
from app.integrations.government.base import GovernmentAdapter, MockGovernmentAdapter
from app.integrations.government.birth_registration import BirthRegistrationAdapter
from app.integrations.government.health import AdditionalServicesAdapter, HealthAdapter
from app.integrations.government.identity import IdentityAdapter


class AdapterRegistry:
    def __init__(self, adapters: list[GovernmentAdapter] | None = None) -> None:
        self._adapters: dict[str, GovernmentAdapter] = {}
        for adapter in adapters or [
            BirthRegistrationAdapter(), IdentityAdapter(), HealthAdapter(), AdditionalServicesAdapter(),
        ]:
            self.register(adapter)

    def register(self, adapter: GovernmentAdapter) -> None:
        self._adapters[adapter.entity_code] = adapter

    def get(self, entity_code: str) -> GovernmentAdapter:
        return self._adapters[entity_code]

    def by_slug(self, slug: str) -> GovernmentAdapter | None:
        return next((a for a in self._adapters.values() if a.slug == slug), None)

    def all(self) -> list[GovernmentAdapter]:
        return list(self._adapters.values())


__all__ = ["AdapterRegistry", "GovernmentAdapter", "MockGovernmentAdapter"]
