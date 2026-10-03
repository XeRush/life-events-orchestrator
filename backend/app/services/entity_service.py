"""Entity requests: release -> submit (with retries) -> poll -> apply status. One scoped adapter per authority.

Data minimisation happens here: `minimised_fields` resolves ONLY the node's `form_fields` from the Life-Event
Passport. Emirates IDs leave as opaque tokens; passport numbers never leave (only "present"). The adapter refuses
any field outside its form.
"""
from __future__ import annotations

import asyncio
import uuid
from typing import TYPE_CHECKING, Any

from app.core.clock import utcnow
from app.core.errors import Conflict, InvalidTransition, NotFound
from app.events.recorder import Actor
from app.integrations.government.base import (
    AdapterError,
    AdapterTimeout,
    ApplicationNotFound,
    FieldsNotAllowed,
    NotSupported,
)
from app.integrations.government.contracts import SubmitRequest
from app.models.case import Case
from app.models.entity import EntityRequest, EntityStatus
from app.models.enums import DocumentStatus, NodeState, ParentRole, Source
from app.models.graph import LifeEventNode
from app.models.officer import Approval
from app.models.user import User
from app.observability import metrics
from app.observability.logging import get_logger
from app.workflows.birth_expat import BY_KEY, DOCUMENTS

if TYPE_CHECKING:
    from app.events.consumers import Message
    from app.services.container import ServiceContainer

log = get_logger("lifeloop.entities")

FIELD_LABELS = {
    "child.full_name_en": "Child's name (English)", "child.full_name_ar": "Child's name (Arabic)", "child.date_of_birth": "Date of birth",
    "child.sex": "Sex", "child.place_of_birth": "Place of birth", "child.birth_notification_ref": "Hospital notification ref",
    "child.nationality": "Nationality", "child.passport_present": "Child passport available",
    "father.full_name": "Father's name", "father.nationality": "Father's nationality", "father.emirates_id_token": "Father's Emirates ID (token)",
    "mother.full_name": "Mother's name", "mother.nationality": "Mother's nationality", "mother.emirates_id_token": "Mother's Emirates ID (token)",
    "sponsor.emirates_id_token": "Sponsor's Emirates ID (token)", "sponsor.full_name": "Sponsor's name",
    "birth_certificate.reference": "Birth certificate reference", "visa.reference": "Residence visa reference",
    "emirates_id.reference": "Emirates ID application reference",
}
SUCCESS = {"CLEARED", "COMPLETED"}


class EntityService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    # --- data minimisation -------------------------------------------------------------------------------
    async def _passport(self, case: Case) -> dict[str, Any]:
        child = await self.c.cases_repo.child(case.id)
        parents = {p.role: p for p in await self.c.cases_repo.parents(case.id)}
        father, mother = parents.get(ParentRole.FATHER), parents.get(ParentRole.MOTHER)
        sponsor = father or mother

        async def ref(key: str) -> str | None:
            node = await self.c.nodes_repo.by_key(case.id, key)
            req = await self.c.requests_repo.latest_for_node(node.id) if node else None
            return req.external_ref if req else None

        consulate = await self.c.nodes_repo.by_key(case.id, "CONSULATE_PASSPORT")
        child_passport = await self.c.docs_repo.by_type(case.id, "CHILD_PASSPORT")
        token = lambda p: f"eidtok_{p.emirates_id_hash[:16]}" if p and p.emirates_id_hash else None  # noqa: E731
        return {
            "child.full_name_en": child.full_name_en if child else None, "child.full_name_ar": child.full_name_ar if child else None,
            "child.date_of_birth": child.date_of_birth.isoformat() if child else None, "child.sex": child.sex if child else None,
            "child.place_of_birth": child.place_of_birth if child else None, "child.nationality": child.nationality if child else None,
            "child.birth_notification_ref": child.birth_notification_ref if child else None,
            "child.passport_present": bool((consulate and (consulate.parent_report or {}).get("passport_number_present"))
                                           or (child_passport and child_passport.status in (DocumentStatus.UPLOADED, DocumentStatus.VERIFIED))),
            "father.full_name": father.full_name if father else None, "father.nationality": father.nationality if father else None,
            "father.emirates_id_token": token(father), "mother.full_name": mother.full_name if mother else None,
            "mother.nationality": mother.nationality if mother else None, "mother.emirates_id_token": token(mother),
            "sponsor.emirates_id_token": token(sponsor), "sponsor.full_name": sponsor.full_name if sponsor else None,
            "birth_certificate.reference": await ref("BIRTH_CERTIFICATE"), "visa.reference": await ref("RESIDENCE_VISA"),
            "emirates_id.reference": await ref("EMIRATES_ID"),
        }

    async def minimised_fields(self, case: Case, node: LifeEventNode) -> dict[str, Any]:
        passport = await self._passport(case)
        return {f: passport.get(f) for f in node.form_fields}

    async def preview_fields(self, case: Case, node: LifeEventNode) -> list[dict[str, Any]]:
        values = await self.minimised_fields(case, node)
        return [{"name": k, "label": FIELD_LABELS.get(k, k), "value": v if not k.endswith("_token") else "token (no ID number shared)"}
                for k, v in values.items()]

    # --- release / submit ----------------------------------------------------------------------------------
    async def release(self, case: Case, node: LifeEventNode, approval: Approval, officer: User) -> EntityRequest:
        adapter = self.c.infra.adapters.for_node(node.key, node.entity)
        node.attempts += 1
        key = f"{case.id}:{node.key}:{node.attempts}"
        request = await self.c.requests_repo.by_idempotency(key)
        if request is None:
            request = EntityRequest(case_id=case.id, node_id=node.id, entity=node.entity, request_type=adapter.request_type,
                                    idempotency_key=key, state="SUBMITTING", fields_sent=list(node.form_fields), approval_id=approval.id,
                                    released_by_id=officer.id, released_at=utcnow())
            self.c.session.add(request)
            await self.c.session.flush()
        await self.c.graph.transition(node, NodeState.SUBMITTING, source=Source.HUMAN_OFFICER, actor=Actor.user(officer),
                                      status=f"Released by {officer.full_name} - filing with {node.entity_label} (mock)")
        await self.c.events.emit("EntityRequestReleased", case_id=case.id, node_key=node.key, actor=Actor.user(officer),
                                 source=Source.HUMAN_OFFICER, payload={"request_id": str(request.id)}, idempotency_key=f"release:{key}")
        return request

    async def submit(self, request_id: uuid.UUID) -> None:
        """Consumer side of EntityRequestReleased. Safe to run twice: only a SUBMITTING request is filed."""
        request = await self.c.requests_repo.get(request_id)
        if request is None or request.state != "SUBMITTING":
            return
        node = await self.c.nodes_repo.get(request.node_id)
        case = await self.c.cases_repo.get(request.case_id)
        assert node is not None and case is not None
        adapter = self.c.infra.adapters.for_node(node.key, node.entity)
        fields = await self.minimised_fields(case, node)
        docs = [d for d in node.required_documents if d in DOCUMENTS]
        settings = self.c.settings
        actor = Actor.entity(node.entity_label)
        last_error: AdapterError | None = None
        response = None
        with self.c.infra.tracer.span(f"adapter.{node.entity.value}.submit", kind="tool", case_id=str(case.id),
                                      input={"fields": sorted(fields)}, metadata={"node": node.key, "tool": f"submit_{node.key.lower()}"}) as span:
            for attempt in range(1, settings.adapter_max_attempts + 1):
                request.attempts += 1
                try:
                    response = await asyncio.wait_for(adapter.submit_request(SubmitRequest(
                        request_type=adapter.request_type, idempotency_key=request.idempotency_key, case_reference=case.reference,
                        fields=fields, declared_documents=docs)), timeout=settings.adapter_timeout_seconds)
                    metrics.ADAPTER_CALLS.labels(node.entity.value, "submit", "ok").inc()
                    break
                except TimeoutError:
                    last_error = AdapterTimeout(f"{node.entity.value} timed out")
                except (FieldsNotAllowed, NotSupported) as exc:
                    metrics.ADAPTER_CALLS.labels(node.entity.value, "submit", "refused").inc()
                    request.state, request.error = "FAILED", str(exc)
                    span.update(error=str(exc))
                    await self.c.graph.transition(node, NodeState.BLOCKED, source=Source.SYSTEM, reason=f"Integration refused the request: {exc}")
                    return
                except AdapterError as exc:
                    last_error = exc
                metrics.ADAPTER_CALLS.labels(node.entity.value, "submit", "error").inc()
                if not last_error.retriable or attempt == settings.adapter_max_attempts:
                    break
                await asyncio.sleep(settings.adapter_backoff_seconds * attempt)
            if response is None:
                request.state, request.error = "STALLED", str(last_error)[:500]
                span.update(error=str(last_error))
                await self.c.graph.transition(node, NodeState.STALLED, source=Source.SYSTEM,
                                              reason=f"{node.entity_label} unavailable - not cleared yet",
                                              payload={"stall_kind": "DEPENDENCY_DOWN", "error": str(last_error)[:200]})
                return
            span.update(output={"external_ref": response.external_ref, "status": response.status})
        request.external_ref, request.state, request.submitted_at = response.external_ref, "SUBMITTED", utcnow()
        request.error = None
        self.c.session.add(EntityStatus(request_id=request.id, case_id=case.id, entity=node.entity, status="SUBMITTED",
                                        detail=response.detail, channel="SUBMIT", payload={"external_ref": response.external_ref,
                                        "duplicate": response.duplicate}, received_at=utcnow()))
        await self.c.graph.transition(node, NodeState.SUBMITTED, source=Source.GOVERNMENT_MOCK, actor=actor,
                                      status=f"Submitted to {node.entity_label} (mock) - ref {response.external_ref}",
                                      payload={"external_ref": response.external_ref})

    async def retry(self, case: Case, node: LifeEventNode, user: User) -> EntityRequest:
        """Officer retry after a technical stall (the original release still stands)."""
        await self.c.access.officiate(user, case, "RetrySubmission")
        request = await self.c.requests_repo.latest_for_node(node.id)
        if node.state != NodeState.STALLED or request is None or request.external_ref:
            raise Conflict("Only a stalled submission that never reached the authority can be retried.")
        request.state, request.error = "SUBMITTING", None
        await self.c.graph.transition(node, NodeState.SUBMITTING, source=Source.HUMAN_OFFICER, actor=Actor.user(user), status="Retrying the filing")
        await self.c.events.emit("EntityRequestReleased", case_id=case.id, node_key=node.key, actor=Actor.user(user),
                                 source=Source.HUMAN_OFFICER, payload={"request_id": str(request.id), "retry": True})
        return request

    # --- status ----------------------------------------------------------------------------------------------
    async def poll(self, request: EntityRequest, channel: str = "POLL") -> str | None:
        node = await self.c.nodes_repo.get(request.node_id)
        if node is None or not request.external_ref:
            return None
        adapter = self.c.infra.adapters.for_node(node.key, node.entity)
        request.last_polled_at = utcnow()
        try:
            status = await asyncio.wait_for(adapter.get_status(request.external_ref), timeout=self.c.settings.adapter_timeout_seconds)
            metrics.ADAPTER_CALLS.labels(node.entity.value, "status", "ok").inc()
        except ApplicationNotFound:
            await self._refile(request, node, adapter)
            return None
        except (TimeoutError, AdapterError) as exc:
            metrics.ADAPTER_CALLS.labels(node.entity.value, "status", "error").inc()
            log.warning("entity_poll_failed", entity=node.entity.value, error=str(exc))
            return None
        if status.status == request.state and channel == "POLL":
            return None
        self.c.session.add(EntityStatus(request_id=request.id, case_id=request.case_id, entity=node.entity, status=status.status,
                                        detail=status.detail, channel=channel, received_at=utcnow(),
                                        payload={"missing_documents": status.missing_documents}))
        request.last_status_at = utcnow()
        await self.c.events.emit("EntityStatusReceived", case_id=request.case_id, node_key=node.key, actor=Actor.entity(node.entity_label),
                                 source=Source.GOVERNMENT_MOCK, payload={"request_id": str(request.id), "status": status.status,
                                 "detail": status.detail, "missing_documents": status.missing_documents,
                                 "resident_present": status.resident_present, "channel": channel})
        return status.status

    async def _refile(self, request: EntityRequest, node: LifeEventNode, adapter: Any) -> None:
        """The authority has no record of this filing (a mock authority's memory was reset). File it again with the same
        idempotency key: that yields the same reference, so the case and its history are unchanged."""
        case = await self.c.cases_repo.get(request.case_id)
        if case is None:
            return
        try:
            await asyncio.wait_for(adapter.submit_request(SubmitRequest(
                request_type=adapter.request_type, idempotency_key=request.idempotency_key, case_reference=case.reference,
                fields=await self.minimised_fields(case, node), declared_documents=[d for d in node.required_documents if d in DOCUMENTS],
            )), timeout=self.c.settings.adapter_timeout_seconds)
            log.info("entity_request_refiled", entity=node.entity.value, external_ref=request.external_ref)
        except (TimeoutError, AdapterError) as exc:
            log.warning("entity_refile_failed", entity=node.entity.value, error=str(exc))

    async def apply_status(self, message: Message) -> None:
        """Consumer side of EntityStatusReceived: map the authority's status onto the graph (validated)."""
        payload = message.payload
        request = await self.c.requests_repo.get(uuid.UUID(payload["request_id"]))
        if request is None:
            return
        node = await self.c.nodes_repo.get(request.node_id)
        case = await self.c.cases_repo.get(request.case_id)
        if node is None or case is None:
            return
        status, detail = payload["status"], payload.get("detail") or ""
        actor = Actor.entity(node.entity_label)
        request.state = status
        try:
            if status == "PROCESSING":
                await self.c.graph.transition(node, NodeState.PROCESSING, source=Source.GOVERNMENT_MOCK, actor=actor, status=f"{detail} (mock)")
            elif status in SUCCESS:
                target = NodeState.COMPLETED if node.success_state == NodeState.COMPLETED else NodeState.CLEARED
                await self.c.graph.transition(node, target, source=Source.GOVERNMENT_MOCK, actor=actor, status=f"{detail} (mock)")
                await self.c.documents.register_outputs(case, node)
            elif status == "DOCUMENT_MISSING":
                missing = payload.get("missing_documents") or list(node.required_documents[:1])
                titles = await self.c.documents.mark_missing(case, missing, f"Requested by {node.entity_label} (mock)")
                await self.c.graph.transition(node, NodeState.DOCUMENT_MISSING, source=Source.GOVERNMENT_MOCK, actor=actor, reason=", ".join(titles),
                                              i18n_params={"docs": ",".join(d for d in missing if d in DOCUMENTS)})
            elif status == "BLOCKED":
                await self.c.graph.transition(node, NodeState.BLOCKED, source=Source.GOVERNMENT_MOCK, actor=actor, reason=detail)
            elif status == "STALLED":
                await self.c.graph.transition(node, NodeState.STALLED, source=Source.GOVERNMENT_MOCK, actor=actor, reason=detail or "Not cleared yet",
                                              payload={"stall_kind": "SLA"})
            elif status == "REJECTED":
                await self.c.graph.transition(node, NodeState.REJECTED, source=Source.GOVERNMENT_MOCK, actor=actor, reason=detail)
            elif status == "WAITING_FOR_PARENT":
                await self.c.graph.transition(node, NodeState.WAITING_FOR_PARENT, source=Source.GOVERNMENT_MOCK, actor=actor,
                                              status=f"{detail} (mock)", resident_present=bool(payload.get("resident_present")))
        except InvalidTransition as exc:
            log.warning("entity_status_ignored", node=node.key, status=status, error=str(exc))

    async def simulate(self, case: Case, node: LifeEventNode, status: str, *, detail: str | None = None,
                       missing: list[str] | None = None) -> str | None:
        """Demo control: change the MOCK authority's state, then fetch it through the normal contract."""
        request = await self.c.requests_repo.latest_for_node(node.id)
        if request is None or not request.external_ref:
            raise Conflict(f"{node.title} has not been filed yet. An officer must release it first.", code="not_released")
        adapter = self.c.infra.adapters.for_node(node.key, node.entity)
        await adapter.simulate(request.external_ref, status, detail=detail, missing=missing,
                               resident_present=status == "WAITING_FOR_PARENT")
        return await self.poll(request, channel="DEMO")

    async def requests_view(self, case: Case) -> list[dict[str, Any]]:
        nodes = {n.id: n for n in await self.c.nodes_repo.for_case(case.id)}
        statuses = await self.c.requests_repo.statuses(case.id)
        out = []
        for r in await self.c.requests_repo.for_case(case.id):
            n = nodes.get(r.node_id)
            out.append({
                "id": str(r.id), "node_key": n.key if n else None, "entity": r.entity.value, "entity_label": n.entity_label if n else r.entity.value,
                "request_type": r.request_type, "state": r.state, "external_ref": r.external_ref, "fields_sent": r.fields_sent,
                "released_at": r.released_at.isoformat() if r.released_at else None, "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
                "attempts": r.attempts, "error": r.error, "is_mock": True,
                "statuses": [{"status": s.status, "detail": s.detail, "channel": s.channel, "received_at": s.received_at.isoformat()}
                             for s in statuses if s.request_id == r.id][:10],
            })
        return out

    async def node_by_key(self, case: Case, key: str) -> LifeEventNode:
        node = await self.c.nodes_repo.by_key(case.id, key)
        if node is None or key not in BY_KEY:
            raise NotFound("Unknown life-event node")
        return node
