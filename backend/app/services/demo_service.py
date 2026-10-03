"""Demo control panel (DEMO_MODE only, officer/admin only).

Every control drives the REAL pipeline: a mock authority changes state and LifeLoop learns it through the normal
`get_status` contract -> EntityStatusReceived -> consumer -> validated transition -> orchestrator -> callback. Officer
release goes through ApprovalService with the signed-in officer as the actor. Nothing is faked in the frontend.
"""
from __future__ import annotations

import contextlib
import json
from typing import TYPE_CHECKING, Any

from sqlalchemy import delete

from app.core.clock import utcnow
from app.core.errors import Conflict, ValidationFailed
from app.core.security import sign_payload
from app.events.recorder import Actor
from app.models.call import CallSession
from app.models.case import Case
from app.models.enums import (
    CallDirection,
    CallProvider,
    CallState,
    EscalationReason,
    NodeState,
    NodeType,
    UserRole,
)
from app.models.user import User

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

CONTROLS: dict[str, list[str]] = {
    "BIRTH_CERTIFICATE": ["RELEASE", "PROCESSING", "CLEARED", "BLOCKED", "DOCUMENT_MISSING"],
    "MOFA_ATTESTATION": ["RELEASE", "PROCESSING", "CLEARED", "STALLED"],
    "CONSULATE_PASSPORT": ["APPOINTMENT_BOOKED", "APPLICATION_SUBMITTED", "PASSPORT_ISSUED", "DELAYED"],
    "RESIDENCE_VISA": ["RELEASE", "PROCESSING", "CLEARED", "DOCUMENT_MISSING", "BLOCKED", "STALLED", "REJECTED"],
    "EMIRATES_ID": ["READY", "RELEASE", "WAITING_FOR_PARENT", "COMPLETED"],
    "INSURANCE": ["READY", "RELEASE", "COMPLETED"],
}
ENTITY_OUTCOMES = {"PROCESSING", "CLEARED", "COMPLETED", "BLOCKED", "DOCUMENT_MISSING", "STALLED", "REJECTED", "WAITING_FOR_PARENT"}
MILESTONES = {"APPOINTMENT_BOOKED", "APPLICATION_SUBMITTED", "PASSPORT_ISSUED", "DELAYED"}


class DemoService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    def status(self) -> dict[str, Any]:
        infra = self.c.infra
        return {"demo_mode": self.c.settings.demo_mode, "controls": CONTROLS,
                "failures": {"government": infra.adapters.failures, "kafka": infra.broker.simulate_failure,
                             "elevenlabs": infra.voice_down},
                "label": "DEMO CONTROLS - simulate authority responses through the same contracts a real integration would use"}

    async def act(self, case: Case, node_key: str, action: str, user: User) -> dict[str, Any]:
        action = action.upper()
        if action not in CONTROLS.get(node_key, []) and action not in ("ADVANCE", "BLOCK", "STALL", "CLEAR"):
            raise ValidationFailed(f"{action} is not a demo control for {node_key}")
        node = await self.c.entities.node_by_key(case, node_key)
        action = self._resolve_generic(node, action)
        if action in MILESTONES:
            if node.type != NodeType.PARENT_REPORTED:
                raise ValidationFailed("Milestones apply to the consulate node only.")
            await self.c.consulate.report(case, action, actor=Actor(Actor.user(user).type, f"{user.full_name} (demo control, as the parent)", user.id),
                                          channel="DEMO", passport_number_present=action == "PASSPORT_ISSUED")
            return {"node": node_key, "action": action, "via": "ConsulateService (parent-reported)"}
        if action == "RELEASE":
            approval = await self.c.approvals_repo.pending_for_node(node.id)
            if approval is None:
                raise Conflict(f"{node.title} is not awaiting officer release (state {node.state.value}).")
            await self.c.approvals.approve(approval.id, user, note="Released from the demo control panel")
            return {"node": node_key, "action": action, "via": "ApprovalService (officer gate)"}
        if action == "READY":
            if node.state == NodeState.PENDING:
                raise Conflict(f"{node.title} unlocks automatically when its dependency clears.")
            await self.c.approvals.request(case, node)
            return {"node": node_key, "action": action, "via": "ApprovalService.request"}
        if action in ENTITY_OUTCOMES:
            missing = ["CHILD_PHOTO"] if node_key == "RESIDENCE_VISA" and action == "DOCUMENT_MISSING" else None
            if node_key == "BIRTH_CERTIFICATE" and action == "DOCUMENT_MISSING":
                missing = ["HOSPITAL_BIRTH_NOTIFICATION"]
            status = await self.c.entities.simulate(case, node, action, missing=missing)
            return {"node": node_key, "action": action, "via": "mock adapter -> get_status contract", "authority_status": status}
        raise ValidationFailed("Unsupported demo action")

    def _resolve_generic(self, node, action: str) -> str:
        if action == "BLOCK":
            return "BLOCKED"
        if action == "STALL":
            return "STALLED"
        if action == "CLEAR":
            return "PASSPORT_ISSUED" if node.type == NodeType.PARENT_REPORTED else ("COMPLETED" if node.success_state == NodeState.COMPLETED else "CLEARED")
        if action == "ADVANCE":
            if node.type == NodeType.PARENT_REPORTED:
                last = (node.parent_report or {}).get("reported_status")
                return {"APPOINTMENT_BOOKED": "APPLICATION_SUBMITTED", "APPLICATION_SUBMITTED": "PASSPORT_ISSUED"}.get(last or "", "APPOINTMENT_BOOKED")
            return {NodeState.WAITING_FOR_HUMAN: "RELEASE", NodeState.SUBMITTED: "PROCESSING",
                    NodeState.PROCESSING: "COMPLETED" if node.success_state == NodeState.COMPLETED else "CLEARED",
                    NodeState.READY: "READY"}.get(node.state, "PROCESSING")
        return action

    async def trigger_callback(self, case: Case, user: User) -> dict[str, Any]:
        cb = await self.c.callbacks.trigger_now(case, user)
        return {"callback": self.c.callbacks.view(cb, case.reference) if cb else None}

    async def trigger_escalation(self, case: Case, user: User, reason: str) -> dict[str, Any]:
        esc = await self.c.escalations.open(case, EscalationReason(reason), actor=Actor.user(user), summary="Triggered from the demo control panel.")
        return {"escalation_id": str(esc.id)}

    async def simulate_webhook(self, case: Case) -> dict[str, Any]:
        """Send an ElevenLabs-format post-call webhook through the real verification path."""
        call = CallSession(case_id=case.id, user_id=case.resident_id, direction=CallDirection.INBOUND, provider=CallProvider.ELEVENLABS,
                           provider_conversation_id=f"conv_demo_{int(utcnow().timestamp())}", language=case.language, state=CallState.ACTIVE,
                           started_at=utcnow(), verified=True, disclosure_at=utcnow())
        self.c.session.add(call)
        await self.c.session.flush()
        from app.core.i18n import t

        body = json.dumps({"type": "post_call_transcription", "event_timestamp": int(utcnow().timestamp()), "data": {
            "agent_id": self.c.settings.elevenlabs_agent_id or "agent_demo", "conversation_id": call.provider_conversation_id,
            "conversation_initiation_client_data": {"dynamic_variables": {"lifeloop_call_id": str(call.id), "case_reference": case.reference}},
            "transcript": [{"role": "agent", "message": t("disclosure", case.language)},
                           {"role": "user", "message": "Where are we with the visa?"},
                           {"role": "agent", "message": t("no_confirmed_update", case.language)}],
            "metadata": {"call_duration_secs": 42},
            "analysis": {"transcript_summary": "Parent asked about the visa; agent said it is not cleared yet.",
                         "data_collection_results": {"disclosure_delivered": {"value": True}, "language": {"value": case.language}}}}}).encode()
        secret = self.c.settings.elevenlabs_webhook_secret
        signature = sign_payload(secret, body) if secret else None
        result = await self.c.webhooks.elevenlabs(body, signature)
        return {"webhook": result, "signed": bool(secret)}

    async def set_failure(self, component: str, enabled: bool, entity: str | None = None, mode: str = "unavailable") -> dict[str, Any]:
        infra = self.c.infra
        if component == "government":
            infra.adapters.set_failure(entity or "*", mode if enabled else None)
        elif component == "kafka":
            infra.broker.simulate_failure = enabled
            if not enabled:
                infra.broker.wakeup.set()
        elif component == "elevenlabs":
            if infra.elevenlabs is not None:
                infra.elevenlabs.simulate_unavailable = enabled
            infra.voice_down = enabled
        else:
            raise ValidationFailed("component must be government, kafka or elevenlabs")
        await self.c.events.audit("DemoFailureToggled", actor=Actor.system("Demo control panel"), details={"component": component, "enabled": enabled,
                                                                                                         "entity": entity, "mode": mode})
        return self.status()

    async def reset(self, user: User) -> dict[str, Any]:
        if user.role != UserRole.ADMIN and user.role != UserRole.OFFICER:
            raise ValidationFailed("Officers or admins only")
        from app.seed.seed import DEMO_CASE_REFERENCE, build_primary_demo_case

        # The rebuild replays the real pipeline on a backdated clock and drives its own events; the live workers are held
        # meanwhile, or they would pick up those events on the real clock and race the replay.
        runner = self.c.infra.workers
        async with runner.paused() if runner is not None else contextlib.nullcontext():
            case = await self.c.cases_repo.by_reference(DEMO_CASE_REFERENCE)
            if case is not None:
                await self.c.infra.neo4j.delete_case(str(case.id))
                await self.c.session.execute(delete(Case).where(Case.id == case.id))
            for comp in ("government", "kafka", "elevenlabs"):
                await self.set_failure(comp, False)
            await self.c.events.audit("DemoReset", actor=Actor.user(user))
            await self.c.commit()
            await build_primary_demo_case(self.c.infra)
        return {"reset": True, "case": DEMO_CASE_REFERENCE}
