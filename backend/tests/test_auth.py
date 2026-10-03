"""Authentication, email verification, password reset, lockout, token rotation and account provisioning."""
import re

from tests.conftest import PASSWORD, login


def _link_token(infra, email: str) -> str:
    mail = [m for m in infra.email.mailbox if m["to"] == email]
    assert mail, f"no email to {email}"
    return re.search(r"token=([A-Za-z0-9_\-]+)", mail[0]["text"]).group(1)


async def test_register_verify_login_refresh_logout(client, infra, world):
    r = await client.post("/api/v1/auth/register", json={"email": "new.parent@test.local", "password": "Newborn-2026x", "full_name": "New Parent"})
    assert r.status_code == 201, r.text
    assert r.json()["user"]["email_verified"] is False
    await infra.drain_background()
    token = _link_token(infra, "new.parent@test.local")
    assert (await client.post("/api/v1/auth/verify-email", json={"token": token})).status_code == 200
    assert (await client.post("/api/v1/auth/verify-email", json={"token": token})).status_code == 422  # single use

    r = await client.post("/api/v1/auth/login", json={"email": "new.parent@test.local", "password": "Newborn-2026x"})
    tokens = r.json()["tokens"]
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me.json()["email_verified"] is True and me.json()["role"] == "RESIDENT"

    rotated = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert rotated.status_code == 200
    assert (await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})).status_code == 401  # rotation

    new = rotated.json()["tokens"]
    headers = {"Authorization": f"Bearer {new['access_token']}"}
    assert (await client.post("/api/v1/auth/logout", json={"refresh_token": new["refresh_token"]}, headers=headers)).status_code == 204
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401


async def test_weak_password_and_duplicate_email(client, world):
    r = await client.post("/api/v1/auth/register", json={"email": "x@test.local", "password": "short", "full_name": "X"})
    assert r.status_code == 422
    r = await client.post("/api/v1/auth/register", json={"email": "resident@test.local", "password": "Another-pass-1", "full_name": "Dup"})
    assert r.status_code == 409


async def test_lockout_after_repeated_failures(client, world):
    for _ in range(5):
        r = await client.post("/api/v1/auth/login", json={"email": "resident@test.local", "password": "wrong-password-1"})
        assert r.status_code == 401
    r = await client.post("/api/v1/auth/login", json={"email": "resident@test.local", "password": PASSWORD})
    assert r.status_code == 423


async def test_password_reset_flow_invalidates_old_sessions(client, infra, world):
    headers = await login(client, "resident@test.local")
    assert (await client.post("/api/v1/auth/forgot-password", json={"email": "nobody@test.local"})).status_code == 202  # no enumeration
    assert (await client.post("/api/v1/auth/forgot-password", json={"email": "resident@test.local"})).status_code == 202
    await infra.drain_background()
    token = _link_token(infra, "resident@test.local")
    import asyncio

    await asyncio.sleep(1.1)  # iat has second resolution
    r = await client.post("/api/v1/auth/reset-password", json={"token": token, "password": "Fresh-pass-2026"})
    assert r.status_code == 200
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 401  # old session ended
    await login(client, "resident@test.local", "Fresh-pass-2026")


async def test_admin_provisions_officer_by_invitation(client, infra, world):
    admin = await login(client, "admin@test.local")
    org_id = str(world["centre"].id)
    r = await client.post("/api/v1/users", headers=admin, json={"email": "new.officer@test.local", "full_name": "New Officer",
                                                                 "role": "OFFICER", "organization_id": org_id, "title": "Amer Officer"})
    assert r.status_code == 201, r.text
    assert r.json()["invitation_pending"] is True
    await infra.drain_background()
    token = _link_token(infra, "new.officer@test.local")
    r = await client.post("/api/v1/auth/accept-invite", json={"token": token, "password": "Officer-pass-2026"})
    assert r.status_code == 200 and r.json()["user"]["role"] == "OFFICER"
    await login(client, "new.officer@test.local", "Officer-pass-2026")

    # Only admins provision; officers without a centre are refused.
    resident = await login(client, "resident@test.local")
    assert (await client.get("/api/v1/users", headers=resident)).status_code == 403
    r = await client.post("/api/v1/users", headers=admin, json={"email": "orphan@test.local", "full_name": "Orphan", "role": "OFFICER"})
    assert r.status_code == 422


async def test_admin_cannot_demote_self(client, world):
    admin = await login(client, "admin@test.local")
    r = await client.patch(f"/api/v1/users/{world['admin'].id}", headers=admin, json={"role": "OFFICER"})
    assert r.status_code == 403
