"""Resident-facing case API (staff can read cases in their organisation)."""
from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import StreamingResponse

from app.api.deps import STAFF, get_container, get_current_user, require_roles, user_from_token
from app.api.v1.common import page
from app.core.errors import Forbidden, ValidationFailed
from app.events.recorder import Actor
from app.events.stream import hub
from app.models.case import Case
from app.models.enums import ACTIVE_CASE_STATES, ConsentType, DocumentStatus, UserRole
from app.models.user import User
from app.schemas.cases import ConsentIn, ConsulateReportIn, DocumentStatusIn, IntakeIn, VerifyIn
from app.services.container import ServiceContainer

router = APIRouter(prefix="/cases", tags=["cases"])


async def _case(ref: str, user: User, c: ServiceContainer) -> Case:
    return await c.access.case_for(user, ref)


@router.get("", summary="Cases visible to the caller (resident: own; officer: their service centre; admin: all)")
async def list_cases(status: str | None = None, q: str | None = Query(default=None, max_length=40), limit: int = Query(50, ge=1, le=200),
                     offset: int = Query(0, ge=0), user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    if user.role == UserRole.RESIDENT:
        query = c.cases_repo.for_resident(user.id)
    else:
        query = c.cases_repo.for_staff(None if user.role == UserRole.ADMIN else user.organization_id, q=q)
    if status == "active":
        query = query.where(Case.status.in_(ACTIVE_CASE_STATES))
    items, total = await c.cases_repo.page(query, limit=limit, offset=offset)
    return page([await c.cases.list_view(x) for x in items], total, limit, offset)


@router.post("", status_code=201, summary="Open a case from the web intake (same service the voice agent uses)")
async def create_case(body: IntakeIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    if user.role != UserRole.RESIDENT:
        raise Forbidden("Cases are opened by residents (or the voice agent on their behalf).")
    case, created = await c.cases.create_from_intake(user, body, channel="WEB", actor=Actor.user(user))
    await c.commit()
    return {"created": created, "case": await c.cases.view(case, user)}


@router.get("/{ref}", summary="Case detail: progress, deadline, next action, consent, documents outstanding")
async def get_case(ref: str, lang: str | None = None, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(ref, user, c)
    if user.role != UserRole.RESIDENT:
        await c.events.audit("CaseViewed", actor=Actor.user(user), case_id=case.id)
        await c.commit()
    return await c.cases.view(case, user, lang)


@router.get("/{ref}/graph", summary="Life-Event Graph (PostgreSQL authoritative; Neo4j projection status included)")
async def graph(ref: str, lang: str | None = None, user: User = Depends(get_current_user),
                c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return await c.graph.snapshot(await _case(ref, user, c), lang)


@router.get("/{ref}/graph/impact/{node_key}", summary="Downstream services held up by a node (Neo4j, PostgreSQL fallback)")
async def impact(ref: str, node_key: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return await c.graph.impact(await _case(ref, user, c), node_key)


@router.get("/{ref}/timeline", summary="Chronological case events with source, actor and status")
async def timeline(ref: str, limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0), user: User = Depends(get_current_user),
                   c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(ref, user, c)
    items, total = await c.timeline_repo.page(c.timeline_repo.for_case(case.id), limit=limit, offset=offset)
    return page([{"id": str(e.id), "event_type": e.event_type, "title": e.title, "description": e.description, "source": e.source.value,
                  "actor": e.actor, "actor_type": e.actor_type.value, "status": e.status, "node_key": e.node_key,
                  "resident_present": e.resident_present, "i18n": (e.metadata_ or {}).get("i18n"), "occurred_at": e.occurred_at.isoformat()}
                 for e in items], total, limit, offset)


@router.get("/{ref}/documents", summary="Document Center")
async def documents(ref: str, lang: str | None = None, user: User = Depends(get_current_user),
                    c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    return await c.documents.view(await _case(ref, user, c), lang)


@router.post("/{ref}/documents/{doc_type}", summary="Upload a document (PDF/PNG/JPEG, size and type validated)")
async def upload(ref: str, doc_type: str, file: UploadFile = File(...), user: User = Depends(get_current_user),
                 c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(ref, user, c)
    data = await file.read(c.settings.max_upload_mb * 1024 * 1024 + 1)
    await c.documents.upload(case, user, doc_type.upper(), data, file.filename or "document", file.content_type)
    await c.commit()
    return await c.documents.view(case)


@router.post("/{ref}/documents/{doc_type}/verify", summary="Officer check of an uploaded document (not a government verification)")
async def verify_document(ref: str, doc_type: str, user: User = Depends(require_roles(*STAFF)), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(ref, user, c)
    await c.documents.verify(case, user, doc_type.upper())
    await c.commit()
    return await c.documents.view(case)


@router.patch("/{ref}/documents/{doc_type}", summary="Set a document's status (officer)")
async def set_doc_status(ref: str, doc_type: str, body: DocumentStatusIn, user: User = Depends(require_roles(*STAFF)),
                         c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(ref, user, c)
    await c.documents.set_status(case, user, doc_type.upper(), DocumentStatus(body.status), body.note)
    await c.commit()
    return await c.documents.view(case)


@router.get("/{ref}/consent", summary="Consent records")
async def consents(ref: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    return await c.consents.view(await _case(ref, user, c))


@router.post("/{ref}/consent", summary="Grant or withdraw a consent (resident)")
async def set_consent(ref: str, body: ConsentIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    case = await _case(ref, user, c)
    if case.resident_id != user.id:
        raise Forbidden("Only the resident can change consent.")
    if body.granted:
        await c.consents.capture(case, user, ConsentType(body.consent_type), source="WEB_FORM", actor=Actor.user(user))
    else:
        await c.consents.revoke(case, user, ConsentType(body.consent_type), Actor.user(user))
    await c.commit()
    return await c.consents.view(case)


@router.post("/{ref}/opt-out", summary="'Stop calling': cancel callbacks and switch to SMS-only")
async def opt_out(ref: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(ref, user, c)
    if case.resident_id != user.id:
        raise Forbidden("Only the resident can opt out.")
    await c.optouts.opt_out(case, user, source="WEB", actor=Actor.user(user), reason="Resident chose 'Stop calling' in the app")
    await c.commit()
    return await c.cases.view(case, user)


@router.post("/{ref}/opt-in", summary="Turn voice callbacks back on (records a fresh consent token)")
async def opt_in(ref: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(ref, user, c)
    if case.resident_id != user.id:
        raise Forbidden("Only the resident can turn calls back on.")
    await c.optouts.opt_in(case, user, Actor.user(user))
    await c.commit()
    return await c.cases.view(case, user)


@router.get("/{ref}/verification", summary="Verification attempts")
async def verification(ref: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    return await c.verification.view(await _case(ref, user, c))


@router.post("/{ref}/verification", summary="Verify (UAE Pass one-tap simulated, or two facts from the case file)")
async def verify(ref: str, body: VerifyIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(ref, user, c)
    call = await c.calls.get(uuid.UUID(body.call_id), user) if body.call_id else None
    if body.method == "UAE_PASS":
        result = await c.verification.uae_pass(case, call)
    else:
        if not body.date_of_birth or not body.hospital:
            raise ValidationFailed("Both facts are needed.")
        result = await c.verification.check_facts(case, call, date_of_birth=body.date_of_birth, hospital=body.hospital)
    await c.commit()
    return result


@router.get("/{ref}/callbacks", summary="Callbacks for this case")
async def callbacks(ref: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    case = await _case(ref, user, c)
    items, _ = await c.callbacks_repo.page(c.callbacks_repo.listing(case_id=case.id), limit=100)
    return [c.callbacks.view(cb, case.reference) for cb in items]


@router.post("/{ref}/callbacks", summary="Request a callback (consent and opt-out are enforced)")
async def request_callback(ref: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(ref, user, c)
    cb = await c.callbacks.trigger_now(case, user)
    await c.commit()
    return c.callbacks.view(cb, case.reference) if cb else {"status": None}


@router.post("/{ref}/consulate", summary="Report a consulate milestone (parent-reported; LifeLoop never claims consulate status)")
async def consulate(ref: str, body: ConsulateReportIn, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> dict[str, Any]:
    case = await _case(ref, user, c)
    if case.resident_id != user.id:
        raise Forbidden("Consulate milestones are reported by the parent.")
    report = await c.consulate.report(case, body.milestone, actor=Actor(Actor.user(user).type, f"{user.full_name} (parent, in the app)", user.id),
                                      channel="WEB", appointment_date=body.appointment_date,
                                      passport_number_present=body.passport_number_present, notes=body.notes)
    await c.commit()
    return report


@router.get("/{ref}/requests", summary="Entity requests and authority statuses (mock integrations)")
async def requests(ref: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    return await c.entities.requests_view(await _case(ref, user, c))


@router.get("/{ref}/calls", summary="Calls on this case")
async def calls(ref: str, user: User = Depends(get_current_user), c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    case = await _case(ref, user, c)
    items, _ = await c.calls_repo.page(c.calls_repo.for_case(case.id), limit=20)
    return [await c.calls.view(x, include_transcript=False) for x in items]


@router.get("/{ref}/events", summary="Domain events for this case (outbox: status, topic, actor)")
async def events(ref: str, limit: int = Query(50, ge=1, le=200), user: User = Depends(get_current_user),
                 c: ServiceContainer = Depends(get_container)) -> list[dict[str, Any]]:
    case = await _case(ref, user, c)
    items, _ = await c.outbox_repo.page(c.outbox_repo.recent(case.id), limit=limit)
    return [{"id": str(e.id), "event_type": e.event_type, "topic": e.topic, "status": e.status.value, "node_key": e.node_key, "actor": e.actor,
             "source": e.source, "created_at": e.created_at.isoformat(), "published_at": e.published_at.isoformat() if e.published_at else None,
             "processed_at": e.processed_at.isoformat() if e.processed_at else None, "attempts": e.attempts} for e in items]


async def _sse(request: Request, allowed: set[str] | None) -> AsyncIterator[str]:
    queue = hub.subscribe()
    try:
        yield "event: ready\ndata: {}\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                message = await asyncio.wait_for(queue.get(), timeout=15)
            except TimeoutError:
                yield ": keep-alive\n\n"
                continue
            if allowed is None or message.get("case_id") in allowed:
                yield f"event: case\ndata: {json.dumps(message)}\n\n"
    finally:
        hub.unsubscribe(queue)


@router.get("/{ref}/events/stream", summary="Server-Sent Events for one case (pass the JWT as ?access_token=)")
async def stream_case(ref: str, request: Request, access_token: str = Query(min_length=20), c: ServiceContainer = Depends(get_container)) -> StreamingResponse:
    user, _ = await user_from_token(c, access_token)
    case = await _case(ref, user, c)
    allowed = {str(case.id)}
    await c.session.close()  # do not hold a DB connection for the life of the stream
    return StreamingResponse(_sse(request, allowed), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


stream_router = APIRouter(tags=["events"])


@stream_router.get("/events/stream", summary="Server-Sent Events for every case the caller can see")
async def stream_all(request: Request, access_token: str = Query(min_length=20), c: ServiceContainer = Depends(get_container)) -> StreamingResponse:
    user, _ = await user_from_token(c, access_token)
    allowed: set[str] | None
    if user.role == UserRole.ADMIN:
        allowed = None
    elif user.role == UserRole.OFFICER:
        ids = (await c.session.scalars(c.cases_repo.for_staff(user.organization_id).with_only_columns(Case.id))).all()
        allowed = {str(i) for i in ids}
    else:
        ids = (await c.session.scalars(c.cases_repo.for_resident(user.id).with_only_columns(Case.id))).all()
        allowed = {str(i) for i in ids}
    await c.session.close()
    return StreamingResponse(_sse(request, allowed), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
