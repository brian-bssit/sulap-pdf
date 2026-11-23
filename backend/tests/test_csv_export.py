"""CSV: sel berawalan = + - @ dinetralkan (formula injection); ekspor user tersedia untuk peran admin/auditor."""

import csv
import io
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import main
from admin.router import _cell
from auth import dependencies
from db.database import get_db


@pytest.mark.parametrize("raw,expected", [
    ("=HYPERLINK(\"http://x\")", "'=HYPERLINK(\"http://x\")"), ("+1+1", "'+1+1"), ("-2", "'-2"), ("@SUM(A1)", "'@SUM(A1)"),
    ("\tcmd", "'\tcmd"), ("biasa.pdf", "biasa.pdf"), ("", ""), (None, ""), ("a=b", "a=b"),
])
def test_cell_neutralizes_formulas(raw, expected):
    assert _cell(raw) == expected


class _FakeResult:
    def __init__(self, rows): self._rows = rows
    def scalars(self): return self
    def all(self): return self._rows


class _FakeDB:
    def __init__(self, rows): self.rows = rows
    async def execute(self, stmt): return _FakeResult(self.rows)


def _client(monkeypatch, role, rows):
    # get_current_auditor_or_admin memanggil get_current_user sebagai fungsi biasa → patch di modulnya.
    async def fake_user(request, db):
        return SimpleNamespace(id="u", role=role, email="x@b.c", is_active=True)

    monkeypatch.setattr(dependencies, "get_current_user", fake_user)
    main.app.dependency_overrides[get_db] = lambda: _FakeDB(rows)
    return TestClient(main.app)


@pytest.fixture(autouse=True)
def _clear():
    yield
    main.app.dependency_overrides.clear()


def test_users_csv_content_and_injection_safe(monkeypatch):
    now = datetime(2026, 11, 20, tzinfo=timezone.utc)
    rows = [
        SimpleNamespace(email="a@banksampoerna.com", display_name="=cmd|' /C calc'!A0", role="user", is_active=True, last_login_at=now, created_at=now),
        SimpleNamespace(email="b@banksampoerna.com", display_name="Budi", role="auditor", is_active=False, last_login_at=None, created_at=now),
    ]
    r = _client(monkeypatch, "auditor", rows).get("/api/admin/users/csv")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    parsed = list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))
    assert parsed[0] == ["Email", "Nama", "Role", "Aktif", "Login Terakhir", "Dibuat"]
    assert parsed[1][1].startswith("'=")          # tidak dieksekusi Excel
    assert parsed[2][3] == "tidak" and parsed[2][4] == ""


@pytest.mark.parametrize("role,code", [("super_admin", 200), ("dca_officer", 200), ("dca_supervisor", 200), ("auditor", 200), ("user", 403)])
def test_users_csv_role_gate(monkeypatch, role, code):
    assert _client(monkeypatch, role, []).get("/api/admin/users/csv").status_code == code
