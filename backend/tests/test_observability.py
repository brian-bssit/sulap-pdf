"""Unit tests: log JSON, request_id, log akses, /ready. Tanpa DB."""

import json
import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from logging_setup import JsonFormatter, request_ctx
from middleware import origin
from middleware.request_context import RequestContextMiddleware


class _Capture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lines = []

    def emit(self, record):
        self.lines.append(json.loads(JsonFormatter().format(record)))


@pytest.fixture
def cap():
    h = _Capture()
    lg = logging.getLogger("cloudpdf")
    old = lg.level
    lg.setLevel(logging.DEBUG)
    lg.addHandler(h)
    yield h
    lg.removeHandler(h)
    lg.setLevel(old)


def _app():
    app = FastAPI()

    @app.get("/api/pdf/compress")
    async def tool():
        request_ctx.get()["user_id"] = "u-1"   # seperti get_current_user
        return {"ok": True}

    @app.get("/api/boom")
    async def boom():
        raise RuntimeError("x")

    @app.get("/api/health")
    async def health():
        return {}

    app.add_middleware(RequestContextMiddleware)
    return app


def test_formatter_valid_json_with_fields():
    rec = logging.LogRecord("cloudpdf", logging.WARNING, "f", 1, "halo %s", ("dunia",), None)
    rec.fields = {"event": "x", "n": 3}
    d = json.loads(JsonFormatter().format(rec))
    assert d["severity"] == "WARNING" and d["message"] == "halo dunia" and d["event"] == "x" and d["n"] == 3
    assert d["request_id"] is None


def test_formatter_exception():
    try:
        raise ValueError("bad")
    except ValueError:
        import sys
        rec = logging.LogRecord("c", logging.ERROR, "f", 1, "gagal", (), sys.exc_info())
    assert "ValueError: bad" in json.loads(JsonFormatter().format(rec))["exception"]


def test_request_id_generated_and_logged(cap):
    r = TestClient(_app()).get("/api/pdf/compress?secret=1")
    rid = r.headers["x-request-id"]
    assert len(rid) == 12
    line = [l for l in cap.lines if l.get("event") == "request"][0]
    assert line["request_id"] == rid
    assert line["path"] == "/api/pdf/compress" and "secret" not in json.dumps(line)
    assert line["status"] == 200 and line["tool"] == "compress" and line["duration_ms"] >= 0


def test_valid_incoming_request_id_kept_invalid_replaced():
    c = TestClient(_app())
    assert c.get("/api/health", headers={"X-Request-ID": "abc-123.x"}).headers["x-request-id"] == "abc-123.x"
    bad = c.get("/api/health", headers={"X-Request-ID": "bad id\twith spaces"}).headers["x-request-id"]
    assert bad != "bad id\twith spaces" and len(bad) == 12


def test_user_id_visible_in_access_log_via_holder(monkeypatch):
    seen = {}

    class H(logging.Handler):
        def emit(self, record):
            seen.update(request_ctx.get() or {})
            seen["fields"] = record.fields

    lg = logging.getLogger("cloudpdf")
    h = H()
    lg.addHandler(h)
    lg.setLevel(logging.INFO)
    try:
        TestClient(_app()).get("/api/pdf/compress")
    finally:
        lg.removeHandler(h)
    assert seen["user_id"] == "u-1" and seen["request_id"]


def test_unhandled_error_logged_as_500(cap):
    with pytest.raises(RuntimeError):
        TestClient(_app()).get("/api/boom")
    line = [l for l in cap.lines if l.get("event") == "request"][0]
    assert line["status"] == 500


def test_health_quiet_at_info(cap):
    lg = logging.getLogger("cloudpdf")
    lg.setLevel(logging.INFO)
    TestClient(_app()).get("/api/health")
    assert [l for l in cap.lines if l.get("event") == "request"] == []


# ── /api/ready ──
def _ready(monkeypatch, db=True, qpdf=True, lo=True, tess=True):
    async def fake_db():
        return db

    monkeypatch.setattr(origin, "_db_ok", fake_db)
    monkeypatch.setattr(origin.shutil, "which", lambda n: "/bin/x" if {"qpdf": qpdf, "tesseract": tess}.get(n, lo) else None)
    app = FastAPI()
    app.include_router(origin.router, prefix="/api")
    return TestClient(app).get("/api/ready")


def test_ready_all_ok(monkeypatch):
    r = _ready(monkeypatch)
    assert r.status_code == 200 and r.json()["status"] == "READY"


@pytest.mark.parametrize("kw,key", [({"db": False}, "db"), ({"qpdf": False}, "qpdf"), ({"lo": False}, "libreoffice"), ({"tess": False}, "tesseract")])
def test_ready_503_when_component_down(monkeypatch, kw, key):
    r = _ready(monkeypatch, **kw)
    assert r.status_code == 503 and r.json()["checks"][key] is False and r.json()["status"] == "NOT_READY"
