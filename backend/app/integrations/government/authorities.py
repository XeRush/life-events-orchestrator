"""Mock authorities (DEMO / MOCK INTEGRATION). Each class is the contract that authority would implement.

Field lists are the authority's own form (data minimisation): an adapter refuses any other passport field.
"""
from __future__ import annotations

from app.integrations.government.base import MockGovernmentAdapter, NotSupported
from app.integrations.government.contracts import Requirements, StatusResponse, SubmitRequest, SubmitResponse
from app.models.enums import Entity
from app.workflows.birth_expat import BY_KEY


def _fields(node_key: str) -> tuple[str, ...]:
    return BY_KEY[node_key].form_fields


def _docs(node_key: str) -> tuple[str, ...]:
    return BY_KEY[node_key].required_documents


class _BirthCertificate(MockGovernmentAdapter):
    service = "Birth certificate issuance"
    request_type = "BIRTH_CERTIFICATE"
    allowed_fields = _fields("BIRTH_CERTIFICATE")
    required_documents = _docs("BIRTH_CERTIFICATE")
    sla = "1-5 days"
    processing_detail = "The civil registrar is validating the hospital birth notification."
    cleared_detail = "Birth certificate issued."


class DhaAdapter(_BirthCertificate):
    """Dubai Health Authority - DHA Salama (mock)."""

    entity = Entity.DHA
    prefix = "DHA-BC"


class MohapAdapter(_BirthCertificate):
    """Ministry of Health and Prevention - northern emirates (mock)."""

    entity = Entity.MOHAP
    prefix = "MOHAP-BC"


class DohAdapter(_BirthCertificate):
    """Department of Health - Abu Dhabi (mock)."""

    entity = Entity.DOH
    prefix = "DOH-BC"


class MofaAdapter(MockGovernmentAdapter):
    """Ministry of Foreign Affairs attestation (mock)."""

    entity = Entity.MOFA
    prefix = "MOFA-ATT"
    service = "Birth certificate attestation"
    request_type = "ATTESTATION"
    allowed_fields = _fields("MOFA_ATTESTATION")
    required_documents = _docs("MOFA_ATTESTATION")
    sla = "2 hours - 3 working days"
    published_fee = "AED 150"
    processing_detail = "The MOFA attestation officer is reviewing the certificate."
    cleared_detail = "Birth certificate attested."


class GdrfaVisaAdapter(MockGovernmentAdapter):
    """GDRFA-Dubai residence visa via Amer (mock)."""

    entity = Entity.GDRFA
    prefix = "GDRFA-RV"
    service = "Newborn residence visa"
    request_type = "RESIDENCE_VISA"
    allowed_fields = _fields("RESIDENCE_VISA")
    required_documents = _docs("RESIDENCE_VISA")
    sla = "3-10 days"
    processing_detail = "The GDRFA-Dubai visa approver is reviewing the file."
    cleared_detail = "Residence visa issued."


class IcpVisaAdapter(GdrfaVisaAdapter):
    """ICP residence visa for families outside Dubai (mock)."""

    entity = Entity.ICP
    prefix = "ICP-RV"


class IcpEmiratesIdAdapter(MockGovernmentAdapter):
    """ICP Emirates ID (mock)."""

    entity = Entity.ICP
    prefix = "ICP-EID"
    service = "Emirates ID registration"
    request_type = "EMIRATES_ID"
    allowed_fields = _fields("EMIRATES_ID")
    required_documents = _docs("EMIRATES_ID")
    sla = "5-15 days, card by courier"
    processing_detail = "ICP card production is in progress."
    cleared_detail = "Emirates ID issued; card dispatched by courier."
    terminal_success = "COMPLETED"


class InsurerAdapter(MockGovernmentAdapter):
    """Health insurer dependant endorsement through DHA eClaimLink (mock)."""

    entity = Entity.INSURER
    prefix = "ECL-END"
    service = "Dependant insurance endorsement"
    request_type = "INSURANCE_ENDORSEMENT"
    allowed_fields = _fields("INSURANCE")
    required_documents = _docs("INSURANCE")
    sla = "No published SLA in our sources"
    processing_detail = "The insurer's underwriting team is adding the dependant."
    cleared_detail = "Dependant added to the policy."
    terminal_success = "COMPLETED"


class ConsulateAdapter(MockGovernmentAdapter):
    """Home-country consulate: a foreign mission. NO API, NO SLA, NO status feed - by design nothing is called.

    The class exists so the contract is explicit: every method refuses, and the graph relies on parent-reported
    milestones only. LifeLoop never claims a consulate status.
    """

    entity = Entity.CONSULATE
    prefix = "CONSULATE"
    service = "Child's passport (home country)"
    request_type = "PASSPORT"
    sla = "None - 2 to 8 weeks with no status feed"

    async def submit_request(self, request: SubmitRequest) -> SubmitResponse:
        raise NotSupported("The consulate has no API. LifeLoop records parent-reported milestones only.")

    async def get_status(self, external_ref: str) -> StatusResponse:
        raise NotSupported("The consulate has no status feed. Ask the parent; never infer.")

    async def cancel_request(self, external_ref: str) -> StatusResponse:
        raise NotSupported("The consulate has no API.")

    async def get_requirements(self) -> Requirements:
        return Requirements(entity=self.entity.value, service=self.service, required_fields=[],
                            required_documents=list(_docs("CONSULATE_PASSPORT")), sla=self.sla, has_api=False,
                            has_status_feed=False,
                            notes="Parent-reported milestones only: appointment booked, application submitted, passport issued.")
