"""Idempotent seed: if the data exists, leave it; otherwise create it.

Reference data: the platform organisation, the Amer service centre, demo users (resident, officer, admin) and a
second officer whose invitation is still pending. Demo cases are built by RUNNING THE REAL PIPELINE under a
backdated clock (intake -> orchestrator -> officer release -> mock authority -> consumers -> callbacks), so their
timeline, audit trail and outbox history are genuine, not hand-written rows.
"""
from __future__ import annotations

import secrets
import sys
from collections.abc import Awaitable, Callable
from dataclasses import replace
from datetime import UTC, date, datetime, time, timedelta
from typing import TYPE_CHECKING, Any

from app.core.clock import use_clock, utcnow
from app.core.security import hash_password
from app.events.broker import BrokerManager
from app.events.pump import pump
from app.events.recorder import Actor
from app.models.call import CallSession, Transcript
from app.models.enums import (
    CallbackStatus,
    CallDirection,
    CallProvider,
    CallState,
    DocumentStatus,
    EscalationReason,
    OrganizationKind,
    Source,
    SubAgent,
    TranscriptRole,
    UserRole,
)
from app.models.organization import Organization
from app.models.user import User
from app.observability.logging import get_logger
from app.repositories.repos import CaseRepository, OrganizationRepository, UserRepository

if TYPE_CHECKING:
    from app.services.container import ServiceContainer
    from app.services.infra import Infra

log = get_logger("lifeloop.seed")
DEMO_CASE_REFERENCE = "LL-DEMO-001"
DEMO_RESIDENT = "demo.resident@lifeloop.local"
DEMO_OFFICER = "demo.officer@lifeloop.local"
DEMO_ADMIN = "demo.admin@lifeloop.local"

ORGS = (
    {"code": "LIFELOOP", "name": "LifeLoop Platform (Team Symphony)", "kind": OrganizationKind.PLATFORM, "emirate": "DUBAI"},
    {"code": "AMER-BARSHA", "name": "Amer Centre - Al Barsha, Dubai", "kind": OrganizationKind.SERVICE_CENTRE, "emirate": "DUBAI"},
)


def _container(session, infra: Infra) -> ServiceContainer:
    from app.services.container import ServiceContainer

    return ServiceContainer(session, infra=infra)


async def ensure_organizations(c: ServiceContainer) -> dict[str, Organization]:
    repo = OrganizationRepository(c.session)
    out = {}
    for spec in ORGS:
        org = await repo.by_code(spec["code"])
        if org is None:
            org = Organization(**spec)
            c.session.add(org)
            await c.session.flush()
        out[spec["code"]] = org
    return out


async def ensure_users(c: ServiceContainer, orgs: dict[str, Organization]) -> dict[str, User]:
    settings = c.settings
    password = settings.demo_user_password
    generated = False
    if not password:
        if not settings.is_development:
            log.warning("demo_users_skipped", reason="DEMO_USER_PASSWORD not set outside development")
            return {}
        password, generated = secrets.token_urlsafe(10), True
    repo = UserRepository(c.session)
    specs = (
        {"email": DEMO_RESIDENT, "full_name": "Demo Resident", "role": UserRole.RESIDENT, "org": None, "title": None, "phone": "+971500000101",
         "login": True},
        {"email": DEMO_OFFICER, "full_name": "Mariam Al Ali", "role": UserRole.OFFICER, "org": "AMER-BARSHA", "title": "Amer Officer",
         "phone": None, "login": True},
        {"email": DEMO_ADMIN, "full_name": "Demo Administrator", "role": UserRole.ADMIN, "org": "LIFELOOP", "title": "Platform Administrator",
         "phone": None, "login": True},
        {"email": "khalid.officer@lifeloop.local", "full_name": "Khalid Al Mansoori", "role": UserRole.OFFICER, "org": "AMER-BARSHA",
         "title": "Senior Amer Officer", "phone": None, "login": False},
    )
    out, created = {}, []
    for spec in specs:
        user = await repo.by_email(spec["email"])
        if user is None:
            user = User(email=spec["email"], full_name=spec["full_name"], role=spec["role"], title=spec["title"], phone=spec["phone"],
                        organization_id=orgs[spec["org"]].id if spec["org"] else None, is_active=True, preferred_language="en",
                        hashed_password=hash_password(password, settings.bcrypt_rounds) if spec["login"] else None,
                        email_verified_at=utcnow() if spec["login"] else None, password_changed_at=utcnow() if spec["login"] else None)
            c.session.add(user)
            created.append(spec["email"])
        out[spec["email"]] = user
    await c.session.flush()
    if created and generated:
        print(f"\n[LifeLoop seed] Demo users created with a generated password: {password}\n"
              "  Set DEMO_USER_PASSWORD in .env to choose your own.\n", file=sys.stderr)
    return out


async def _seeded_resident(c: ServiceContainer, email: str, name: str, language: str, phone: str) -> User:
    user = await UserRepository(c.session).by_email(email)
    if user is None:
        user = User(email=email, full_name=name, role=UserRole.RESIDENT, preferred_language=language, phone=phone, hashed_password=None,
                    email_verified_at=utcnow(), is_active=True)
        c.session.add(user)
        await c.session.flush()
    return user


class Script:
    """Runs steps against the real services on a backdated clock, pumping events between steps."""

    def __init__(self, infra: Infra, start: datetime) -> None:
        self.infra = replace(infra, broker=BrokerManager(infra.settings))  # private in-memory broker for the seed
        self.start = start
        self.tick = 0

    def _clock(self, at: datetime) -> Callable[[], datetime]:
        def now() -> datetime:
            self.tick += 1
            return at + timedelta(milliseconds=self.tick * 400)
        return now

    async def at(self, offset: timedelta, fn: Callable[[ServiceContainer], Awaitable[Any]]) -> Any:
        self.tick = 0
        with use_clock(self._clock(self.start + offset)):
            async with self.infra.sessionmaker() as session:
                c = _container(session, self.infra)
                result = await fn(c)
                await c.commit()
            await pump(self.infra)
        return result


async def _finish_callbacks(c: ServiceContainer, case_id, duration: float = 48.0) -> None:
    """Emulate the resident answering the scheduled callback (the seed has no live dialer)."""
    from app.core.i18n import t

    case = await c.cases_repo.get(case_id)
    for cb in await c.callbacks_repo.open_for_case(case_id):
        call = CallSession(case_id=case_id, user_id=case.resident_id, callback_id=cb.id, direction=CallDirection.OUTBOUND,
                           provider=CallProvider.SIMULATED, language=cb.language, state=CallState.ENDED, started_at=utcnow(),
                           ended_at=utcnow() + timedelta(seconds=duration), duration_seconds=duration, verified=True,
                           verification_method="UAE_PASS", disclosure_at=utcnow(), outcome="Resident updated by voice")
        c.session.add(call)
        await c.session.flush()
        lines = [(TranscriptRole.AGENT, t("disclosure_callback", cb.language, ref=case.reference), True),
                 (TranscriptRole.RESIDENT, "English, please. I'll approve with UAE Pass.", False),
                 (TranscriptRole.AGENT, t("verify_ok", cb.language) + " " + c.callbacks.compose(case, cb.reasons, cb.language), False),
                 (TranscriptRole.RESIDENT, "Thank you.", False), (TranscriptRole.AGENT, t("goodbye", cb.language), False)]
        for seq, (role, text, disclosure) in enumerate(lines, start=1):
            c.session.add(Transcript(call_session_id=call.id, case_id=case_id, seq=seq, role=role, text=text, language=cb.language,
                                     sub_agent=SubAgent.STATUS if role == TranscriptRole.AGENT else None, is_disclosure=disclosure))
        cb.status, cb.dialed_at, cb.call_session_id, cb.provider = CallbackStatus.DIALING, utcnow(), call.id, "SIMULATED"
        await c.callbacks.complete(cb, duration=duration, outcome="Resident updated by voice (verified with UAE Pass - simulated)")


async def _intake_call(c: ServiceContainer, user: User, case, language: str = "en") -> None:
    from app.core.i18n import t

    call = CallSession(case_id=case.id, user_id=user.id, direction=CallDirection.INBOUND, provider=CallProvider.SIMULATED, language=language,
                       state=CallState.ENDED, started_at=utcnow() - timedelta(minutes=6), ended_at=utcnow(), duration_seconds=352.0, verified=True,
                       verification_method="AUTHENTICATED_SESSION", disclosure_at=utcnow() - timedelta(minutes=6), outcome="Case opened",
                       extracted_fields={"child_name_captured": True, "consent_callback": True, "language": language})
    c.session.add(call)
    await c.session.flush()
    lines = [
        (TranscriptRole.AGENT, t("disclosure", language), True), (TranscriptRole.RESIDENT, "English, please.", False),
        (TranscriptRole.AGENT, t("language_confirmed", language, language="English") + " " + t("intake_open", language), False),
        (TranscriptRole.RESIDENT, "Yes, our daughter was born yesterday at Latifa Hospital in Dubai.", False),
        (TranscriptRole.AGENT, t("intake_congrats", language) + " " + t("ask_child_name", language), False),
        (TranscriptRole.RESIDENT, "Demo Child.", False), (TranscriptRole.AGENT, t("ask_father_eid", language), False),
        (TranscriptRole.RESIDENT, "[EMIRATES_ID]", False), (TranscriptRole.AGENT, t("eid_recorded", language) + " " + t("ask_consent", language), False),
        (TranscriptRole.RESIDENT, "Yes, please call me.", False),
        (TranscriptRole.AGENT, t("intake_summary", language, ref=case.reference) + " " + t("plan_explained", language), False),
    ]
    for seq, (role, text, disclosure) in enumerate(lines, start=1):
        c.session.add(Transcript(call_session_id=call.id, case_id=case.id, seq=seq, role=role, text=text, language=language,
                                 sub_agent=SubAgent.INTAKE if role == TranscriptRole.AGENT and seq > 1 else (SubAgent.ROUTER if disclosure else None),
                                 is_disclosure=disclosure, tool_name="create_case" if seq == len(lines) else None))


async def _upload_demo_docs(c: ServiceContainer, case, officer: User, doc_types: tuple[str, ...]) -> None:
    for doc_type in doc_types:
        doc = await c.docs_repo.by_type(case.id, doc_type)
        if doc is None:
            continue
        doc.status, doc.uploaded_at, doc.file_name, doc.mime_type = DocumentStatus.VERIFIED, utcnow(), f"{doc_type.lower()}.pdf", "application/pdf"
        doc.verified_by_id, doc.verified_at, doc.source = officer.id, utcnow(), Source.RESIDENT
        doc.notes = "Demo placeholder - no file stored. Checked by a LifeLoop officer (not a government verification)."


def _intake(**kw: Any):
    from app.schemas.cases import IntakeIn

    return IntakeIn(**kw)


async def _approve(c: ServiceContainer, case_ref: str, node_key: str, officer_email: str) -> None:
    case = await c.cases_repo.by_reference(case_ref)
    node = await c.nodes_repo.by_key(case.id, node_key)
    approval = await c.approvals_repo.pending_for_node(node.id)
    officer = await c.users_repo.by_email(officer_email)
    await c.approvals.approve(approval.id, officer, note="Checked the prepared fields against the documents on file.")


async def _authority(c: ServiceContainer, case_ref: str, node_key: str, status: str) -> None:
    case = await c.cases_repo.by_reference(case_ref)
    node = await c.nodes_repo.by_key(case.id, node_key)
    await c.entities.simulate(case, node, status)


async def _parent(c: ServiceContainer, case_ref: str, milestone: str, **kw: Any) -> None:
    case = await c.cases_repo.by_reference(case_ref)
    user = await c.users_repo.get(case.resident_id)
    await c.consulate.report(case, milestone, actor=Actor(Actor.user(user).type, f"{user.full_name} (parent, by voice)", user.id),
                             channel="VOICE", **kw)


async def build_primary_demo_case(infra: Infra) -> None:
    """LL-DEMO-001: birth certificate CLEARED, MOFA CLEARED, consulate PARENT-REPORTED, visa PROCESSING, EID and insurance PENDING."""
    async with infra.sessionmaker() as session:
        if await CaseRepository(session).by_reference(DEMO_CASE_REFERENCE):
            return
        resident = await UserRepository(session).by_email(DEMO_RESIDENT)
        officer = await UserRepository(session).by_email(DEMO_OFFICER)
        if resident is None or officer is None:
            return
    dob = date.today() - timedelta(days=46)
    s = Script(infra, datetime.combine(dob, time(5, 10), tzinfo=UTC))
    ref = DEMO_CASE_REFERENCE

    async def intake(c: ServiceContainer) -> None:
        user = await c.users_repo.by_email(DEMO_RESIDENT)
        case, _ = await c.cases.create_from_intake(user, _intake(
            language="en", emirate="DUBAI", child_full_name_en="Demo Child", child_full_name_ar="طفل تجريبي", child_date_of_birth=dob, child_sex="F",
            place_of_birth="Latifa Hospital", child_nationality="Indian", birth_notification_ref="DHA-BN-2026-004512",
            father_full_name="Demo Father", father_nationality="Indian", father_emirates_id="784-1988-1234567-1",
            mother_full_name="Demo Mother", mother_nationality="Indian", mother_emirates_id="784-1991-7654321-2",
            marriage_certificate_attested=True, consent_data_processing=True, consent_service_filing=True, consent_callback=True,
        ), channel="VOICE", actor=Actor.agent(), reference=ref, is_demo=True)
        await _intake_call(c, user, case)
        await _upload_demo_docs(c, case, await c.users_repo.by_email(DEMO_OFFICER),
                                ("ATTESTED_MARRIAGE_CERTIFICATE", "FATHER_PASSPORT", "MOTHER_PASSPORT", "FATHER_EMIRATES_ID", "MOTHER_EMIRATES_ID",
                                 "HOSPITAL_BIRTH_NOTIFICATION", "SPONSOR_RESIDENCE_VISA", "CHILD_PHOTO"))

    async def cb(c: ServiceContainer) -> None:
        await _finish_callbacks(c, (await c.cases_repo.by_reference(ref)).id)

    day = timedelta(days=1)
    await s.at(day + timedelta(hours=0), intake)
    await s.at(day + timedelta(hours=0, minutes=28), lambda c: _approve(c, ref, "BIRTH_CERTIFICATE", DEMO_OFFICER))
    await s.at(2 * day + timedelta(hours=1), lambda c: _authority(c, ref, "BIRTH_CERTIFICATE", "PROCESSING"))
    await s.at(3 * day, lambda c: _authority(c, ref, "BIRTH_CERTIFICATE", "CLEARED"))
    await s.at(3 * day + timedelta(minutes=4), cb)
    await s.at(3 * day + timedelta(minutes=40), lambda c: _approve(c, ref, "MOFA_ATTESTATION", DEMO_OFFICER))
    await s.at(4 * day + timedelta(hours=3), lambda c: _authority(c, ref, "MOFA_ATTESTATION", "CLEARED"))
    await s.at(4 * day + timedelta(hours=3, minutes=5), cb)
    await s.at(11 * day, lambda c: _parent(c, ref, "APPOINTMENT_BOOKED", appointment_date=dob + timedelta(days=13)))
    await s.at(13 * day + timedelta(hours=2), lambda c: _parent(c, ref, "APPLICATION_SUBMITTED"))
    await s.at(41 * day + timedelta(hours=4), lambda c: _parent(c, ref, "PASSPORT_ISSUED", passport_number_present=True))
    await s.at(41 * day + timedelta(hours=6), lambda c: _approve(c, ref, "RESIDENCE_VISA", DEMO_OFFICER))
    await s.at(43 * day + timedelta(hours=2), lambda c: _authority(c, ref, "RESIDENCE_VISA", "PROCESSING"))
    log.info("demo_case_built", reference=ref)


async def build_secondary_demo_cases(infra: Infra) -> None:
    """Two more cases so the officer queues are realistic: a missing attested marriage certificate (Sharjah, Tagalog)
    and a pending officer release with an open escalation (Dubai, Urdu)."""
    async with infra.sessionmaker() as session:
        repo = CaseRepository(session)
        need_2 = await repo.by_reference("LL-DEMO-002") is None
        need_3 = await repo.by_reference("LL-DEMO-003") is None
    if need_2:
        dob2 = date.today() - timedelta(days=9)
        s2 = Script(infra, datetime.combine(dob2, time(6, 0), tzinfo=UTC))

        async def intake2(c: ServiceContainer) -> None:
            user = await _seeded_resident(c, "maria.santos.demo@lifeloop.local", "Maria Santos", "tl", "+971500000202")
            case, _ = await c.cases.create_from_intake(user, _intake(
                language="tl", emirate="SHARJAH", child_full_name_en="Sofia Santos", child_date_of_birth=dob2, child_sex="F",
                place_of_birth="Al Qassimi Hospital", child_nationality="Filipino", father_full_name="Jose Santos", mother_full_name="Maria Santos",
                father_emirates_id="784-1987-2345678-3", mother_emirates_id="784-1990-8765432-4", marriage_certificate_attested=False,
                consent_data_processing=True, consent_service_filing=True, consent_callback=True), channel="VOICE", actor=Actor.agent(),
                reference="LL-DEMO-002", is_demo=True)

        async def cb2(c: ServiceContainer) -> None:
            await _finish_callbacks(c, (await c.cases_repo.by_reference("LL-DEMO-002")).id, 61.0)

        await s2.at(timedelta(days=1, hours=3), intake2)
        await s2.at(timedelta(days=1, hours=3, minutes=5), cb2)
    if need_3:
        dob3 = date.today() - timedelta(days=20)
        s3 = Script(infra, datetime.combine(dob3, time(7, 30), tzinfo=UTC))

        async def intake3(c: ServiceContainer) -> None:
            user = await _seeded_resident(c, "imran.qureshi.demo@lifeloop.local", "Imran Qureshi", "ur", "+971500000303")
            case, _ = await c.cases.create_from_intake(user, _intake(
                language="ur", emirate="DUBAI", child_full_name_en="Ayaan Qureshi", child_date_of_birth=dob3, child_sex="M",
                place_of_birth="Rashid Hospital", child_nationality="Pakistani", father_full_name="Imran Qureshi", mother_full_name="Sana Qureshi",
                father_emirates_id="784-1986-3456789-5", mother_emirates_id="784-1989-9876543-6", marriage_certificate_attested=True,
                consent_data_processing=True, consent_service_filing=True, consent_callback=True), channel="VOICE", actor=Actor.agent(),
                reference="LL-DEMO-003", is_demo=True)

        async def escalate3(c: ServiceContainer) -> None:
            case = await c.cases_repo.by_reference("LL-DEMO-003")
            await c.escalations.open(case, EscalationReason.APPROVAL_QUESTION, actor=Actor.agent(),
                                     summary="Parent asked whether the birth certificate will be approved; agent declined to predict and handed over.")

        await s3.at(timedelta(days=2), intake3)
        await s3.at(timedelta(days=18, hours=5), escalate3)


async def run_seed(infra: Infra) -> dict[str, Any]:
    async with infra.sessionmaker() as session:
        c = _container(session, infra)
        orgs = await ensure_organizations(c)
        users = await ensure_users(c, orgs)
        await c.commit()
    seeded_cases = False
    if infra.settings.seed_demo_data and users:
        await build_primary_demo_case(infra)
        await build_secondary_demo_cases(infra)
        seeded_cases = True
    log.info("seed_complete", organizations=len(orgs), users=len(users), demo_cases=seeded_cases)
    return {"organizations": len(orgs), "users": len(users), "demo_cases": seeded_cases}


async def ensure_demo_case(infra: Infra) -> None:
    await build_primary_demo_case(infra)
