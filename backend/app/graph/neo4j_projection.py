"""Neo4j projection of Life-Event Graphs.

PostgreSQL is authoritative; Neo4j is a read model rebuilt from it. It earns its place for two graph questions:
* impact: "if this node is stalled, which downstream services are held up?" (variable-length UNLOCKS paths), and
* bottlenecks: "across all cases, which entities and nodes stall or block most often?" (for officers / analytics).
Every caller has a PostgreSQL fallback, so the product runs unchanged when Neo4j is absent.
"""
from __future__ import annotations

from typing import Any

from app.core.config import Settings
from app.observability import metrics
from app.observability.logging import get_logger

log = get_logger("lifeloop.neo4j")


class Neo4jProjection:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._driver: Any = None
        self.mode = "disabled"
        self.last_error: str | None = None

    @property
    def available(self) -> bool:
        return self._driver is not None

    async def start(self) -> None:
        if not self.settings.neo4j_uri:
            metrics.DEPENDENCY_UP.labels("neo4j").set(0)
            return
        try:
            from neo4j import AsyncGraphDatabase

            driver = AsyncGraphDatabase.driver(self.settings.neo4j_uri, auth=(self.settings.neo4j_username, self.settings.neo4j_password),
                                               connection_timeout=5)
            await driver.verify_connectivity()
            await driver.execute_query("CREATE CONSTRAINT lifeloop_node IF NOT EXISTS FOR (n:LifeEventNode) REQUIRE n.id IS UNIQUE")
            await driver.execute_query("CREATE CONSTRAINT lifeloop_case IF NOT EXISTS FOR (c:Case) REQUIRE c.id IS UNIQUE")
            self._driver, self.mode = driver, "neo4j"
            metrics.DEPENDENCY_UP.labels("neo4j").set(1)
            log.info("neo4j_connected")
        except Exception as exc:
            self.mode, self.last_error = "postgres-fallback", f"{type(exc).__name__}: {exc}"[:300]
            metrics.DEPENDENCY_UP.labels("neo4j").set(0)
            log.warning("neo4j_unavailable_using_postgres_fallback", error=self.last_error)

    async def stop(self) -> None:
        if self._driver is not None:
            await self._driver.close()

    async def project_case(self, case: dict[str, Any], nodes: list[dict[str, Any]], edges: list[tuple[str, str]]) -> bool:
        """Upsert one case graph (ids, keys, states, entities only - no personal data crosses into Neo4j)."""
        if not self.available:
            return False
        try:
            await self._driver.execute_query(
                """
                MERGE (c:Case {id: $case.id}) SET c.reference = $case.reference, c.status = $case.status, c.emirate = $case.emirate
                WITH c
                UNWIND $nodes AS n
                MERGE (x:LifeEventNode {id: n.id})
                SET x.key = n.key, x.state = n.state, x.entity = n.entity, x.case_id = $case.id, x.updated_at = n.updated_at
                MERGE (c)-[:HAS_NODE]->(x)
                """, case=case, nodes=nodes)
            await self._driver.execute_query(
                """
                UNWIND $edges AS e
                MATCH (a:LifeEventNode {id: e[0]}), (b:LifeEventNode {id: e[1]})
                MERGE (a)-[:UNLOCKS]->(b)
                """, edges=[list(e) for e in edges])
            return True
        except Exception as exc:
            self.last_error = f"{type(exc).__name__}: {exc}"[:300]
            log.warning("neo4j_projection_failed", error=self.last_error)
            return False

    async def downstream(self, node_id: str) -> list[dict[str, Any]] | None:
        if not self.available:
            return None
        try:
            records, _, _ = await self._driver.execute_query(
                "MATCH (n:LifeEventNode {id: $id})-[:UNLOCKS*1..10]->(d) RETURN DISTINCT d.key AS key, d.state AS state, d.entity AS entity",
                id=node_id)
            return [dict(r) for r in records]
        except Exception as exc:
            self.last_error = str(exc)[:300]
            return None

    async def bottlenecks(self) -> list[dict[str, Any]] | None:
        if not self.available:
            return None
        try:
            records, _, _ = await self._driver.execute_query(
                """
                MATCH (n:LifeEventNode)
                WHERE n.state IN ['STALLED', 'BLOCKED', 'DOCUMENT_MISSING', 'REJECTED', 'WAITING_FOR_PARENT']
                OPTIONAL MATCH (n)-[:UNLOCKS*1..10]->(d)
                RETURN n.key AS key, n.entity AS entity, n.state AS state, count(DISTINCT n) AS cases, count(d) AS held_downstream
                ORDER BY cases DESC
                """)
            return [dict(r) for r in records]
        except Exception as exc:
            self.last_error = str(exc)[:300]
            return None

    async def delete_case(self, case_id: str) -> None:
        if self.available:
            try:
                await self._driver.execute_query("MATCH (c:Case {id: $id}) OPTIONAL MATCH (c)-[:HAS_NODE]->(n) DETACH DELETE c, n", id=case_id)
            except Exception as exc:
                self.last_error = str(exc)[:300]

    def status(self) -> dict[str, Any]:
        return {"mode": self.mode, "healthy": self.available, "fallback": not self.available, "last_error": self.last_error}
