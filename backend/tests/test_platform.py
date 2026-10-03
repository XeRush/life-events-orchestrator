"""Security, observability, migrations, seed idempotency and demo controls."""
import asyncio
from pathlib import Path

from sqlalchemy import func, select

from app.core.pii import redact_text, redact_value
from app.models import Case, User
from tests.conftest import login, open_case


def test_redaction():
    text = "EID 784-1990-1234567-1, passport A1234567, phone +971 50 123 4567, token=abc123, user@example.com"
    out = redact_text(text)
    assert "1234567" not in out and "A1234567" not in out and "abc123" not in out and "123 4567" not in out
    assert redact_value({"password": "x", "emirates_id_last4": "4567", "nested": {"api_key": "k"}})["nested"]["api_key"] == "[REDACTED]"


async def test_security_headers_and_error_envelope(client, infra, world):
    r = await client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert "x-request-id" in r.headers and "x-trace-id" in r.headers
    r = await client.get("/api/v1/cases")
    assert r.status_code == 401 and r.json()["error"]["code"] == "unauthorized"
    r = await client.get("/api/v1/cases", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


async def test_upload_validation(client, infra, world):
    ref = await open_case(infra, world["resident"])
    headers = await login(client, "resident@test.local")
    fake = {"file": ("evil.pdf", b"MZ\x90\x00 not a pdf", "application/pdf")}
    r = await client.post(f"/api/v1/cases/{ref}/documents/CHILD_PHOTO", headers=headers, files=fake)
    assert r.status_code == 422 and r.json()["error"]["code"] == "unsupported_type"
    mismatch = {"file": ("photo.png", b"%PDF-1.4", "image/png")}
    assert (await client.post(f"/api/v1/cases/{ref}/documents/CHILD_PHOTO", headers=headers, files=mismatch)).status_code == 422
    big = {"file": ("big.pdf", b"%PDF-" + b"0" * (11 * 1024 * 1024), "application/pdf")}
    assert (await client.post(f"/api/v1/cases/{ref}/documents/CHILD_PHOTO", headers=headers, files=big)).status_code == 422
    ok = {"file": ("photo.png", b"\x89PNG\r\n\x1a\n....", "image/png")}
    r = await client.post(f"/api/v1/cases/{ref}/documents/CHILD_PHOTO", headers=headers, files=ok)
    assert r.status_code == 200
    doc = next(d for d in r.json()["groups"]["CHILD"] if d["doc_type"] == "CHILD_PHOTO")
    assert doc["status"] == "UPLOADED"  # never "verified by government"


async def test_ready_and_metrics(client, infra, world):
    r = await client.get("/ready")
    body = r.json()
    assert r.status_code == 200 and body["dependencies"]["postgres"]["healthy"]
    assert body["dependencies"]["kafka"]["fallback"] and body["dependencies"]["redis"]["fallback"]
    assert body["dependencies"]["neo4j"]["fallback"] and body["dependencies"]["langfuse"]["backend"] == "local"
    assert body["dependencies"]["government"]["mode"] == "mock"
    metrics = await client.get("/metrics")
    assert "lifeloop_http_requests_total" in metrics.text


async def test_seed_is_idempotent_and_builds_demo_cases(infra):
    from app.seed.seed import run_seed

    first = await run_seed(infra)
    second = await run_seed(infra)
    assert first == second
    async with infra.sessionmaker() as s:
        assert await s.scalar(select(func.count()).select_from(User)) == 6
        assert await s.scalar(select(func.count()).select_from(Case)) == 3
        from app.services.container import ServiceContainer

        c = ServiceContainer(s, infra=infra)
        case = await c.cases_repo.by_reference("LL-DEMO-001")
        states = {n.key: (n.state.value, n.status_source.value) for n in await c.nodes_repo.for_case(case.id)}
    assert states == {
        "BIRTH_CERTIFICATE": ("CLEARED", "GOVERNMENT_MOCK"), "MOFA_ATTESTATION": ("CLEARED", "GOVERNMENT_MOCK"),
        "CONSULATE_PASSPORT": ("COMPLETED", "PARENT_REPORTED"), "RESIDENCE_VISA": ("PROCESSING", "GOVERNMENT_MOCK"),
        "EMIRATES_ID": ("PENDING", "SYSTEM"), "INSURANCE": ("PENDING", "SYSTEM"),
    }


async def test_demo_controls_drive_the_real_pipeline(client, infra):
    from app.seed.seed import run_seed

    await run_seed(infra)
    officer = await login(client, "demo.officer@lifeloop.local")
    r = await client.post("/api/v1/demo/cases/LL-DEMO-001/nodes/RESIDENCE_VISA/DOCUMENT_MISSING", headers=officer)
    assert r.status_code == 200, r.text
    from app.events.pump import pump

    await pump(infra)
    graph = (await client.get("/api/v1/cases/LL-DEMO-001/graph", headers=officer)).json()
    visa = next(n for n in graph["nodes"] if n["key"] == "RESIDENCE_VISA")
    assert visa["state"] == "DOCUMENT_MISSING" and visa["status_source"] == "GOVERNMENT_MOCK"
    resident = await login(client, "demo.resident@lifeloop.local")
    assert (await client.post("/api/v1/demo/cases/LL-DEMO-001/nodes/RESIDENCE_VISA/CLEARED", headers=resident)).status_code == 403
    r = await client.post("/api/v1/demo/reset", headers=officer)
    assert r.status_code == 200
    graph = (await client.get("/api/v1/cases/LL-DEMO-001/graph", headers=officer)).json()
    assert next(n for n in graph["nodes"] if n["key"] == "RESIDENCE_VISA")["state"] == "PROCESSING"


async def test_demo_reset_with_live_workers_rebuilds_the_exact_demo_state(client, infra):
    """With the background workers running (as in production), the reset's scripted replay must not be raced by the live
    relay picking up its events on the real clock: the rebuilt case lands in the documented demo state every time."""
    from app.seed.seed import run_seed
    from app.workers.runner import WorkerRunner

    await run_seed(infra)
    runner = WorkerRunner(infra)
    infra.workers = runner
    await runner.start()
    try:
        officer = await login(client, "demo.officer@lifeloop.local")
        for _ in range(2):
            r = await client.post("/api/v1/demo/reset", headers=officer)
            assert r.status_code == 200, r.text
            graph = (await client.get("/api/v1/cases/LL-DEMO-001/graph", headers=officer)).json()
            states = {n["key"]: n["state"] for n in graph["nodes"]}
            assert states == {"BIRTH_CERTIFICATE": "CLEARED", "MOFA_ATTESTATION": "CLEARED", "CONSULATE_PASSPORT": "COMPLETED",
                              "RESIDENCE_VISA": "PROCESSING", "EMIRATES_ID": "PENDING", "INSURANCE": "PENDING"}, states
        assert runner.status()["paused"] is False
    finally:
        await runner.stop()
        infra.workers = None


def test_library_loggers_stay_quiet_even_when_created_after_configuration():
    """SQL statements (and their parameters) must never reach the logs: SQLAlchemy creates its engine logger only when
    an engine is built, after logging is configured, and Logifyx would give it the app's INFO level."""
    import logging

    from sqlalchemy.ext.asyncio import create_async_engine

    from app.observability.logging import configure_logging

    configure_logging("INFO", "none", True)
    try:
        create_async_engine("sqlite+aiosqlite:///:memory:")
        assert logging.getLogger("sqlalchemy.engine.Engine").getEffectiveLevel() >= logging.WARNING
        assert logging.getLogger("httpx").getEffectiveLevel() >= logging.WARNING
        assert logging.getLogger("lifeloop.relay").getEffectiveLevel() == logging.INFO
    finally:
        configure_logging("ERROR", "none", True)


def test_alembic_migrations_match_models(tmp_path: Path):
    """Upgrade an empty database to head and compare it with the models: no drift allowed."""
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext
    from sqlalchemy import create_engine

    from app.db.base import Base
    from app.db.migrate import _upgrade

    db = tmp_path / "migrate.sqlite3"
    _upgrade(f"sqlite+aiosqlite:///{db}")
    engine = create_engine(f"sqlite:///{db}")
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn, opts={"compare_type": False}), Base.metadata)
    engine.dispose()
    assert [d for d in diff if d[0] in ("add_table", "remove_table", "add_column", "remove_column")] == []


async def test_sse_requires_a_token(client, infra, world):
    ref = await open_case(infra, world["resident"])
    assert (await client.get(f"/api/v1/cases/{ref}/events/stream")).status_code == 422
    assert (await client.get(f"/api/v1/cases/{ref}/events/stream?access_token={'x' * 30}")).status_code == 401
    await asyncio.sleep(0)


async def test_officer_dashboard_endpoints(client, infra):
    from app.seed.seed import run_seed

    await run_seed(infra)
    officer = await login(client, "demo.officer@lifeloop.local")
    for path in ("/api/v1/officer/stats", "/api/v1/officer/cases?queue=pending", "/api/v1/officer/cases/LL-DEMO-001", "/api/v1/officer/approvals",
                 "/api/v1/officer/escalations", "/api/v1/officer/callbacks", "/api/v1/officer/audit", "/api/v1/officer/analytics",
                 "/api/v1/entities", "/api/v1/agent/config", "/api/v1/demo", "/api/v1/knowledge", "/api/v1/cases/LL-DEMO-001/timeline",
                 "/api/v1/cases/LL-DEMO-001/documents", "/api/v1/cases/LL-DEMO-001/requests", "/api/v1/cases/LL-DEMO-001/events"):
        r = await client.get(path, headers=officer)
        assert r.status_code == 200, (path, r.text[:300])
    analytics = (await client.get("/api/v1/officer/analytics", headers=officer)).json()
    assert [k["baseline"] for k in analytics["kpis"]] == [6, 7, 6] and [k["target"] for k in analytics["kpis"]] == [1, 2, 1]
    assert "DEMO / SIMULATED" in analytics["label"]
    stats = (await client.get("/api/v1/officer/stats", headers=officer)).json()
    assert stats["pending_approval"] >= 1 and stats["escalations"] >= 1
    admin = await login(client, "demo.admin@lifeloop.local")
    assert (await client.get("/api/v1/users", headers=admin)).json()["total"] == 6
    assert (await client.post("/api/v1/agent/sync?dry_run=true", headers=admin)).json()["config"]["workflow"]["nodes"]
