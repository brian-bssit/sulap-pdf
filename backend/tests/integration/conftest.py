"""Harness integrasi: app asli + binary asli (qpdf/soffice/pypdf/pikepdf); hanya auth, DB, dan
kuota yang di-stub. Tiap test memastikan tak ada file /tmp/cpdf_* yang tersisa."""

import glob
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import audit
from config import settings


@pytest.fixture
def audit_rows(monkeypatch):
    rows = []

    async def fake_insert(**kw):
        rows.append(kw)

    monkeypatch.setattr(audit, "insert_audit_log", fake_insert)
    return rows


@pytest.fixture
def client(monkeypatch, audit_rows):
    import main
    from auth.dependencies import get_current_user
    from db.database import get_db

    user = SimpleNamespace(id=uuid.uuid4(), email="tester@banksampoerna.com", display_name="Tester", role="user")
    main.app.dependency_overrides[get_current_user] = lambda: user
    main.app.dependency_overrides[get_db] = lambda: None
    monkeypatch.setattr(settings, "rate_limit_per_min", 0)
    monkeypatch.setattr(settings, "quota_per_day", 0)
    yield TestClient(main.app)
    main.app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def no_tmp_leaks():
    before = set(glob.glob("/tmp/cpdf_*"))
    yield
    leaked = set(glob.glob("/tmp/cpdf_*")) - before
    assert not leaked, f"file sementara tersisa: {sorted(leaked)}"
