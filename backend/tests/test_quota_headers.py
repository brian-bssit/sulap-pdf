"""Unit tests: kuota (logika), header keamanan, validasi IP audit. Tanpa DB."""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

import audit
from config import settings
from middleware import quota


def run(coro):
    return asyncio.run(coro)


def _user():
    return SimpleNamespace(id="u1", email="a@banksampoerna.com")


@pytest.fixture
def audited(monkeypatch):
    calls = []

    async def fake_audit(db, request, user_id, email, action, **kw):
        calls.append((action, kw.get("status")))

    monkeypatch.setattr(quota, "log_audit", fake_audit)
    return calls


def _usage_returning(monkeypatch, by_window):
    async def fake(db, user_id, seconds):
        return by_window[seconds]

    monkeypatch.setattr(quota, "_usage", fake)


def test_under_limits_passes(monkeypatch, audited):
    _usage_returning(monkeypatch, {60: (9, 5.0), 86400: (199, 100.0)})
    run(quota.enforce_quota(None, None, _user()))
    assert audited == []


def test_minute_limit_429_with_retry_after(monkeypatch, audited):
    _usage_returning(monkeypatch, {60: (10, 12.3), 86400: (0, None)})
    with pytest.raises(HTTPException) as e:
        run(quota.enforce_quota(None, None, _user()))
    assert e.value.status_code == 429
    assert e.value.headers["Retry-After"] == "13"
    assert audited == [("RATE_LIMITED", "FAILED")]


def test_daily_limit_429(monkeypatch, audited):
    _usage_returning(monkeypatch, {60: (0, None), 86400: (200, 4000.0)})
    with pytest.raises(HTTPException) as e:
        run(quota.enforce_quota(None, None, _user()))
    assert "per hari" in e.value.detail and e.value.headers["Retry-After"] == "4000"


def test_retry_after_clamped(monkeypatch, audited):
    _usage_returning(monkeypatch, {60: (10, -5.0), 86400: (0, None)})
    with pytest.raises(HTTPException) as e:
        run(quota.enforce_quota(None, None, _user()))
    assert e.value.headers["Retry-After"] == "1"


def test_zero_disables(monkeypatch, audited):
    monkeypatch.setattr(settings, "rate_limit_per_min", 0)
    monkeypatch.setattr(settings, "quota_per_day", 0)
    _usage_returning(monkeypatch, {60: (10**6, 1.0), 86400: (10**6, 1.0)})
    run(quota.enforce_quota(None, None, _user()))


def test_security_headers_present():
    import main

    r = TestClient(main.app).get("/api/health")
    assert r.status_code == 200
    for h in ("content-security-policy", "x-content-type-options", "x-frame-options",
              "referrer-policy", "permissions-policy"):
        assert h in r.headers
    assert "accounts.google.com" in r.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]
    assert "strict-transport-security" not in r.headers  # FRONTEND_URL default http


def test_hsts_when_https():
    from middleware.security_headers import SecurityHeadersMiddleware

    assert "Strict-Transport-Security" in SecurityHeadersMiddleware(None, hsts=True)._headers
    assert "Strict-Transport-Security" not in SecurityHeadersMiddleware(None, hsts=False)._headers


def test_audit_drops_non_ip_forwarded_for(monkeypatch):
    seen = {}

    async def fake_insert(**kw):
        seen["ip"] = kw["ip_address"]

    monkeypatch.setattr(audit, "insert_audit_log", fake_insert)
    for xff, expect in [("203.0.113.7, 10.0.0.1", "203.0.113.7"), ("not-an-ip", None), ("", None)]:
        req = SimpleNamespace(headers={"x-forwarded-for": xff, "user-agent": "t"}, client=SimpleNamespace(host="testclient"))
        run(audit.log_audit(None, req, None, "a@b.c", "X"))
        assert seen["ip"] == expect
