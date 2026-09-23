"""Demo control center + entity simulator.

Every action here goes through the same adapters and the same `ingest_entity_event` path a real authority
webhook would use - nothing is faked in the UI or short-circuited around the domain events.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.integrations.government.base import AdapterError, ApplicationNotFound, EntityConflict
from app.models.enums import ActorType
from app.models.enums import TaskStatus as S
from app.models.life_event_case import LifeEventCase
from app.models.service_task import ServiceTask
from app.services.orchestration_service import IngestResult

if TYPE_CHECKING:
    from app.services.container import ServiceContainer

IDENTITY = ("IDENTITY_PROCESS", "IDENTITY_MANUAL_REVIEW")

# action -> (label, description, task keys, adapter operation, params)
DEMO_ACTIONS: dict[str, dict[str, Any]] = {
    "complete_birth_registration": {"label": "Complete Birth Registration", "keys": ("BIRTH_REGISTRATION",), "op": "complete", "entity": "Birth Registration Authority"},
    "issue_birth_certificate": {"label": "Issue Birth Certificate", "keys": ("BIRTH_CERTIFICATE",), "op": "complete", "entity": "Birth Registration Authority"},
    "start_identity": {"label": "Start Identity", "keys": IDENTITY, "op": "acknowledge", "entity": "Civil Identity Authority"},
    "delay_identity": {"label": "Delay Identity", "keys": IDENTITY, "op": "delay", "params": {"hours": 24, "reason": "Queue backlog"}, "entity": "Civil Identity Authority"},
    "require_document": {"label": "Require Document", "keys": IDENTITY, "op": "require_documents", "entity": "Civil Identity Authority"},
    "submit_document": {"label": "Submit Document", "special": "submit_document", "entity": "Resident"},
    "approve_identity": {"label": "Approve Identity", "keys": IDENTITY, "op": "complete", "entity": "Civil Identity Authority"},
    "reject_identity": {"label": "Reject Identity", "keys": IDENTITY, "op": "reject", "params": {"reason": "Application could not be verified", "retryable": False}, "entity": "Civil Identity Authority"},
    "start_health": {"label": "Start Health Service", "keys": ("HEALTH_PROCESS",), "op": "acknowledge", "entity": "Health / Insurance Authority"},
    "complete_health": {"label": "Complete Health Service", "keys": ("HEALTH_PROCESS",), "op": "complete", "entity": "Health / Insurance Authority"},
    "start_additional_services": {"label": "Start Additional Services", "keys": ("ADDITIONAL_SERVICES",), "op": "acknowledge", "entity": "Additional Services Authority"},
    "complete_additional_services": {"label": "Complete Additional Services", "keys": ("ADDITIONAL_SERVICES",), "op": "complete", "entity": "Additional Services Authority"},
    "trigger_callback": {"label": "Trigger Callback", "special": "trigger_callback", "entity": "LIFELOOP"},
    "replan_workflow": {"label": "Replan Workflow", "special": "replan_workflow", "entity": "LIFELOOP"},
}


class DemoService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    def catalog(self) -> list[dict[str, str]]:
        return [{"action": k, "label": v["label"], "actor": v["entity"]} for k, v in DEMO_ACTIONS.items()]

    # ---- entity simulation (shared with the mock-entity HTTP API) -------------------------------
    async def simulate(self, task: ServiceTask, op: str, **params: Any) -> IngestResult:
        """Make the responsible mock authority perform `op`, then deliver its webhook to the orchestrator."""
        entity = await self.c.orchestration.entity_of(task)
        if not entity or not task.external_ref:
            raise Conflict(f"{task.name} has not been submitted to an authority yet - it is waiting for earlier services.", code="not_submitted")
        adapter = self.c.adapters.get(entity.code)
        try:
            app = await adapter._get(self.c.session, task.external_ref)  # noqa: SLF001 - simulator owns the mock store
            if op == "acknowledge":
                hook = await adapter.acknowledge(self.c.session, app)
            elif op == "complete":
                hook = await adapter.complete(self.c.session, app)
            elif op == "delay":
                hook = await adapter.delay(self.c.session, app, int(params.get("hours", 24)), params.get("reason", "Queue backlog"))
            elif op == "reject":
                hook = await adapter.reject(self.c.session, app, params.get("reason", "Rejected by authority"),
                                            bool(params.get("retryable", False)), params.get("reason_code", "REJECTED"))
            elif op == "require_documents":
                hook = await adapter.require_documents(self.c.session, app, params.get("documents"))
            else:
                raise ValidationFailed(f"Unknown simulation operation '{op}'")
        except ApplicationNotFound as exc:
            raise NotFound(str(exc)) from exc
        except EntityConflict as exc:
            raise Conflict(str(exc)) from exc
        except AdapterError as exc:
            raise Conflict(str(exc)) from exc
        return await self.c.orchestration.ingest_entity_event(hook)

    async def _active_task(self, case: LifeEventCase, keys: tuple[str, ...]) -> ServiceTask:
        tasks = [t for t in await self.c.cases.tasks(case.id) if t.key in keys and t.status != S.CANCELLED]
        if not tasks:
            raise NotFound(f"This case has no active service among {', '.join(keys)}")
        return tasks[-1]

    async def perform(self, case: LifeEventCase, action: str) -> dict[str, Any]:
        spec = DEMO_ACTIONS.get(action)
        if not spec:
            raise NotFound(f"Unknown demo action '{action}'")
        special = spec.get("special")
        if special == "submit_document":
            return await self._submit_document(case)
        if special == "trigger_callback":
            return await self._trigger_callback(case)
        if special == "replan_workflow":
            result = await self.c.replanning.replan_case(case, actor="demo-operator", actor_type=ActorType.ADMIN)
            return {"action": action, "result": result}
        task = await self._active_task(case, spec["keys"])
        result = await self.simulate(task, spec["op"], **spec.get("params", {}))
        return {"action": action, "task": task.key, "applied": result.applied, "duplicate": result.duplicate, "message": result.message or "Applied"}

    async def _submit_document(self, case: LifeEventCase) -> dict[str, Any]:
        waiting = [t for t in await self.c.cases.tasks(case.id) if t.status == S.WAITING_FOR_RESIDENT]
        submitted = []
        for task in waiting:
            for doc in await self.c.documents.outstanding(task.id):
                await self.c.documents.record(
                    case, doc_type=doc.doc_type, name=doc.name, task_id=task.id, source="demo-operator",
                    actor="demo-operator", actor_type=ActorType.ADMIN, content=b"demo document placeholder", content_type="text/plain",
                )
                submitted.append(doc.name)
        if not submitted:
            raise Conflict("No document is currently requested. Use 'Require Document' first.", code="no_document_requested")
        return {"action": "submit_document", "documents": submitted}

    async def _trigger_callback(self, case: LifeEventCase) -> dict[str, Any]:
        snapshot = await self.c.cases.snapshot(case)
        cb = await self.c.callbacks.schedule_for_resident(
            case, reason="Status update requested from the demo console",
            updates=[{"kind": "status", "text": snapshot["summary"], "event_id": "demo", "event_type": "DEMO", "task_key": None}],
        )
        await self.c.callbacks.execute(cb)
        return {"action": "trigger_callback", "callback_id": str(cb.id), "status": cb.status.value, "duration_seconds": cb.duration_seconds}

