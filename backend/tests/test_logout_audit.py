"""Logout mencatat audit bila sesi valid; tetap 200 dan menghapus cookie bila tidak."""

import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import audit
import main
from auth import jwt as authjwt
from db.database import get_db


@pytest.fixture
def client(monkeypatch):
    rows = []

    async def fake_insert(**kw):
        rows.append(kw)

    monkeypatch.setattr(audit, "insert_audit_log", fake_insert)
    main.app.dependency_overrides[get_db] = lambda: None
    c = TestClient(main.app)
    c.rows = rows
    yield c
    main.app.dependency_overrides.clear()


def test_logout_with_valid_session_is_audited(client, monkeypatch):
    uid = uuid.uuid4()

    async def fake_user(db, user_id):
        return SimpleNamespace(id=user_id, email="a@banksampoerna.com")

    monkeypatch.setattr(authjwt, "get_user_by_id", fake_user)
    client.cookies.set("cpdf_token", authjwt.create_token(str(uid), "a@banksampoerna.com"), path="/api")
    r = client.post("/api/auth/logout")
    assert r.status_code == 200
    assert [(x["action"], x["status"], x["user_email"]) for x in client.rows] == [("LOGOUT", "SUCCESS", "a@banksampoerna.com")]
    assert "cpdf_token" in r.headers.get("set-cookie", "")  # cookie dihapus


@pytest.mark.parametrize("cookie", [None, "sampah", "a.b.c"])
def test_logout_without_valid_session_is_quiet(client, cookie):
    if cookie:
        client.cookies.set("cpdf_token", cookie, path="/api")
    r = client.post("/api/auth/logout")
    assert r.status_code == 200 and client.rows == []
