"""Dual control perubahan role terhadap Postgres sungguhan.

Jalankan dengan `TEST_DATABASE_URL=postgresql+asyncpg://user@host:port/dbkosong pytest tests/db`.
DB diisi ulang (drop_all/create_all) — JANGAN diarahkan ke DB yang berisi data. Tanpa variabel itu, tes di-SKIP."""

import asyncio
import os
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="TEST_DATABASE_URL tidak di-set (butuh Postgres kosong untuk tes)")

if URL:
    import main
    from admin import role_service
    from auth import dependencies, roles
    from db.database import get_db
    from db.models import AuditLog, Base, RoleChangeRequest, User
    from fastapi import HTTPException
    from fastapi.testclient import TestClient


@pytest.fixture
def env(monkeypatch):
    engine = create_async_engine(URL, poolclass=NullPool)  # tanpa pool: aman lintas event loop TestClient
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async def setup():
        async with engine.begin() as c:
            await c.run_sync(Base.metadata.drop_all)
            await c.run_sync(Base.metadata.create_all)

    asyncio.run(setup())

    async def override_db():
        async with Session() as s:
            yield s

    async def fake_current_user(request, db):
        email = request.headers.get("x-test-user")
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=401, detail="no user")
        return user

    main.app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(dependencies, "get_current_user", fake_current_user)
    client = TestClient(main.app)

    def mk(email, role):
        async def go():
            async with Session() as s:
                u = User(google_sub=f"sub-{uuid.uuid4()}", email=email, display_name=email.split("@")[0], role=role)
                s.add(u)
                await s.commit()
                return u.id
        return asyncio.run(go())

    def q(coro_fn):
        async def go():
            async with Session() as s:
                return await coro_fn(s)
        return asyncio.run(go())

    def call(who, method, path, **kw):
        return client.request(method, f"/api/admin{path}", headers={"x-test-user": who}, **kw)

    yield SimpleNamespace(client=client, mk=mk, q=q, call=call, Session=Session)
    main.app.dependency_overrides.clear()
    asyncio.run(engine.dispose())


def base_world(env):
    ids = {n: env.mk(f"{n}@banksampoerna.com", r) for n, r in [
        ("off1", roles.DCA_OFFICER), ("off2", roles.DCA_OFFICER), ("sup1", roles.DCA_SUPERVISOR),
        ("sa1", roles.SUPER_ADMIN), ("aud", roles.AUDITOR), ("usr", roles.USER), ("usr2", roles.USER),
    ]}
    return ids


def role_of(env, uid):
    return env.q(lambda s: s.scalar(select(User.role).where(User.id == uid)))


def audit_actions(env):
    return env.q(lambda s: _col(s, AuditLog.action))


async def _col(s, col):
    return [r for r in (await s.execute(select(col).order_by(AuditLog.id))).scalars().all()]


def req(env, who, target, role, reason=None):
    return env.call(who, "POST", "/role-requests", json={"user_id": str(target), "role": role, "reason": reason})


# ── alur utama ──
def test_officer_requests_supervisor_approves(env):
    w = base_world(env)
    r = req(env, "off1@banksampoerna.com", w["usr"], roles.AUDITOR, "perlu akses baca")
    assert r.status_code == 201 and r.json()["status"] == "PENDING" and r.json()["reason"] == "perlu akses baca"
    assert role_of(env, w["usr"]) == roles.USER                      # belum berubah sebelum disetujui
    ok = env.call("sup1@banksampoerna.com", "POST", f"/role-requests/{r.json()['id']}/approve", json={"note": "ok"})
    assert ok.status_code == 200 and ok.json()["status"] == "APPROVED" and ok.json()["decided_by_email"] == "sup1@banksampoerna.com"
    assert role_of(env, w["usr"]) == roles.AUDITOR
    assert audit_actions(env)[-2:] == ["ROLE_CHANGE_REQUESTED", "ROLE_CHANGE_APPROVED"]
    assert env.call("sup1@banksampoerna.com", "POST", f"/role-requests/{r.json()['id']}/approve").status_code == 409


def test_reason_is_optional_and_blank_becomes_null(env):
    w = base_world(env)
    assert req(env, "off1@banksampoerna.com", w["usr"], roles.AUDITOR).json()["reason"] is None
    assert req(env, "off1@banksampoerna.com", w["usr2"], roles.AUDITOR, "   ").json()["reason"] is None


def test_super_admin_can_approve_too(env):
    w = base_world(env)
    r = req(env, "off1@banksampoerna.com", w["usr"], roles.AUDITOR).json()
    assert env.call("sa1@banksampoerna.com", "POST", f"/role-requests/{r['id']}/approve").status_code == 200


# ── siapa boleh apa ──
@pytest.mark.parametrize("who,status", [("aud", 403), ("usr", 403), ("sup1", 403), ("sa1", 403)])
def test_only_officer_can_create_requests(env, who, status):
    w = base_world(env)
    assert req(env, f"{who}@banksampoerna.com", w["usr"], roles.AUDITOR).status_code == status


@pytest.mark.parametrize("who", ["off1", "off2", "aud", "usr"])
def test_officer_auditor_user_cannot_approve_or_reject(env, who):
    w = base_world(env)
    r = req(env, "off1@banksampoerna.com", w["usr"], roles.AUDITOR).json()
    assert env.call(f"{who}@banksampoerna.com", "POST", f"/role-requests/{r['id']}/approve").status_code == 403
    assert env.call(f"{who}@banksampoerna.com", "POST", f"/role-requests/{r['id']}/reject").status_code == 403
    assert role_of(env, w["usr"]) == roles.USER


def test_maker_cannot_approve_own_request_even_after_promotion(env):
    w = base_world(env)
    r = req(env, "off1@banksampoerna.com", w["usr"], roles.AUDITOR).json()
    env.call("sa1@banksampoerna.com", "POST", f"/users/{w['off1']}/upgrade", params={"role": roles.DCA_SUPERVISOR})
    res = env.call("off1@banksampoerna.com", "POST", f"/role-requests/{r['id']}/approve")
    assert res.status_code == 403 and "sendiri" in res.json()["detail"]
    assert env.call("off1@banksampoerna.com", "POST", f"/role-requests/{r['id']}/reject").status_code == 403


def test_direct_change_only_super_admin(env):
    w = base_world(env)
    for who in ("off1", "sup1", "aud", "usr"):
        assert env.call(f"{who}@banksampoerna.com", "POST", f"/users/{w['usr']}/upgrade", params={"role": roles.AUDITOR}).status_code == 403
    r = env.call("sa1@banksampoerna.com", "POST", f"/users/{w['usr']}/upgrade", params={"role": roles.AUDITOR})
    assert r.status_code == 200 and role_of(env, w["usr"]) == roles.AUDITOR
    assert "USER_ROLE_CHANGE" in audit_actions(env)


def test_unknown_role_rejected(env):
    w = base_world(env)
    assert env.call("sa1@banksampoerna.com", "POST", f"/users/{w['usr']}/upgrade", params={"role": "root"}).status_code == 422
    assert req(env, "off1@banksampoerna.com", w["usr"], "root").status_code == 422


# ── batasan pengajuan ──
def test_request_validations(env):
    w = base_world(env)
    assert req(env, "off1@banksampoerna.com", w["off1"], roles.USER).status_code == 400            # diri sendiri
    assert req(env, "off1@banksampoerna.com", w["sa1"], roles.USER).status_code == 403             # target Super Admin
    assert req(env, "off1@banksampoerna.com", w["usr"], roles.SUPER_ADMIN).status_code == 403      # jadikan Super Admin
    assert req(env, "off1@banksampoerna.com", w["usr"], roles.USER).status_code == 400             # tanpa perubahan
    assert req(env, "off1@banksampoerna.com", uuid.uuid4(), roles.USER).status_code == 404


def test_only_one_pending_per_target(env):
    w = base_world(env)
    assert req(env, "off1@banksampoerna.com", w["usr"], roles.AUDITOR).status_code == 201
    dup = req(env, "off2@banksampoerna.com", w["usr"], roles.DCA_OFFICER)
    assert dup.status_code == 409


def test_no_expiry_pending_stays_pending(env):
    w = base_world(env)
    r = req(env, "off1@banksampoerna.com", w["usr"], roles.AUDITOR).json()
    assert env.call("aud@banksampoerna.com", "GET", "/role-requests", params={"status": "PENDING"}).json()["data"][0]["id"] == r["id"]


# ── invarian ──
def test_invariant_blocks_removing_last_pair_member(env):
    # Hanya 1 Officer + 1 Supervisor, tanpa Super Admin
    o = env.mk("o@banksampoerna.com", roles.DCA_OFFICER)
    s = env.mk("s@banksampoerna.com", roles.DCA_SUPERVISOR)
    u = env.mk("u@banksampoerna.com", roles.USER)
    # Officer mengajukan penurunan Supervisor terakhir: ditolak sejak pengajuan
    res = req(env, "o@banksampoerna.com", s, roles.USER)
    assert res.status_code == 400 and "minimal 1" in res.json()["detail"]
    # menambah Officer kedua lewat persetujuan boleh
    r = req(env, "o@banksampoerna.com", u, roles.DCA_OFFICER).json()
    assert env.call("s@banksampoerna.com", "POST", f"/role-requests/{r['id']}/approve").status_code == 200


def test_invariant_blocks_demoting_last_super_admin_without_pair(env):
    sa = env.mk("sa@banksampoerna.com", roles.SUPER_ADMIN)
    env.mk("x@banksampoerna.com", roles.USER)
    res = env.call("sa@banksampoerna.com", "POST", f"/users/{sa}/upgrade", params={"role": roles.USER})
    assert res.status_code == 400 and role_of(env, sa) == roles.SUPER_ADMIN


def test_super_admin_may_step_down_when_pair_exists(env):
    w = base_world(env)   # off1, off2, sup1 ada
    assert env.call("sa1@banksampoerna.com", "POST", f"/users/{w['sa1']}/upgrade", params={"role": roles.USER}).status_code == 200


def test_invariant_rechecked_at_approval(env):
    o = env.mk("o@banksampoerna.com", roles.DCA_OFFICER)
    o2 = env.mk("o2@banksampoerna.com", roles.DCA_OFFICER)
    s = env.mk("s@banksampoerna.com", roles.DCA_SUPERVISOR)
    sa = env.mk("sa@banksampoerna.com", roles.SUPER_ADMIN)
    r1 = req(env, "o@banksampoerna.com", o2, roles.USER).json()       # sah: Officer lain (o) masih ada
    # sementara itu Super Admin menurunkan o sendiri dan Supervisor→ pasangan tinggal 1 Officer(o2) + Supervisor
    env.call("sa@banksampoerna.com", "POST", f"/users/{o}/upgrade", params={"role": roles.USER})
    # sekarang menyetujui r1 akan menghabiskan Officer; Super Admin (sa) menutupi → masih sah
    assert env.call("s@banksampoerna.com", "POST", f"/role-requests/{r1['id']}/approve").status_code == 200
    # turunkan Super Admin: pasangan Officer–Supervisor sudah hilang → ditolak
    assert env.call("sa@banksampoerna.com", "POST", f"/users/{sa}/upgrade", params={"role": roles.USER}).status_code == 400


# ── basi, batal, tolak ──
def test_stale_request_is_closed_on_approval(env):
    w = base_world(env)
    r = req(env, "off1@banksampoerna.com", w["usr"], roles.AUDITOR).json()
    env.call("sa1@banksampoerna.com", "POST", f"/users/{w['usr']}/upgrade", params={"role": roles.DCA_OFFICER})
    res = env.call("sup1@banksampoerna.com", "POST", f"/role-requests/{r['id']}/approve")
    assert res.status_code == 409
    assert env.call("aud@banksampoerna.com", "GET", "/role-requests", params={"status": "REJECTED"}).json()["data"][0]["decision_note"] == "Role target berubah sejak diajukan"
    assert role_of(env, w["usr"]) == roles.DCA_OFFICER


def test_cancel_rules(env):
    w = base_world(env)
    r = req(env, "off1@banksampoerna.com", w["usr"], roles.AUDITOR).json()
    assert env.call("off2@banksampoerna.com", "POST", f"/role-requests/{r['id']}/cancel").status_code == 403
    assert env.call("aud@banksampoerna.com", "POST", f"/role-requests/{r['id']}/cancel").status_code == 403
    assert env.call("off1@banksampoerna.com", "POST", f"/role-requests/{r['id']}/cancel").json()["status"] == "CANCELLED"
    # setelah dibatalkan, pengajuan baru untuk target yang sama diperbolehkan
    r2 = req(env, "off2@banksampoerna.com", w["usr"], roles.AUDITOR).json()
    assert env.call("sa1@banksampoerna.com", "POST", f"/role-requests/{r2['id']}/cancel").json()["status"] == "CANCELLED"
    assert "ROLE_CHANGE_CANCELLED" in audit_actions(env)


def test_reject_keeps_role_and_records_note(env):
    w = base_world(env)
    r = req(env, "off1@banksampoerna.com", w["usr"], roles.AUDITOR).json()
    res = env.call("sup1@banksampoerna.com", "POST", f"/role-requests/{r['id']}/reject", json={"note": "tidak perlu"})
    assert res.status_code == 200 and res.json()["status"] == "REJECTED" and res.json()["decision_note"] == "tidak perlu"
    assert role_of(env, w["usr"]) == roles.USER
    assert env.call("sup1@banksampoerna.com", "POST", f"/role-requests/{r['id']}/approve").status_code == 409


def test_listing_access_and_filter(env):
    w = base_world(env)
    req(env, "off1@banksampoerna.com", w["usr"], roles.AUDITOR)
    assert env.call("usr@banksampoerna.com", "GET", "/role-requests").status_code == 403
    assert env.call("aud@banksampoerna.com", "GET", "/role-requests").status_code == 200
    assert env.call("aud@banksampoerna.com", "GET", "/role-requests", params={"status": "BUKAN"}).status_code == 422
    assert env.call("aud@banksampoerna.com", "GET", "/role-requests", params={"status": "APPROVED"}).json()["data"] == []


# ── balapan ──
def test_concurrent_approvals_only_one_wins(env):
    w = base_world(env)
    r = req(env, "off1@banksampoerna.com", w["usr"], roles.AUDITOR).json()
    rid = uuid.UUID(r["id"])
    fake_request = SimpleNamespace(headers={}, client=None)

    async def attempt(email):
        async with env.Session() as s:
            who = (await s.execute(select(User).where(User.email == email))).scalar_one()
            try:
                await role_service.approve(s, fake_request, who, rid, None)
                return "ok"
            except HTTPException as e:
                return e.status_code

    async def both():
        return await asyncio.gather(attempt("sup1@banksampoerna.com"), attempt("sa1@banksampoerna.com"))

    results = asyncio.run(both())
    assert sorted(map(str, results)) == ["409", "ok"]
    assert env.q(lambda s: s.scalar(select(RoleChangeRequest.status).where(RoleChangeRequest.id == rid))) == "APPROVED"
    approvals = [a for a in audit_actions(env) if a == "ROLE_CHANGE_APPROVED"]
    assert len(approvals) == 1
