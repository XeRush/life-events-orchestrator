"""Workflow definitions and per-case graph projection (persisted data -> graph)."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import select

from app.agents.journey_planner import topological_layers
from app.core.errors import NotFound
from app.models.government_entity import GovernmentEntity
from app.models.life_event import LifeEvent
from app.models.life_event_case import LifeEventCase
from app.models.service_task import ServiceTask, TaskDependency
from app.models.workflow import Workflow
from app.models.workflow_edge import WorkflowEdge
from app.models.workflow_node import WorkflowNode

if TYPE_CHECKING:
    from app.services.container import ServiceContainer


class WorkflowService:
    def __init__(self, c: ServiceContainer) -> None:
        self.c = c

    async def get_life_event(self, code: str) -> LifeEvent:
        event = await self.c.session.scalar(select(LifeEvent).where(LifeEvent.code == code.upper()))
        if not event:
            raise NotFound(f"Unknown life event type '{code}'")
        return event

    async def get_active_workflow(self, life_event_id: uuid.UUID) -> Workflow:
        wf = await self.c.session.scalar(
            select(Workflow).where(Workflow.life_event_id == life_event_id, Workflow.is_active.is_(True))
            .order_by(Workflow.version.desc())
        )
        if not wf:
            raise NotFound("No active workflow for this life event")
        return wf

    async def definition(self, workflow_id: uuid.UUID) -> tuple[list[WorkflowNode], list[WorkflowEdge]]:
        nodes = (await self.c.session.scalars(
            select(WorkflowNode).where(WorkflowNode.workflow_id == workflow_id).order_by(WorkflowNode.sort_order)
        )).all()
        edges = (await self.c.session.scalars(select(WorkflowEdge).where(WorkflowEdge.workflow_id == workflow_id))).all()
        return list(nodes), list(edges)

    async def entity_map(self) -> dict[uuid.UUID, GovernmentEntity]:
        return {e.id: e for e in (await self.c.session.scalars(select(GovernmentEntity))).all()}

    async def templates(self) -> list[dict[str, Any]]:
        out = []
        for ev in (await self.c.session.scalars(select(LifeEvent).order_by(LifeEvent.name))).all():
            wf = await self.c.session.scalar(select(Workflow).where(Workflow.life_event_id == ev.id))
            nodes, _ = await self.definition(wf.id) if wf else ([], [])
            out.append({
                "code": ev.code, "name": ev.name, "case_title": ev.case_title, "description": ev.description,
                "icon": ev.icon, "is_configured": ev.is_configured, "service_count": len([n for n in nodes if not n.is_system]),
            })
        return out

    async def template_graph(self, code: str) -> dict[str, Any]:
        """Graph preview of a workflow *definition* (no case)."""
        event = await self.get_life_event(code)
        wf = await self.get_active_workflow(event.id)
        nodes, edges = await self.definition(wf.id)
        entities = await self.entity_map()
        by_id = {n.id: n for n in nodes}
        deps: dict[str, list[str]] = {n.key: [] for n in nodes}
        for e in edges:
            deps[by_id[e.to_node_id].key].append(by_id[e.from_node_id].key)
        layers = topological_layers(deps)
        return {
            "life_event": event.code, "is_configured": event.is_configured,
            "nodes": [
                {"key": n.key, "name": n.name, "entity": entities[n.entity_id].name if n.entity_id else None,
                 "is_system": n.is_system, "layer": layers[n.key], "dependencies": deps[n.key]}
                for n in nodes
            ],
            "edges": [{"from": by_id[e.from_node_id].key, "to": by_id[e.to_node_id].key} for e in edges],
        }

    async def case_graph(self, case: LifeEventCase) -> dict[str, Any]:
        """Graph built from the persisted tasks + dependencies of one case."""
        s = self.c.session
        tasks = (await s.scalars(select(ServiceTask).where(ServiceTask.case_id == case.id).order_by(ServiceTask.sort_order))).all()
        deps = (await s.scalars(select(TaskDependency).where(TaskDependency.case_id == case.id))).all()
        entities = await self.entity_map()
        by_id = {t.id: t for t in tasks}
        dep_keys: dict[str, list[str]] = {t.key: [] for t in tasks}
        for d in deps:
            dep_keys[by_id[d.task_id].key].append(by_id[d.depends_on_id].key)
        layers = topological_layers(dep_keys)
        return {
            "case_id": str(case.id), "case_reference": case.reference,
            "nodes": [self.node_view(t, entities, dep_keys[t.key], layers[t.key]) for t in tasks],
            "edges": [{"from": by_id[d.depends_on_id].key, "to": by_id[d.task_id].key} for d in deps],
        }

    @staticmethod
    def node_view(t: ServiceTask, entities: dict, deps: list[str], layer: int) -> dict[str, Any]:
        entity = entities.get(t.entity_id) if t.entity_id else None
        return {
            "id": str(t.id), "key": t.key, "name": t.name, "description": t.description, "status": t.status.value,
            "is_system": t.is_system, "layer": layer, "dependencies": deps, "replanned": t.replanned,
            "entity": {"code": entity.code, "name": entity.name} if entity else None,
            "created_at": t.created_at, "started_at": t.started_at, "completed_at": t.completed_at,
            "updated_at": t.updated_at, "required_documents": t.required_documents or [],
            "resident_action": t.resident_action, "status_reason": t.status_reason, "external_ref": t.external_ref,
        }
