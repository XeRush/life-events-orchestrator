"""Mock authorities for the marriage, moving and starting-a-business journeys.

Each one is a `MockGovernmentAdapter` with its own catalog, exactly like the birth-journey authorities. They never
decide outcomes themselves: approvals arrive through the same simulated webhook path as every other entity.
"""
from app.integrations.government.base import MockGovernmentAdapter, ServiceDefinition


class MarriageRegistryAdapter(MockGovernmentAdapter):
    entity_code = "MARRIAGE_REGISTRY"
    slug = "marriage-registry"
    name = "Marriage Registry Office"
    description = "Mock authority that registers marriages and issues marriage certificates."
    ref_prefix = "MRO"
    avg_processing_hours = 24.0
    catalog = [
        ServiceDefinition("MARRIAGE_REGISTRATION", "Marriage Registration", "Register the marriage in the civil register.", 1),
        ServiceDefinition("MARRIAGE_CERTIFICATE", "Marriage Certificate", "Issue the official marriage certificate.", 1),
    ]


class CivilRecordsAdapter(MockGovernmentAdapter):
    entity_code = "CIVIL_RECORDS"
    slug = "civil-records"
    name = "Civil Records Office"
    description = "Mock authority that updates civil status records after a marriage."
    ref_prefix = "CRO"
    avg_processing_hours = 36.0
    catalog = [
        ServiceDefinition("RECORD_UPDATE", "Civil Record Update", "Update civil status records to reflect the marriage.", 2),
    ]


class AddressRegistryAdapter(MockGovernmentAdapter):
    entity_code = "ADDRESS_REGISTRY"
    slug = "address-registry"
    name = "Address Registry"
    description = "Mock authority that records a resident's registered address."
    ref_prefix = "ARG"
    avg_processing_hours = 24.0
    catalog = [
        ServiceDefinition("ADDRESS_UPDATE", "Address Update", "Update the registered address to the new home.", 1),
    ]


class UtilitiesAdapter(MockGovernmentAdapter):
    entity_code = "UTILITIES"
    slug = "utilities"
    name = "Utilities Transfer Office"
    description = "Mock office that transfers utility accounts to a new address."
    ref_prefix = "UTO"
    avg_processing_hours = 48.0
    catalog = [
        ServiceDefinition("UTILITY_TRANSFER", "Utilities Transfer", "Transfer utility accounts to the new address.", 2),
    ]


class CommerceRegistryAdapter(MockGovernmentAdapter):
    entity_code = "COMMERCE_REGISTRY"
    slug = "commerce-registry"
    name = "Commerce Registry"
    description = "Mock authority that reserves trade names and issues business licences."
    ref_prefix = "CRG"
    avg_processing_hours = 48.0
    catalog = [
        ServiceDefinition("TRADE_NAME_RESERVATION", "Trade Name Reservation", "Reserve the trade name for the new business.", 1),
        ServiceDefinition("BUSINESS_LICENSE", "Business License", "Issue the business licence.", 3),
    ]


class TaxAuthorityAdapter(MockGovernmentAdapter):
    entity_code = "TAX"
    slug = "tax-authority"
    name = "Tax Authority"
    description = "Mock authority that registers new businesses for tax."
    ref_prefix = "TXA"
    avg_processing_hours = 48.0
    catalog = [
        ServiceDefinition("TAX_REGISTRATION", "Tax Registration", "Register the business for tax.", 2),
    ]
