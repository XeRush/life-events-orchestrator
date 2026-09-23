from app.integrations.government.base import MockGovernmentAdapter, ServiceDefinition


class HealthAdapter(MockGovernmentAdapter):
    entity_code = "HEALTH"
    slug = "health"
    name = "Health / Insurance Authority"
    description = "Mock authority that enrols newborns in health cover and issues insurance references."
    ref_prefix = "HIA"
    avg_processing_hours = 36.0
    catalog = [
        ServiceDefinition("HEALTH_ENROLMENT", "Health Insurance Enrolment", "Enrol the child in health cover.", 2),
    ]


class AdditionalServicesAdapter(MockGovernmentAdapter):
    entity_code = "ADDITIONAL_SERVICES"
    slug = "additional-services"
    name = "Additional Services Authority"
    description = "Mock authority that reviews family services once identity is confirmed."
    ref_prefix = "ASA"
    avg_processing_hours = 72.0
    catalog = [
        ServiceDefinition(
            "FAMILY_SERVICES_REVIEW", "Family Services Review", "Authority-run review of family services linked to the new record.", 3
        ),
    ]
