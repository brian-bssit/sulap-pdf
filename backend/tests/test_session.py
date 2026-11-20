"""Sesi: satu sesi per akun (login terbaru menang), idle timeout, batas absolut, alasan 401. Tanpa DB."""

import asyncio
import time
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import jwt as pyjwt
import pytest
from fastapi import HTTPException

from auth import session
from auth.jwt import create_token, decode_token
from config import settings


def run(coro):
    return asyncio.run(coro)


class FakeDB:
    def __init__(self):
        self.commits = 0

    async def commit(self):
        self.commits += 1


def now():
    return datetime.now(timezone.utc)


def make_user(sid=None, last_seen_ago=None):
    return SimpleNamespace(
        id=uuid.uuid4(), email="a@banksampoerna.com",
        session_id=sid, last_seen_at=None if last_seen_ago is None else now() - timedelta(seconds=last_seen_ago),
    )


@pytest.fixture
def audits(monkeypatch):
    rows = []

    async def fake(db, request, user_id, email, action, **kw):
        rows.append((action, kw.get("status")))

    monkeypatch.setattr(session, "log_audit", fake)
    monkeypatch.setattr(settings, "idle_timeout_seconds", 600)
    return rows


def expect_401(user, payload, reason):
    with pytest.raises(HTTPException) as e:
        run(session.validate_session(FakeDB(), None, user, payload))
    assert e.value.status_code == 401
    assert e.value.headers["X-Auth-Reason"] == reason
    return e.value


# ── validate_session ──
def test_active_session_recent_no_write(audits):
    sid = uuid.uuid4()
    u, db = make_user(sid, last_seen_ago=5), FakeDB()
    run(session.validate_session(db, None, u, {"sid": str(sid)}))
    assert db.commits == 0 and audits == []


def test_active_session_touches_after_interval(audits):
    sid = uuid.uuid4()
    u, db = make_user(sid, last_seen_ago=45), FakeDB()
    run(session.validate_session(db, None, u, {"sid": str(sid)}))
    assert db.commits == 1 and (now() - u.last_seen_at).total_seconds() < 2


def test_other_sid_is_replaced(audits):
    e = expect_401(make_user(uuid.uuid4(), 1), {"sid": str(uuid.uuid4())}, "SESSION_REPLACED")
    assert "login di tempat lain" in e.detail


@pytest.mark.parametrize("payload,sid", [({}, uuid.uuid4()), ({"sid": None}, uuid.uuid4())])
def test_token_without_sid_invalid(audits, payload, sid):
    expect_401(make_user(sid, 1), payload, "SESSION_INVALID")


def test_user_without_session_is_replaced(audits):
    expect_401(make_user(None, None), {"sid": str(uuid.uuid4())}, "SESSION_REPLACED")


def test_idle_expiry_audited_once(audits):
    sid = uuid.uuid4()
    u = make_user(sid, last_seen_ago=661)
    expect_401(u, {"sid": str(sid)}, "SESSION_IDLE")
    assert audits == [("SESSION_IDLE_EXPIRED", "SUCCESS")] and u.last_seen_at is None
    expect_401(u, {"sid": str(sid)}, "SESSION_IDLE")   # request berikutnya: tetap 401, tak dicatat ulang
    assert len(audits) == 1


def test_just_inside_idle_window_ok(audits):
    sid = uuid.uuid4()
    run(session.validate_session(FakeDB(), None, make_user(sid, 650), {"sid": str(sid)}))  # idle 600 + kelonggaran 60


def test_idle_timeout_is_configurable(audits, monkeypatch):
    monkeypatch.setattr(settings, "idle_timeout_seconds", 15)
    sid = uuid.uuid4()
    expect_401(make_user(sid, 20 + session.IDLE_GRACE_SECONDS), {"sid": str(sid)}, "SESSION_IDLE")
    run(session.validate_session(FakeDB(), None, make_user(sid, 20), {"sid": str(sid)}))  # di dalam kelonggaran: masih sah


# ── issue_token ──
def test_issue_token_new_sid_and_claims(audits):
    u, db = make_user(None, None), FakeDB()
    tok = run(session.issue_token(db, None, u))
    payload = decode_token(tok)
    assert payload["sid"] == str(u.session_id) and payload["user_id"] == str(u.id)
    assert db.commits == 1 and audits == []


def test_second_login_replaces_first_and_is_audited(audits):
    u = make_user(None, None)
    t1 = decode_token(run(session.issue_token(FakeDB(), None, u)))
    t2 = decode_token(run(session.issue_token(FakeDB(), None, u)))
    assert t1["sid"] != t2["sid"] and str(u.session_id) == t2["sid"]
    assert audits == [("SESSION_REPLACED", "SUCCESS")]
    expect_401(u, {"sid": t1["sid"]}, "SESSION_REPLACED")          # sesi lama mati
    run(session.validate_session(FakeDB(), None, u, {"sid": t2["sid"]}))  # sesi baru hidup


def test_login_after_idle_is_not_reported_as_replaced(audits):
    u = make_user(uuid.uuid4(), last_seen_ago=900)
    run(session.issue_token(FakeDB(), None, u))
    assert audits == []


def test_login_after_idle_expiry_marker_not_replaced(audits):
    u = make_user(uuid.uuid4(), None)   # last_seen None = sudah dinyatakan habis
    run(session.issue_token(FakeDB(), None, u))
    assert audits == [] and u.last_seen_at is not None


# ── batas absolut 8 jam (JWT exp) ──
def test_absolute_expiry_enforced_by_token():
    old = pyjwt.encode({"user_id": "u", "sid": "s", "exp": int(time.time()) - 1}, settings.secret_key, algorithm="HS256")
    assert decode_token(old) is None
    fresh = decode_token(create_token("u", "a@b.c", "s"))
    assert 7.9 * 3600 < fresh["exp"] - time.time() <= 8 * 3600
