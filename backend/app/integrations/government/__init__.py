<<<<<<< HEAD
"""Adapter registry: swap in real authority adapters (or test doubles) by entity code."""
from app.integrations.government.base import GovernmentAdapter, MockGovernmentAdapter
from app.integrations.government.birth_registration import BirthRegistrationAdapter
from app.integrations.government.health import AdditionalServicesAdapter, HealthAdapter
from app.integrations.government.identity import IdentityAdapter
from app.integrations.government.life_event_authorities import (
    AddressRegistryAdapter,
    CivilRecordsAdapter,
    CommerceRegistryAdapter,
    MarriageRegistryAdapter,
    TaxAuthorityAdapter,
    UtilitiesAdapter,
)


class AdapterRegistry:
    def __init__(self, adapters: list[GovernmentAdapter] | None = None) -> None:
        self._adapters: dict[str, GovernmentAdapter] = {}
        for adapter in adapters or [
            BirthRegistrationAdapter(), IdentityAdapter(), HealthAdapter(), AdditionalServicesAdapter(),
            MarriageRegistryAdapter(), CivilRecordsAdapter(),
            AddressRegistryAdapter(), UtilitiesAdapter(),
            CommerceRegistryAdapter(), TaxAuthorityAdapter(),
        ]:
            self.register(adapter)
=======
"""Mock government adapters (DEMO / MOCK INTEGRATION - no real UAE government system is called)."""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.integrations.government.authorities import (
    ConsulateAdapter,
    DhaAdapter,
    DohAdapter,
    GdrfaVisaAdapter,
    IcpEmiratesIdAdapter,
    IcpVisaAdapter,
    InsurerAdapter,
    MofaAdapter,
    MohapAdapter,
)
from app.integrations.government.base import MockGovernmentAdapter
from app.models.enums import Entity

if TYPE_CHECKING:
    from app.integrations.cache.cache import CacheManager


class AdapterRegistry:
    """Resolves the adapter for (node, entity) and holds the demo failure switches."""
>>>>>>> 53aa27f32330dcaf00d6b8a3af2519d809231184

    def __init__(self, cache: CacheManager) -> None:
        self.failures: dict[str, str | None] = {}
        self._by_route: dict[tuple[str, Entity], MockGovernmentAdapter] = {}
        adapters: dict[str, MockGovernmentAdapter] = {
            "dha": DhaAdapter(cache, self.failures), "mohap": MohapAdapter(cache, self.failures),
            "doh": DohAdapter(cache, self.failures), "mofa": MofaAdapter(cache, self.failures),
            "consulate": ConsulateAdapter(cache, self.failures), "gdrfa": GdrfaVisaAdapter(cache, self.failures),
            "icp_visa": IcpVisaAdapter(cache, self.failures), "icp_eid": IcpEmiratesIdAdapter(cache, self.failures),
            "insurer": InsurerAdapter(cache, self.failures),
        }
        self.all = adapters
        routes = {
            ("BIRTH_CERTIFICATE", Entity.DHA): "dha", ("BIRTH_CERTIFICATE", Entity.MOHAP): "mohap",
            ("BIRTH_CERTIFICATE", Entity.DOH): "doh", ("MOFA_ATTESTATION", Entity.MOFA): "mofa",
            ("CONSULATE_PASSPORT", Entity.CONSULATE): "consulate", ("RESIDENCE_VISA", Entity.GDRFA): "gdrfa",
            ("RESIDENCE_VISA", Entity.ICP): "icp_visa", ("EMIRATES_ID", Entity.ICP): "icp_eid",
            ("INSURANCE", Entity.INSURER): "insurer",
        }
        for route, name in routes.items():
            self._by_route[route] = adapters[name]

    def for_node(self, node_key: str, entity: Entity) -> MockGovernmentAdapter:
        return self._by_route[(node_key, entity)]

    def set_failure(self, entity: str, mode: str | None) -> None:
        if mode:
            self.failures[entity] = mode
        else:
            self.failures.pop(entity, None)

    def status(self) -> dict[str, Any]:
        return {"mode": "mock", "failures": dict(self.failures), "healthy": not self.failures,
                "label": "DEMO / MOCK INTEGRATION - no real government system is connected"}


__all__ = ["AdapterRegistry"]
