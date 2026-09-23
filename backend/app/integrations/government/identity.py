from app.integrations.government.base import MockGovernmentAdapter, ServiceDefinition


class IdentityAdapter(MockGovernmentAdapter):
    entity_code = "IDENTITY"
    slug = "identity"
    name = "Civil Identity Authority"
    description = "Mock authority that issues identity records for newly registered residents."
    ref_prefix = "CIA"
    avg_processing_hours = 48.0
    catalog = [
        ServiceDefinition(
            "IDENTITY_APPLICATION",
            "Identity Application",
            "Issue an identity record for the newborn.",
            2,
            required_documents=[{"type": "PROOF_OF_ADDRESS", "name": "Proof of parent's address"}],
        ),
        ServiceDefinition(
            "IDENTITY_MANUAL_REVIEW",
            "Identity Manual Review",
            "Officer-led review path used when the standard application cannot proceed.",
            5,
            required_documents=[{"type": "PROOF_OF_ADDRESS", "name": "Proof of parent's address"}],
        ),
    ]
