"""The post-birth Life-Event Graph for expatriate parents (Idea Canvas, boxes C, H and L).

Six services, normally serial: birth certificate -> MOFA attestation -> home-country consulate passport ->
residence visa -> Emirates ID -> insurance endorsement. The template is data, not code paths: edges are a list,
so parallel branches can be added later without touching the engine.

Every SLA and fee carries the source it came from. Anything not in a source is not shown or spoken.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.models.enums import DocumentCategory, Entity, NodeState, NodeType

CANVAS = "Symphony Idea Canvas (Stage 1), box H - team research against published processes"

EMIRATES = ("DUBAI", "ABU_DHABI", "SHARJAH", "AJMAN", "UMM_AL_QUWAIN", "RAS_AL_KHAIMAH", "FUJAIRAH")

ENTITY_LABELS: dict[Entity, str] = {
    Entity.DHA: "Dubai Health Authority (DHA Salama)",
    Entity.MOHAP: "Ministry of Health and Prevention (MOHAP)",
    Entity.DOH: "Department of Health - Abu Dhabi (DOH)",
    Entity.MOFA: "Ministry of Foreign Affairs (MOFA)",
    Entity.CONSULATE: "Home-country consulate",
    Entity.GDRFA: "GDRFA-Dubai (via Amer)",
    Entity.ICP: "Federal Authority for Identity, Citizenship, Customs & Port Security (ICP)",
    Entity.INSURER: "Health insurer via DHA eClaimLink",
}


@dataclass(frozen=True)
class DocSpec:
    doc_type: str
    title: str
    category: DocumentCategory


DOCUMENTS: dict[str, DocSpec] = {d.doc_type: d for d in [
    DocSpec("HOSPITAL_BIRTH_NOTIFICATION", "Hospital birth notification", DocumentCategory.CHILD),
    DocSpec("ATTESTED_MARRIAGE_CERTIFICATE", "Attested marriage certificate (home country, UAE embassy, MOFA)", DocumentCategory.MARRIAGE_CERTIFICATE),
    DocSpec("FATHER_PASSPORT", "Father's passport", DocumentCategory.PASSPORT),
    DocSpec("MOTHER_PASSPORT", "Mother's passport", DocumentCategory.PASSPORT),
    DocSpec("FATHER_EMIRATES_ID", "Father's Emirates ID", DocumentCategory.EMIRATES_ID),
    DocSpec("MOTHER_EMIRATES_ID", "Mother's Emirates ID", DocumentCategory.EMIRATES_ID),
    DocSpec("SPONSOR_RESIDENCE_VISA", "Sponsoring parent's residence visa", DocumentCategory.VISA),
    DocSpec("CHILD_PHOTO", "Child's passport photograph", DocumentCategory.CHILD),
    DocSpec("BIRTH_CERTIFICATE", "Birth certificate", DocumentCategory.BIRTH_CERTIFICATE),
    DocSpec("ATTESTED_BIRTH_CERTIFICATE", "MOFA-attested birth certificate", DocumentCategory.BIRTH_CERTIFICATE),
    DocSpec("CHILD_PASSPORT", "Child's passport", DocumentCategory.PASSPORT),
    DocSpec("CHILD_RESIDENCE_VISA", "Child's residence visa", DocumentCategory.VISA),
    DocSpec("CHILD_EMIRATES_ID", "Child's Emirates ID", DocumentCategory.EMIRATES_ID),
    DocSpec("INSURANCE_ENDORSEMENT", "Dependant insurance endorsement", DocumentCategory.INSURANCE),
]}


@dataclass(frozen=True)
class NodeTemplate:
    key: str
    title: str
    type: NodeType
    depends_on: tuple[str, ...]
    required_documents: tuple[str, ...]
    outputs: tuple[str, ...]
    form_fields: tuple[str, ...]
    sla_hours: int | None
    sla_label: str
    success_state: NodeState = NodeState.CLEARED
    human_approval_required: bool = True
    resident_present_required: bool = False
    resident_present_reason: str | None = None
    fee_note: str | None = None
    lifeloop_does: str = ""
    parent_does: str = ""
    sources: tuple[str, ...] = field(default=(CANVAS,))


TEMPLATE: tuple[NodeTemplate, ...] = (
    NodeTemplate(
        key="BIRTH_CERTIFICATE", title="Birth certificate", type=NodeType.ENTITY_FILING, depends_on=(),
        required_documents=("HOSPITAL_BIRTH_NOTIFICATION", "ATTESTED_MARRIAGE_CERTIFICATE", "FATHER_PASSPORT", "MOTHER_PASSPORT",
                            "FATHER_EMIRATES_ID", "MOTHER_EMIRATES_ID"),
        outputs=("BIRTH_CERTIFICATE",),
        form_fields=("child.full_name_en", "child.full_name_ar", "child.date_of_birth", "child.sex", "child.place_of_birth",
                     "child.birth_notification_ref", "father.full_name", "father.nationality", "father.emirates_id_token",
                     "mother.full_name", "mother.nationality", "mother.emirates_id_token"),
        sla_hours=120, sla_label="1-5 days",
        lifeloop_does="Prepares and files the application with the issuer for your emirate once an officer releases it.",
        parent_does="Nothing to attend. The attested marriage certificate must be ready before this step opens.",
    ),
    NodeTemplate(
        key="MOFA_ATTESTATION", title="MOFA attestation", type=NodeType.ENTITY_FILING, depends_on=("BIRTH_CERTIFICATE",),
        required_documents=("BIRTH_CERTIFICATE",), outputs=("ATTESTED_BIRTH_CERTIFICATE",),
        form_fields=("birth_certificate.reference", "child.full_name_en"),
        sla_hours=72, sla_label="2 hours - 3 working days",
        fee_note="AED 150 attestation fee (Idea Canvas box H, stage 3; confirm against the current MOFA schedule)",
        lifeloop_does="Files the attestation request with MOFA after officer release.",
        parent_does="Nothing to attend.",
    ),
    NodeTemplate(
        key="CONSULATE_PASSPORT", title="Consulate passport", type=NodeType.PARENT_REPORTED, depends_on=("MOFA_ATTESTATION",),
        required_documents=("ATTESTED_BIRTH_CERTIFICATE", "FATHER_PASSPORT", "MOTHER_PASSPORT"), outputs=(),
        form_fields=(), sla_hours=None, sla_label="No SLA - 2 to 8 weeks with no status feed",
        success_state=NodeState.COMPLETED, human_approval_required=False, resident_present_required=True,
        resident_present_reason="Consulate appointment",
        lifeloop_does="Cannot file or track this step: the consulate has no API, no SLA and no status feed. LifeLoop asks you for each milestone and records it as parent-reported.",
        parent_does="Book and attend the consulate appointment, then tell LifeLoop when the passport is issued.",
    ),
    NodeTemplate(
        key="RESIDENCE_VISA", title="Residence visa", type=NodeType.ENTITY_FILING, depends_on=("CONSULATE_PASSPORT",),
        required_documents=("CHILD_PASSPORT", "ATTESTED_BIRTH_CERTIFICATE", "SPONSOR_RESIDENCE_VISA", "CHILD_PHOTO"),
        outputs=("CHILD_RESIDENCE_VISA",),
        form_fields=("child.full_name_en", "child.date_of_birth", "child.nationality", "child.passport_present",
                     "sponsor.emirates_id_token", "birth_certificate.reference"),
        sla_hours=240, sla_label="3-10 days, blocked until the consulate step clears",
        lifeloop_does="Re-plans the visa filing the moment the passport is reported, then files after officer release.",
        parent_does="Nothing to attend unless the authority asks for a document.",
    ),
    NodeTemplate(
        key="EMIRATES_ID", title="Emirates ID", type=NodeType.ENTITY_FILING, depends_on=("RESIDENCE_VISA",),
        required_documents=("CHILD_PASSPORT", "CHILD_RESIDENCE_VISA"), outputs=("CHILD_EMIRATES_ID",),
        form_fields=("visa.reference", "child.full_name_en", "child.date_of_birth"),
        sla_hours=360, sla_label="5-15 days, card by courier", success_state=NodeState.COMPLETED,
        resident_present_required=True, resident_present_reason="ICP biometrics",
        lifeloop_does="Files the Emirates ID application after officer release and tells you when biometrics are due.",
        parent_does="Attend ICP biometrics with the child if the centre requires it.",
    ),
    NodeTemplate(
        key="INSURANCE", title="Insurance endorsement", type=NodeType.ENTITY_FILING, depends_on=("EMIRATES_ID",),
        required_documents=("CHILD_EMIRATES_ID", "CHILD_RESIDENCE_VISA"), outputs=("INSURANCE_ENDORSEMENT",),
        form_fields=("child.full_name_en", "child.date_of_birth", "emirates_id.reference", "sponsor.full_name"),
        sla_hours=72, sla_label="LifeLoop service target (no published SLA in our sources)", success_state=NodeState.COMPLETED,
        lifeloop_does="Files the dependant endorsement with the insurer through DHA eClaimLink after officer release.",
        parent_does="Nothing to attend.",
    ),
)

BY_KEY: dict[str, NodeTemplate] = {t.key: t for t in TEMPLATE}
NODE_ORDER: tuple[str, ...] = tuple(t.key for t in TEMPLATE)


def entity_for(node_key: str, emirate: str) -> Entity:
    """Which authority handles this node, given where the child was born / the family lives."""
    emirate = (emirate or "DUBAI").upper()
    if node_key == "BIRTH_CERTIFICATE":
        return {"DUBAI": Entity.DHA, "ABU_DHABI": Entity.DOH}.get(emirate, Entity.MOHAP)
    if node_key == "MOFA_ATTESTATION":
        return Entity.MOFA
    if node_key == "CONSULATE_PASSPORT":
        return Entity.CONSULATE
    if node_key == "RESIDENCE_VISA":
        return Entity.GDRFA if emirate == "DUBAI" else Entity.ICP
    if node_key == "EMIRATES_ID":
        return Entity.ICP
    return Entity.INSURER


def entity_label(entity: Entity, nationality: str | None = None) -> str:
    if entity == Entity.CONSULATE and nationality:
        return f"{nationality} consulate (home country - not a UAE entity)"
    return ENTITY_LABELS[entity]


def edges() -> list[tuple[str, str]]:
    return [(dep, t.key) for t in TEMPLATE for dep in t.depends_on]
