"""RBAC, organisation scoping, and the human approval gate (cannot be bypassed)."""
from app.events.pump import pump
from tests.conftest import login, node_state, open_case


async def test_case_visibility(client, infra, world):
    ref = await open_case(infra, world["resident"])
    other = await client.post("/api/v1/auth/register", json={"email": "other@test.local", "password": "Other-pass-2026", "full_name": "Other"})
    assert other.status_code == 201
    other_h = {"Authorization": f"Bearer {other.json()['tokens']['access_token']}"}
    assert (await client.get(f"/api/v1/cases/{ref}", headers=other_h)).status_code == 404  # existence not revealed
    assert (await client.get(f"/api/v1/cases/{ref}", headers=await login(client, "resident@test.local"))).status_code == 200
    assert (await client.get(f"/api/v1/officer/cases/{ref}", headers=await login(client, "officer@test.local"))).status_code == 200
    assert (await client.get(f"/api/v1/officer/cases/{ref}", headers=await login(client, "outsider@test.local"))).status_code == 404
    assert (await client.get(f"/api/v1/officer/cases/{ref}", headers=await login(client, "admin@test.local"))).status_code == 200
    resident = await login(client, "resident@test.local")
    assert (await client.get("/api/v1/officer/cases", headers=resident)).status_code == 403


async def test_human_approval_gate(client, infra, world):
    ref = await open_case(infra, world["resident"])
    officer = await login(client, "officer@test.local")
    approvals = (await client.get("/api/v1/officer/approvals", headers=officer)).json()
    approval = next(a for a in approvals if a["case_reference"] == ref)
    assert approval["node_key"] == "BIRTH_CERTIFICATE"
    assert all("784" not in str(f["value"]) for f in approval["fields"])  # officers see tokens, not ID numbers

    resident = await login(client, "resident@test.local")
    assert (await client.post(f"/api/v1/officer/approvals/{approval['id']}/approve", headers=resident, json={})).status_code == 403
    outsider = await login(client, "outsider@test.local")
    assert (await client.post(f"/api/v1/officer/approvals/{approval['id']}/approve", headers=outsider, json={})).status_code == 403
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "WAITING_FOR_HUMAN"

    r = await client.post(f"/api/v1/officer/approvals/{approval['id']}/approve", headers=officer, json={"note": "Checked"})
    assert r.status_code == 200
    await pump(infra)
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "SUBMITTED"
    again = await client.post(f"/api/v1/officer/approvals/{approval['id']}/approve", headers=officer, json={})
    assert again.status_code == 409  # cannot release twice

    audit = (await client.get(f"/api/v1/officer/audit?case={ref}&action=OfficerApproved", headers=officer)).json()
    assert audit["total"] == 1 and "Officer One" in audit["items"][0]["actor"]
    denied = (await client.get(f"/api/v1/officer/audit?case={ref}&action=ApproveReleaseDenied", headers=officer)).json()
    assert denied["total"] >= 1


async def test_reject_and_request_documents(client, infra, world):
    ref = await open_case(infra, world["resident"])
    officer = await login(client, "officer@test.local")
    approval = (await client.get("/api/v1/officer/approvals", headers=officer)).json()[0]
    r = await client.post(f"/api/v1/officer/approvals/{approval['id']}/reject", headers=officer, json={"reason": "Name spelling differs"})
    assert r.status_code == 200
    await pump(infra)
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "BLOCKED"

    r = await client.post(f"/api/v1/officer/cases/{ref}/request-documents", headers=officer,
                          json={"node_key": "BIRTH_CERTIFICATE", "documents": ["HOSPITAL_BIRTH_NOTIFICATION"], "note": "Need a clearer copy"})
    assert r.status_code == 200
    await pump(infra)
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "DOCUMENT_MISSING"
    approvals = (await client.get("/api/v1/officer/approvals", headers=officer)).json()
    assert not [a for a in approvals if a["case_reference"] == ref]

    resident = await login(client, "resident@test.local")
    files = {"file": ("notification.pdf", b"%PDF-1.7 hospital notification", "application/pdf")}
    r = await client.post(f"/api/v1/cases/{ref}/documents/HOSPITAL_BIRTH_NOTIFICATION", headers=resident, files=files)
    assert r.status_code == 200, r.text
    await pump(infra)
    assert await node_state(infra, ref, "BIRTH_CERTIFICATE") == "WAITING_FOR_HUMAN"


async def test_escalate_transfer_resolve(client, infra, world):
    ref = await open_case(infra, world["resident"])
    officer = await login(client, "officer@test.local")
    r = await client.post(f"/api/v1/officer/cases/{ref}/escalate", headers=officer, json={"reason": "DISPUTED_RECORD", "note": "Name mismatch"})
    assert r.status_code == 200
    esc = r.json()
    assert (await client.get(f"/api/v1/cases/{ref}", headers=officer)).json()["status"] == "ESCALATED"
    r = await client.post(f"/api/v1/officer/escalations/{esc['id']}/resolve", headers=officer, json={"resolution": "Corrected with hospital"})
    assert r.status_code == 200
    r = await client.post(f"/api/v1/officer/cases/{ref}/transfer", headers=officer, json={"to_officer_id": str(world["admin"].id), "note": "Cover"})
    assert r.status_code == 200
