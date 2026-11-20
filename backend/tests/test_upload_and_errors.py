"""Unit tests: save_upload (streaming + batas), BodyLimit, PDF terenkripsi, hardening convert."""

import asyncio
import io
import shutil
import subprocess
import sys
from pathlib import Path

import pikepdf
import pytest
from fastapi import HTTPException, UploadFile

from middleware.body_limit import BodyLimitMiddleware
from pdf import convert
from pdf.errors import raise_if_encrypted
from pdf.upload import save_upload


def _upload(data: bytes) -> UploadFile:
    return UploadFile(file=io.BytesIO(data), filename="x.pdf")


def run(coro):
    return asyncio.run(coro)


# ── save_upload ──
def test_save_upload_ok(tmp_path):
    dest = tmp_path / "a.bin"
    assert run(save_upload(_upload(b"x" * 3_000_000), dest, 5_000_000)) == 3_000_000
    assert dest.stat().st_size == 3_000_000


def test_save_upload_exact_limit_ok(tmp_path):
    assert run(save_upload(_upload(b"x" * 1024), tmp_path / "a", 1024)) == 1024


def test_save_upload_over_limit_413_stops_early(tmp_path):
    dest = tmp_path / "a.bin"
    with pytest.raises(HTTPException) as e:
        run(save_upload(_upload(b"x" * 5_000_000), dest, 2_000_000))
    assert e.value.status_code == 413
    # Berhenti di chunk pertama yang melewati batas, bukan menulis semua 5 MB.
    assert dest.stat().st_size <= 1024 * 1024 * 2


def test_save_upload_custom_detail(tmp_path):
    with pytest.raises(HTTPException) as e:
        run(save_upload(_upload(b"xx"), tmp_path / "a", 1, detail="Total file > 30MB"))
    assert e.value.detail == "Total file > 30MB"


# ── BodyLimitMiddleware ──
def _call(mw, method, headers):
    sent = []

    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})

    async def send(m):
        sent.append(m)

    scope = {"type": "http", "method": method, "headers": headers}
    run(BodyLimitMiddleware(app, 100)(scope, None, send))
    return sent[0]["status"]


def test_body_limit_cases():
    assert _call(None, "POST", [(b"content-length", b"101")]) == 413
    assert _call(None, "POST", [(b"content-length", b"100")]) == 200
    assert _call(None, "POST", []) == 200
    assert _call(None, "GET", [(b"content-length", b"999")]) == 200


# ── PDF terenkripsi ──
def _pdf(path: Path, **enc):
    pdf = pikepdf.new()
    pdf.add_blank_page()
    pdf.save(str(path), **enc)


def test_encrypted_pdf_422(tmp_path):
    p = tmp_path / "e.pdf"
    _pdf(p, encryption=pikepdf.Encryption(user="secret", owner="owner"))
    with pytest.raises(HTTPException) as e:
        run(raise_if_encrypted(p))
    assert e.value.status_code == 422
    assert "Unlock" in e.value.detail


def test_owner_only_encryption_passes(tmp_path):
    p = tmp_path / "o.pdf"
    _pdf(p, encryption=pikepdf.Encryption(user="", owner="owner"))
    run(raise_if_encrypted(p))


def test_plain_and_corrupt_pass(tmp_path):
    p = tmp_path / "p.pdf"
    _pdf(p)
    run(raise_if_encrypted(p))
    bad = tmp_path / "bad.pdf"
    bad.write_bytes(b"%PDF-1.4 garbage")
    run(raise_if_encrypted(bad))


# ── hardening convert ──
def test_seed_profile_disables_macros_and_links(tmp_path):
    convert._seed_lo_profile(tmp_path / "lo")
    xcu = (tmp_path / "lo" / "user" / "registrymodifications.xcu").read_text()
    assert 'MacroSecurityLevel" oor:op="fuse"><value>3<' in xcu
    assert 'DisableMacrosExecution" oor:op="fuse"><value>true<' in xcu
    assert xcu.count('"Link"') == 2


def test_child_limits_applied():
    out = subprocess.run(
        [sys.executable, "-c", "import resource;print(resource.getrlimit(resource.RLIMIT_FSIZE)[0])"],
        preexec_fn=convert._child_limits, capture_output=True, text=True, check=True,
    )
    assert int(out.stdout) == 200 * 1024 * 1024


@pytest.mark.skipif(not shutil.which("soffice") and not shutil.which("libreoffice"), reason="LibreOffice tidak terpasang")
def test_real_soffice_accepts_seeded_profile(tmp_path):
    src = tmp_path / "in.txt"
    src.write_text("halo sulap")
    prof = tmp_path / "lo"
    convert._seed_lo_profile(prof)
    r = subprocess.run(convert._build_convert_cmd(prof, src), capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stderr
    assert (tmp_path / "in.pdf").stat().st_size > 0
