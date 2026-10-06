"""Case aggregate: intake, status derivation, deadline, risk, the Life-Event Passport write log and views."""
from __future__ import annotations

import hashlib
from datetime import date, timedelta
from typing import TYPE_CHECKING, Any

from sqlalchemy import func, select

from app.core.clock import utcnow
from app.core.errors import EmailNotVerified, ValidationFailed
from app.core.i18n import node_title, normalise_lang, t
from app.core.pii import is_valid_eid, keyed_hash, last4, mask_phone, normalise_eid
from app.events.recorder import Actor
from app.models.case import Case, Child, Parent
from app.models.enums import (
    ATTENTION_STATES,
    DONE_STATES,
    CaseStatus,
    ConsentType,
    EscalationStatus,
    NodeState,
    OrganizationKind,
    ParentRole,
    RiskLevel,
    Source,
    UserRole,
)
from app.models.officer import Escalation
from app.models.organization import Organization
from app.models.user import User
from app.services.graph_service import next_action
from app.workflows.birth_expat import BY_KEY, EMIRATES
from app.workflows.step_text import step_text

if TYPE_CHECKING:
    from app.schemas.cases import IntakeIn
    from app.services.container import ServiceContainer

PASSPORT_FIELDS_FROM_INTAKE = (
    "child.full_name_en", "child.full_name_ar", "child.date_of_birth", "child.sex", "child.place_of_birth", "child.nationality",
    "father.full_name", "father.nationality", "father.emirates_id", "mother.full_name", "mother.nationality",
    "mother.emirates_id", "case.emirate", "case.language", "marriage_certificate.attested",
)


class CaseService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    # --- intake ----------------------------------------------------------------------------------------------
    async def create_from_intake(self, resident: User, data: IntakeIn, *, channel: str, actor: Actor,
                                 call_session_id: Any = None, reference: str | None = None, is_demo: bool = False) -> tuple[Case, bool]:
        """Create the case once. Returns (case, created). A repeated submission returns the existing case."""
        if channel == "WEB" and self.c.settings.require_email_verification and resident.role == UserRole.RESIDENT and not resident.email_verified:
            raise EmailNotVerified("Please confirm your email address before opening a case.")
        if not (data.consent_data_processing and data.consent_service_filing):
            raise ValidationFailed("LifeLoop needs consent to process your details and to file on your behalf.", code="consent_required")
        for label, eid in (("father", data.father_emirates_id), ("mother", data.mother_emirates_id)):
            if eid and not is_valid_eid(eid):
                raise ValidationFailed(f"The {label}'s Emirates ID must be 15 digits starting with 784.", code="invalid_emirates_id")
        emirate = data.emirate.upper()
        if emirate not in EMIRATES:
            raise ValidationFailed("Unknown emirate.", code="invalid_emirate")
        key = hashlib.sha256(f"{resident.id}|{data.child_date_of_birth}|{data.child_full_name_en.strip().lower()}".encode()).hexdigest()
        existing = await self.c.cases_repo.by_idempotency(key)
        if existing:
            return existing, False

        now = utcnow()
        org = await self._service_centre(emirate)
        officer = await self._least_loaded_officer(org)
        year = now.year
        case = Case(
            reference=reference or f"LL-{year}-{await self.c.cases_repo.next_sequence(year):06d}", resident_id=resident.id, is_demo=is_demo,
            organization_id=org.id if org else None, assigned_officer_id=officer.id if officer else None,
            status=CaseStatus.INTAKE, language=normalise_lang(data.language), emirate=emirate, birth_date=data.child_date_of_birth,
            deadline_date=data.child_date_of_birth + timedelta(days=self.c.settings.legal_deadline_days), intake_channel=channel,
            idempotency_key=key, last_activity_at=now,
        )
        self.c.session.add(case)
        await self.c.session.flush()
        pepper = self.c.settings.pii_hash_key or self.c.settings.jwt_secret
        for role, name, nationality, eid in (
            (ParentRole.FATHER, data.father_full_name, data.father_nationality or data.child_nationality, data.father_emirates_id),
            (ParentRole.MOTHER, data.mother_full_name, data.mother_nationality or data.child_nationality, data.mother_emirates_id),
        ):
            if name:
                self.c.session.add(Parent(case_id=case.id, role=role, full_name=name.strip(), nationality=nationality,
                                          emirates_id_hash=keyed_hash(normalise_eid(eid), pepper) if eid else None,
                                          emirates_id_last4=last4(eid) if eid else None))
        self.c.session.add(Child(case_id=case.id, full_name_en=data.child_full_name_en.strip(), full_name_ar=data.child_full_name_ar,
                                 date_of_birth=data.child_date_of_birth, sex=data.child_sex, place_of_birth=data.place_of_birth.strip(),
                                 nationality=data.child_nationality, birth_notification_ref=data.birth_notification_ref))
        if data.phone and not resident.phone:
            resident.phone = data.phone
        case.passport = {f: {"captured_at": now.isoformat(), "source": channel, "call_session_id": str(call_session_id) if call_session_id else None}
                         for f in PASSPORT_FIELDS_FROM_INTAKE}
        await self.c.session.flush()
        await self.c.events.emit("CaseCreated", case_id=case.id, actor=actor, source=Source.AI_AGENT if channel == "VOICE" else Source.RESIDENT,
                                 title=f"Case {case.reference} opened", description=f"New baby, born {data.child_date_of_birth.isoformat()} in {emirate.replace('_', ' ').title()}. Intake by {channel.lower()}.",
                                 payload={"reference": case.reference, "channel": channel, "emirate": emirate},
                                 i18n={"key": "timeline.caseCreated", "params": {"ref": case.reference, "date": data.child_date_of_birth.isoformat(),
                                                                                 "emirate": emirate, "channel": channel}})
        await self.c.graph.build(case, data.child_nationality)
        await self.c.documents.ensure_for_case(case, marriage_certificate_attested=data.marriage_certificate_attested)
        consent_actor = actor
        await self.c.consents.capture(case, resident, ConsentType.DATA_PROCESSING, source=channel, actor=consent_actor, call_session_id=call_session_id)
        await self.c.consents.capture(case, resident, ConsentType.SERVICE_FILING, source=channel, actor=consent_actor, call_session_id=call_session_id)
        if data.consent_callback:
            await self.c.consents.capture(case, resident, ConsentType.CALLBACK, source=channel, actor=consent_actor, call_session_id=call_session_id)
        case.status = CaseStatus.ACTIVE
        await self.c.events.emit("IntakeCompleted", case_id=case.id, actor=actor, source=Source.AI_AGENT if channel == "VOICE" else Source.RESIDENT,
                                 title="Six-entity task graph built",
                                 description="Birth certificate, MOFA attestation, consulate passport, residence visa, Emirates ID, insurance.",
                                 payload={"nodes": list(BY_KEY)}, i18n={"key": "timeline.graphBuilt", "params": {}})
        return case, True

    async def _service_centre(self, emirate: str) -> Organization | None:
        query = select(Organization).where(Organization.kind == OrganizationKind.SERVICE_CENTRE, Organization.is_active.is_(True))
        return await self.c.session.scalar(query.where(Organization.emirate == emirate).limit(1)) or await self.c.session.scalar(query.limit(1))

    async def _least_loaded_officer(self, org: Organization | None) -> User | None:
        officers = await self.c.users_repo.officers(org.id if org else None)
        if not officers:
            return None
        loads = dict((await self.c.session.execute(
            select(Case.assigned_officer_id, func.count()).where(Case.status.notin_([CaseStatus.COMPLETED, CaseStatus.CLOSED]))
            .group_by(Case.assigned_officer_id))).all())
        return min(officers, key=lambda o: loads.get(o.id, 0))

    # --- passport write log ----------------------------------------------------------------------------------
    def record_capture(self, case: Case, field: str, source: str) -> None:
        """Every re-collection of a field already captured counts against the 'captured once' KPI."""
        passport = dict(case.passport or {})
        if field in passport:
            case.re_entry_count += 1
        passport[field] = {"captured_at": utcnow().isoformat(), "source": source}
        case.passport = passport

    # --- derived state -------------------------------------------------------------------------------------------
    async def refresh(self, case: Case) -> None:
        nodes = await self.c.nodes_repo.for_case(case.id)
        open_escalations = await self.c.session.scalar(select(func.count()).select_from(Escalation).where(
            Escalation.case_id == case.id, Escalation.status != EscalationStatus.RESOLVED)) or 0
        previous = case.status
        if case.status != CaseStatus.CLOSED and case.status != CaseStatus.INTAKE:
            if nodes and all(n.state in DONE_STATES for n in nodes):
                case.status = CaseStatus.COMPLETED
                case.completed_at = case.completed_at or utcnow()
            elif open_escalations:
                case.status = CaseStatus.ESCALATED
            elif any(n.state in (NodeState.WAITING_FOR_PARENT, NodeState.DOCUMENT_MISSING) for n in nodes):
                case.status = CaseStatus.WAITING_FOR_PARENT
            elif any(n.state == NodeState.WAITING_FOR_HUMAN for n in nodes):
                case.status = CaseStatus.WAITING_FOR_HUMAN
            else:
                case.status = CaseStatus.ACTIVE
        case.risk = self._risk(case, nodes, open_escalations)
        case.last_activity_at = utcnow()
        if previous != case.status:
            await self.c.events.emit("CaseStatusChanged", case_id=case.id, payload={"from": previous.value, "to": case.status.value})
            if case.status == CaseStatus.COMPLETED:
                await self.c.events.emit("CaseCompleted", case_id=case.id, source=Source.SYSTEM, title="Case complete",
                                         description="Every service in the case has been cleared or completed.",
                                         idempotency_key=f"case-completed:{case.id}", i18n={"key": "timeline.caseCompleted", "params": {}})

    def _risk(self, case: Case, nodes: list, open_escalations: int) -> RiskLevel:
        if case.status == CaseStatus.COMPLETED:
            return RiskLevel.LOW
        days = self.days_remaining(case)
        if open_escalations or any(n.state in (NodeState.STALLED, NodeState.REJECTED, NodeState.BLOCKED) for n in nodes) or (days is not None and days < 21):
            return RiskLevel.HIGH
        if any(n.state == NodeState.DOCUMENT_MISSING for n in nodes) or (days is not None and days < 45):
            return RiskLevel.MEDIUM
        return RiskLevel.LOW

    def days_remaining(self, case: Case) -> int | None:
        return (case.deadline_date - date.today()).days if case.deadline_date else None

    def deadline(self, case: Case, lang: str | None = None) -> dict[str, Any]:
        days = self.days_remaining(case)
        state = "COMPLETE" if case.status == CaseStatus.COMPLETED else (
            "OVERDUE" if days is not None and days < 0 else "AT_RISK" if days is not None and days < 30 else "ON_TRACK")
        return {"deadline_date": case.deadline_date.isoformat() if case.deadline_date else None, "days_remaining": days,
                "status": state, "legal_days": self.c.settings.legal_deadline_days,
                "source": step_text("deadline_source", lang)}

    # --- views -----------------------------------------------------------------------------------------------------
    async def summary_sentence(self, case: Case, lang: str | None = None) -> str:
        lang = normalise_lang(lang or case.language)
        nodes = await self.c.nodes_repo.for_case(case.id)
        if nodes and all(n.state in DONE_STATES for n in nodes):
            return t("status_complete", lang)
        done = sum(1 for n in nodes if n.state in DONE_STATES)
        current = next((n for n in nodes if n.state not in DONE_STATES and n.state != NodeState.PENDING), None)
        if current is None:
            phrase = t("no_action", lang)
        elif current.state in ATTENTION_STATES:
            phrase = t("status_attention", lang, node=node_title(current.key, lang, current.title), reason=current.blocked_reason or current.status)
        elif current.state == NodeState.WAITING_FOR_HUMAN:
            phrase = t("status_current_officer", lang, node=node_title(current.key, lang, current.title))
        elif current.state == NodeState.WAITING_FOR_PARENT:
            phrase = t("status_current_parent", lang, node=node_title(current.key, lang, current.title), action=next_action(current, lang)[0] or "")
        else:
            phrase = t("status_current_entity", lang, node=node_title(current.key, lang, current.title), entity=current.entity_label) + " " + t("no_confirmed_update", lang)
        return t("status_summary", lang, done=done, current=phrase)

    async def view(self, case: Case, viewer: User | None = None, lang: str | None = None) -> dict[str, Any]:
        lang = normalise_lang(lang or case.language)
        nodes = await self.c.nodes_repo.for_case(case.id)
        child = await self.c.cases_repo.child(case.id)
        parents = await self.c.cases_repo.parents(case.id)
        resident = await self.c.users_repo.get(case.resident_id)
        officer = await self.c.users_repo.get(case.assigned_officer_id) if case.assigned_officer_id else None
        org = await self.c.orgs_repo.get(case.organization_id) if case.organization_id else None
        docs = await self.c.docs_repo.for_case(case.id)
        callback_consent = await self.c.consents_repo.active(case.id, ConsentType.CALLBACK)
        opt_out = await self.c.optouts_repo.active(case.id)
        done = [n for n in nodes if n.state in DONE_STATES]
        current = next((n for n in nodes if n.state not in DONE_STATES and n.state != NodeState.PENDING), None)
        attention = [n for n in nodes if n.state in ATTENTION_STATES]
        action_node = next((n for n in nodes if n.next_action and n.state not in DONE_STATES and n.state != NodeState.PENDING), None)
        outstanding = [d for d in docs if d.required and d.status.value in ("MISSING", "EXPIRED")]
        staff = viewer is not None and viewer.role in (UserRole.OFFICER, UserRole.ADMIN)
        return {
            "id": str(case.id), "reference": case.reference, "status": case.status.value, "risk": case.risk.value,
            "language": case.language, "channel_mode": case.channel_mode.value, "emirate": case.emirate,
            "life_event_type": case.life_event_type, "intake_channel": case.intake_channel, "is_demo": case.is_demo,
            "created_at": case.created_at.isoformat(), "last_activity_at": case.last_activity_at.isoformat() if case.last_activity_at else None,
            "completed_at": case.completed_at.isoformat() if case.completed_at else None,
            "child": {"full_name_en": child.full_name_en, "full_name_ar": child.full_name_ar, "date_of_birth": child.date_of_birth.isoformat(),
                      "nationality": child.nationality, "place_of_birth": child.place_of_birth, "sex": child.sex} if child else None,
            "parents": [{"role": p.role.value, "full_name": p.full_name, "nationality": p.nationality,
                         "emirates_id": f"784-****-*******-{p.emirates_id_last4[-1]}" if p.emirates_id_last4 and not staff else
                         (f"ending {p.emirates_id_last4}" if p.emirates_id_last4 else None)} for p in parents],
            "resident": {"id": str(resident.id), "full_name": resident.full_name, "phone": mask_phone(resident.phone),
                         "email": resident.email if staff or (viewer and viewer.id == resident.id) else None} if resident else None,
            "assigned_officer": {"id": str(officer.id), "full_name": officer.full_name, "title": officer.title} if officer else None,
            "organization": {"id": str(org.id), "name": org.name, "code": org.code} if org else None,
            "deadline": self.deadline(case, lang),
            "progress": {"done": len(done), "total": len(nodes), "percent": round(100 * len(done) / len(nodes)) if nodes else 0},
            "current_node": {"key": current.key, "title": current.title, "state": current.state.value, "entity_label": current.entity_label} if current else None,
            "attention_nodes": [{"key": n.key, "title": n.title, "state": n.state.value, "reason": n.blocked_reason} for n in attention],
            "next_action": {"text": next_action(action_node, lang)[0], "owner": action_node.next_action_owner, "node_key": action_node.key} if action_node else None,
            "outstanding_documents": [{"doc_type": d.doc_type, "title": d.title, "status": d.status.value} for d in outstanding],
            "consent": {"callback": bool(callback_consent), "token_present": bool(callback_consent and callback_consent.token),
                        "captured_at": callback_consent.captured_at.isoformat() if callback_consent else None},
            "opted_out": bool(opt_out), "opted_out_at": case.opted_out_at.isoformat() if case.opted_out_at else None,
            "passport": {"fields_captured": len(case.passport or {}), "re_entries": case.re_entry_count},
            "summary": await self.summary_sentence(case, lang),
        }

    async def list_view(self, case: Case) -> dict[str, Any]:
        nodes = await self.c.nodes_repo.for_case(case.id)
        child = await self.c.cases_repo.child(case.id)
        resident = await self.c.users_repo.get(case.resident_id)
        current = next((n for n in nodes if n.state not in DONE_STATES and n.state != NodeState.PENDING), None)
        node = next((n for n in nodes if n.state not in DONE_STATES and n.sla_due_at), None)
        sla_breached = bool(node and node.sla_due_at and node.sla_due_at < utcnow())
        return {
            "id": str(case.id), "reference": case.reference, "status": case.status.value, "risk": case.risk.value,
            "child_name": child.full_name_en if child else None, "resident_name": resident.full_name if resident else None,
            "current_node": {"key": current.key, "title": current.title, "state": current.state.value} if current else None,
            "progress": {"done": sum(1 for n in nodes if n.state in DONE_STATES), "total": len(nodes)},
            "deadline": self.deadline(case), "channel_mode": case.channel_mode.value, "language": case.language,
            "last_activity_at": case.last_activity_at.isoformat() if case.last_activity_at else None,
            "sla": {"due_at": node.sla_due_at.isoformat() if node and node.sla_due_at else None, "breached": sla_breached},
            "officer_action": "RELEASE" if any(n.state == NodeState.WAITING_FOR_HUMAN for n in nodes) else
                              "REVIEW" if any(n.state in ATTENTION_STATES for n in nodes) else None,
            "assigned_officer_id": str(case.assigned_officer_id) if case.assigned_officer_id else None,
        }
