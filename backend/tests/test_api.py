import pytest
from sqlalchemy import select

from app.core.security import hash_password
from app.models import User
from app.models.enums import UserRole


@pytest.fixture
async def demo_headers(client, session):
    session.add(User(email="op@example.test", hashed_password=hash_password("operator-pw", 4), full_name="Operator", role=UserRole.ADMIN))
    await session.commit()
    r = await client.post("/api/v1/auth/login", json={"email": "op@example.test", "password": "operator-pw"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture
async def resident_headers(client):
    r = await client.post("/api/v1/auth/register", json={"email": "Mum@Example.test", "password": "supersecret1", "full_name": "Mum"})
    assert r.status_code == 201
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


CASE_BODY = {
    "event_type": "BIRTH", "event_date": "2026-09-20", "consent_service_initiation": True, "consent_callback": True,
    "consent_data_processing": True, "participants": [{"role": "child", "name": "Baby"}],
}


async def test_docs_and_health(client):
    assert (await client.get("/docs")).status_code == 200
    assert (await client.get("/redoc")).status_code == 200
    spec = (await client.get("/openapi.json")).json()
    assert "/api/v1/cases/{case_id}/graph" in spec["paths"] and "/mock/entities/{slug}/simulate-complete" in spec["paths"]
    r = await client.get("/api/v1/health/ready")
    assert r.status_code == 200 and r.json()["database"] == "ok"
    assert r.headers["x-content-type-options"] == "nosniff" and "x-request-id" in r.headers


async def test_auth_lifecycle(client, resident_headers):
    me = await client.get("/api/v1/auth/me", headers=resident_headers)
    assert me.status_code == 200 and me.json()["email"] == "mum@example.test" and me.json()["role"] == "RESIDENT"
    assert (await client.get("/api/v1/auth/me")).status_code == 401
    assert (await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage"})).status_code == 401
    dup = await client.post("/api/v1/auth/register", json={"email": "mum@example.test", "password": "supersecret1", "full_name": "x"})
    assert dup.status_code == 409
    bad = await client.post("/api/v1/auth/login", json={"email": "mum@example.test", "password": "wrong-password"})
    assert bad.status_code == 401
    weak = await client.post("/api/v1/auth/register", json={"email": "a@b.co", "password": "short", "full_name": "x"})
    assert weak.status_code == 422
    login = (await client.post("/api/v1/auth/login", json={"email": "mum@example.test", "password": "supersecret1"})).json()
    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert refreshed.status_code == 200
    reuse = await client.post("/api/v1/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert reuse.status_code == 401  # rotated tokens cannot be replayed
    wrong_type = await client.post("/api/v1/auth/refresh", json={"refresh_token": login["access_token"]})
    assert wrong_type.status_code == 401
    headers = {"Authorization": f"Bearer {refreshed.json()['access_token']}"}
    assert (await client.post("/api/v1/auth/logout", json={}, headers=headers)).status_code == 204
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401  # revoked


async def test_case_lifecycle_over_http(client, resident_headers, demo_headers):
    r = await client.post("/api/v1/cases", json=CASE_BODY, headers=resident_headers)
    assert r.status_code == 201, r.text
    case = r.json()
    assert case["status"] == "IN_PROGRESS" and case["progress"]["total"] == 5 and case["reference"].startswith("L-")
    ref = case["reference"]

    tasks = (await client.get(f"/api/v1/cases/{ref}/tasks", headers=resident_headers)).json()
    assert {t["key"] for t in tasks} >= {"BIRTH_REGISTRATION", "IDENTITY_PROCESS"}
    graph = (await client.get(f"/api/v1/cases/{case['id']}/graph", headers=resident_headers)).json()
    assert len(graph["nodes"]) == 7 and graph["edges"]
    passport = (await client.get(f"/api/v1/cases/{ref}/passport", headers=resident_headers)).json()
    assert passport["event"]["type"] == "BIRTH" and len(passport["consents"]) == 3 and passport["participants"]
    timeline = (await client.get(f"/api/v1/cases/{ref}/timeline?order=asc", headers=resident_headers)).json()
    assert timeline["items"][0]["title"] == "Birth event reported" and timeline["total"] >= 3
    consents = (await client.get(f"/api/v1/cases/{ref}/consents", headers=resident_headers)).json()
    assert {c["consent_type"] for c in consents} == {"CALLBACK_CONSENT", "SERVICE_INITIATION_CONSENT", "DATA_PROCESSING_CONSENT"}

    # Residents cannot drive the demo control center; staff can, and it changes real backend state
    assert (await client.post(f"/api/v1/demo/cases/{ref}/actions/complete_birth_registration", headers=resident_headers)).status_code == 403
    done = await client.post(f"/api/v1/demo/cases/{ref}/actions/complete_birth_registration", headers=demo_headers)
    assert done.status_code == 200 and done.json()["snapshot"]["progress"]["completed"] == 1
    stats = (await client.get("/api/v1/dashboard/stats", headers=resident_headers)).json()
    assert stats["counts"]["active_cases"] == 1 and stats["recent_callbacks"]
    events = (await client.get(f"/api/v1/events?case_id={ref}&event_type=TASK_COMPLETED", headers=resident_headers)).json()
    assert events["total"] >= 2 and events["items"][0]["actor_type"] in {"GOVERNMENT_ENTITY", "SYSTEM"}

    # Pause/resume
    assert (await client.post(f"/api/v1/cases/{ref}/pause", headers=resident_headers)).json()["status"] == "PAUSED"
    assert (await client.post(f"/api/v1/cases/{ref}/pause", headers=resident_headers)).status_code == 409
    assert (await client.post(f"/api/v1/cases/{ref}/resume", headers=resident_headers)).json()["status"] == "IN_PROGRESS"


async def test_other_residents_cannot_see_a_case(client, resident_headers):
    ref = (await client.post("/api/v1/cases", json=CASE_BODY, headers=resident_headers)).json()["reference"]
    other = await client.post("/api/v1/auth/register", json={"email": "other@example.test", "password": "supersecret1", "full_name": "Other"})
    h = {"Authorization": f"Bearer {other.json()['access_token']}"}
    assert (await client.get(f"/api/v1/cases/{ref}", headers=h)).status_code == 403
    assert (await client.get("/api/v1/cases", headers=h)).json()["total"] == 0
    assert (await client.get("/api/v1/entities", headers=h)).status_code == 403  # staff only
    assert (await client.get("/api/v1/events", headers=h)).json()["total"] == 0


async def test_consent_endpoint_starts_workflow(client, resident_headers):
    body = {**CASE_BODY, "consent_service_initiation": False}
    case = (await client.post("/api/v1/cases", json=body, headers=resident_headers)).json()
    assert case["status"] == "PENDING_CONSENT" and case["resident_action_required"]
    r = await client.post(f"/api/v1/cases/{case['reference']}/consent", json={"consent_type": "SERVICE_INITIATION_CONSENT", "granted": True}, headers=resident_headers)
    assert r.status_code == 201 and r.json()["status"] == "GRANTED"
    assert (await client.get(f"/api/v1/cases/{case['reference']}", headers=resident_headers)).json()["status"] == "IN_PROGRESS"


async def test_unsupported_event_type_and_validation(client, resident_headers):
    r = await client.post("/api/v1/cases", json={"event_type": "MARRIAGE", "consent_service_initiation": True}, headers=resident_headers)
    assert r.status_code == 422 and r.json()["error"]["code"] == "unsupported_event_type"
    r = await client.post("/api/v1/cases", json={"event_type": "NOPE"}, headers=resident_headers)
    assert r.status_code == 404
    r = await client.post("/api/v1/cases", json={"event_date": "not-a-date"}, headers=resident_headers)
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


async def test_mock_entity_endpoints_emit_domain_events(client, resident_headers, demo_headers):
    ref = (await client.post("/api/v1/cases", json=CASE_BODY, headers=resident_headers)).json()["reference"]
    assert (await client.post("/mock/entities/birth-registration/simulate-complete", json={"case_id": ref, "service_code": "BIRTH_REGISTRATION"}, headers=resident_headers)).status_code == 403
    r = await client.post("/mock/entities/birth-registration/simulate-complete", json={"case_id": ref, "service_code": "BIRTH_REGISTRATION"}, headers=demo_headers)
    assert r.status_code == 200 and r.json()["applied"] and r.json()["event_type"] == "TASK_COMPLETED"
    again = await client.post("/mock/entities/birth-registration/simulate-complete", json={"application_id": r.json()["application_id"]}, headers=demo_headers)
    assert again.status_code == 200 and again.json()["duplicate"] and not again.json()["applied"]
    status = await client.get(f"/mock/entities/birth-registration/applications/{r.json()['application_id']}", headers=demo_headers)
    assert status.json()["status"] == "COMPLETED"

    await client.post("/mock/entities/birth-registration/simulate-complete", json={"case_id": ref, "service_code": "BIRTH_CERTIFICATE"}, headers=demo_headers)
    ident = {"case_id": ref, "service_code": "IDENTITY_APPLICATION"}
    assert (await client.post("/mock/entities/identity/simulate-start", json=ident, headers=demo_headers)).status_code == 200
    assert (await client.post("/mock/entities/identity/simulate-delay", json={**ident, "hours": 12}, headers=demo_headers)).json()["event_type"] == "TASK_DELAYED"
    assert (await client.post("/mock/entities/identity/simulate-document-required", json=ident, headers=demo_headers)).json()["event_type"] == "DOCUMENT_REQUIRED"
    assert (await client.post("/mock/entities/health/simulate-complete", json=ident, headers=demo_headers)).status_code == 422  # wrong authority
    assert (await client.post("/mock/entities/nope/simulate-complete", json=ident, headers=demo_headers)).status_code == 404

    docs = (await client.get(f"/api/v1/cases/{ref}/documents", headers=resident_headers)).json()
    assert [d["status"] for d in docs] == ["REQUESTED"]
    up = await client.post(f"/api/v1/cases/{ref}/documents", data={"doc_type": "proof_of_address"}, files={"file": ("bill.pdf", b"%PDF-demo", "application/pdf")}, headers=resident_headers)
    assert up.status_code == 201 and up.json()["status"] == "RECEIVED" and up.json()["size_bytes"] == 9
    snap = (await client.get(f"/api/v1/cases/{ref}/snapshot", headers=resident_headers)).json()
    assert not snap["pending_actions"]  # document received -> identity resumed automatically
    ops = (await client.get("/api/v1/entities", headers=demo_headers)).json()
    identity = next(e for e in ops if e["code"] == "IDENTITY")
    assert identity["processing"] == 1 and {e["event_type"] for e in identity["recent_events"]} >= {"TASK_RESUMED"}


async def test_entity_webhook_endpoint_is_idempotent(client, resident_headers, demo_headers):
    ref = (await client.post("/api/v1/cases", json=CASE_BODY, headers=resident_headers)).json()["reference"]
    tasks = (await client.get(f"/api/v1/cases/{ref}/tasks", headers=resident_headers)).json()
    external = next(t for t in tasks if t["key"] == "BIRTH_REGISTRATION")["external_ref"]
    body = {"entity_code": "BIRTH_REGISTRATION", "reference": external, "kind": "COMPLETED", "idempotency_key": "webhook-key-0001"}
    a = await client.post("/api/v1/events", json=body, headers=demo_headers)
    b = await client.post("/api/v1/events", json=body, headers=demo_headers)
    assert a.json()["applied"] and b.json()["duplicate"]
    bad = await client.post("/api/v1/events", json={**body, "kind": "TELEPORT", "idempotency_key": "webhook-key-0002"}, headers=demo_headers)
    assert bad.status_code in (409, 422)


async def test_demo_reset_and_seed_case(client, demo_headers, session):
    r = await client.post("/api/v1/demo/reset", headers=demo_headers)
    assert r.status_code == 200
    snap = (await client.get("/api/v1/cases/L-49281/snapshot", headers=demo_headers)).json()
    assert snap["progress"] == {"completed": 2, "total": 5, "percent": 40}
    assert snap["current_stage"] == "Identity Process" and not snap["resident_action_required"]
    assert "Civil Identity Authority" in snap["summary"] and "any action" in snap["summary"]
    actions = (await client.get("/api/v1/demo/actions", headers=demo_headers)).json()
    assert len(actions) >= 10
    listing = (await client.get("/api/v1/callbacks?status=COMPLETED", headers=demo_headers)).json()
    assert len(listing) == 2 and listing[0]["case_reference"] == "L-49281"
    all_users = (await session.scalars(select(User))).all()
    assert len(all_users) >= 1
