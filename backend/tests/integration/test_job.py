"""pdf/job.run_job: cleanup, audit, batas, timeout. App mini; auth/DB/audit di-stub oleh conftest integrasi."""

import asyncio
import uuid
from types import SimpleNamespace

import pytest
from fastapi import Depends, FastAPI, File, Request, UploadFile
from fastapi.testclient import TestClient

from config import settings
from pdf.job import run_job

USER = SimpleNamespace(id=uuid.uuid4(), email="t@banksampoerna.com")
PDF = b"%PDF-1.4\n%%EOF\n"


def _client(work, **kw):
    app = FastAPI()

    @app.post("/t")
    async def t(request: Request, files: list[UploadFile] = File(...)):
        return await run_job(request, None, USER, "TESTJOB", files, work,
                             filename_out="out.pdf", headers_fn=lambda i, o: {"X-In": str(i), "X-Out": str(o)}, **kw)

    return TestClient(app, raise_server_exceptions=False)


def _post(c, data=PDF):
    return c.post("/t", files=[("files", ("a.pdf", data, "application/pdf"))])


def test_success_audit_and_headers(audit_rows, monkeypatch):
    seen = {}

    async def work(job, paths):
        seen["dir"] = job.dir
        assert job.dir.is_dir() and paths[0].read_bytes() == PDF
        return b"RESULT"

    r = _post(_client(work, check_encrypted=False))
    assert r.status_code == 200 and r.content == b"RESULT"
    assert r.headers["x-out"] == "6" and r.headers["x-in"] == str(len(PDF))
    assert not seen["dir"].exists()  # dihapus (no_tmp_leaks juga memeriksa)
    assert [(a["action"], a["status"]) for a in audit_rows] == [("TESTJOB", "SUCCESS")]
    assert audit_rows[0]["source_files"] == ["a.pdf"] and audit_rows[0]["result_size"] == 6


def test_work_exception_500_audit_failed_and_cleanup(audit_rows):
    async def work(job, paths):
        raise RuntimeError("rahasia /tmp/x")

    r = _post(_client(work, check_encrypted=False))
    assert r.status_code == 500 and "rahasia" not in r.text
    assert audit_rows[0]["status"] == "FAILED" and "rahasia" not in str(audit_rows[0])


def test_not_pdf_400(audit_rows):
    async def work(job, paths):
        raise AssertionError("tidak boleh dipanggil")

    r = _post(_client(work), b"GIF89a....")
    assert r.status_code == 400 and audit_rows[0]["status"] == "FAILED"


def test_empty_400(audit_rows):
    async def work(job, paths):
        raise AssertionError

    assert _post(_client(work), b"").status_code == 400


def test_too_large_413(audit_rows, monkeypatch):
    monkeypatch.setattr(settings, "max_file_size_mb", 0)

    async def work(job, paths):
        raise AssertionError

    assert _post(_client(work), PDF).status_code == 413


def test_timeout_504(audit_rows, monkeypatch):
    monkeypatch.setattr(settings, "request_timeout_seconds", 10)  # wait_for(timeout=0)

    async def work(job, paths):
        await asyncio.sleep(1)
        return b"x"

    r = _post(_client(work, check_encrypted=False))
    assert r.status_code == 504 and audit_rows[0]["status"] == "FAILED"


def test_disconnect_499(audit_rows, monkeypatch):
    async def gone(self):
        return True

    monkeypatch.setattr(Request, "is_disconnected", gone)

    async def work(job, paths):
        raise AssertionError

    r = _post(_client(work, check_encrypted=False))
    assert r.status_code == 499 and audit_rows[0]["status"] == "CANCELLED_BY_CLIENT"


def test_non_pdf_allowed_when_require_pdf_false(audit_rows):
    async def work(job, paths):
        return paths[0]

    r = _post(_client(work, require_pdf=False), b"GIF89a")
    assert r.status_code == 200 and r.content == b"GIF89a"
