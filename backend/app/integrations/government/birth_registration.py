from app.integrations.government.base import MockGovernmentAdapter, ServiceDefinition


class BirthRegistrationAdapter(MockGovernmentAdapter):
    entity_code = "BIRTH_REGISTRATION"
    slug = "birth-registration"
    name = "Birth Registration Authority"
    description = "Mock authority that records births and issues birth certificates."
    ref_prefix = "BRA"
    avg_processing_hours = 18.0
    catalog = [
        ServiceDefinition("BIRTH_REGISTRATION", "Birth Registration", "Register the birth in the civil register.", 1),
        ServiceDefinition("BIRTH_CERTIFICATE", "Birth Certificate", "Issue the official birth certificate.", 1),
    ]
