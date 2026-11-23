"""Integrasi tiap tool PDF lewat HTTP: engine asli (qpdf, pypdf, pikepdf, LibreOffice), hanya
auth/DB/kuota di-stub. Memeriksa isi hasil (bukan hanya status), audit, dan tak ada sisa /tmp.
Test yang butuh binary yang tak terpasang di-SKIP dengan alasan eksplisit (bukan lulus palsu)."""

import io
import json
import shutil

import pytest
from pypdf import PdfReader

needs_qpdf = pytest.mark.skipif(not shutil.which("qpdf"), reason="qpdf tidak terpasang")
needs_soffice = pytest.mark.skipif(
    not (shutil.which("soffice") or shutil.which("libreoffice")), reason="LibreOffice tidak terpasang"
)


def pages_text(data: bytes) -> list[str]:
    return [(p.extract_text() or "").strip() for p in PdfReader(io.BytesIO(data)).pages]


def last_audit(rows):
    assert rows, "audit tidak tercatat"
    return rows[-1]


# ── compress ──
@needs_qpdf
def test_compress_ok(client, pdf_normal, audit_rows):
    r = client.post("/api/pdf/compress", files={"file": ("a.pdf", pdf_normal)})
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert pages_text(r.content) == ["Halaman 1", "Halaman 2", "Halaman 3"]
    assert r.headers["x-original-size"] == str(len(pdf_normal))
    a = last_audit(audit_rows)
    assert (a["action"], a["status"]) == ("COMPRESS", "SUCCESS") and a["source_files"] == ["a.pdf"]


@needs_qpdf
@pytest.mark.parametrize("name,body,code", [
    ("corrupt", "pdf_corrupt", 422),
    ("encrypted", "pdf_encrypted", 422),
])
def test_compress_bad_input(client, request, audit_rows, name, body, code):
    r = client.post("/api/pdf/compress", files={"file": ("a.pdf", request.getfixturevalue(body))})
    assert r.status_code == code
    assert last_audit(audit_rows)["status"] == "FAILED"


@pytest.mark.parametrize("data", [b"", b"bukan pdf"])
def test_compress_not_pdf_400(client, data):
    assert client.post("/api/pdf/compress", files={"file": ("a.pdf", data)}).status_code == 400


# ── merge ──
def test_merge_ok_order(client, audit_rows):
    from tools.make_fixtures import pdf_normal as mk

    r = client.post("/api/pdf/merge", files=[
        ("files", ("a.pdf", mk(2, "A"))), ("files", ("b.pdf", mk(1, "B"))),
    ])
    assert r.status_code == 200
    assert pages_text(r.content) == ["A 1", "A 2", "B 1"]
    assert r.headers["x-input-files"] == "2"
    assert last_audit(audit_rows)["source_files"] == ["a.pdf", "b.pdf"]


def test_merge_corrupt_is_422_not_500(client, pdf_normal, pdf_corrupt, audit_rows):
    r = client.post("/api/pdf/merge", files=[("files", ("a.pdf", pdf_normal)), ("files", ("b.pdf", pdf_corrupt))])
    assert r.status_code == 422 and "rusak" in r.json()["detail"]
    assert last_audit(audit_rows)["status"] == "FAILED"


def test_merge_encrypted_422(client, pdf_normal, pdf_encrypted):
    r = client.post("/api/pdf/merge", files=[("files", ("a.pdf", pdf_normal)), ("files", ("b.pdf", pdf_encrypted))])
    assert r.status_code == 422 and "Unlock" in r.json()["detail"]


def test_merge_needs_two_files(client, pdf_normal):
    assert client.post("/api/pdf/merge", files=[("files", ("a.pdf", pdf_normal))]).status_code == 400


# ── rearrange ──
def _rearrange(client, data, ops):
    return client.post("/api/pdf/rearrange", files={"file": ("a.pdf", data)}, data={"operations": json.dumps(ops)})


def test_rearrange_reorder(client, pdf_normal, audit_rows):
    r = _rearrange(client, pdf_normal, [{"action": "reorder", "order": [2, 0, 1]}])
    assert r.status_code == 200
    assert pages_text(r.content) == ["Halaman 3", "Halaman 1", "Halaman 2"]
    assert last_audit(audit_rows)["action"] == "REARRANGE"


def test_rearrange_rotate_and_delete(client, pdf_normal):
    r = _rearrange(client, pdf_normal, [{"action": "rotate", "page": 0, "angle": 90}, {"action": "delete", "page": 2}])
    assert r.status_code == 200
    pages = PdfReader(io.BytesIO(r.content)).pages
    assert len(pages) == 2 and pages[0].rotation == 90 and pages[1].rotation == 0


def test_rearrange_200_ok_201_rejected(client, pdf_200, pdf_201):
    assert _rearrange(client, pdf_200, []).status_code == 200
    r = _rearrange(client, pdf_201, [])
    assert r.status_code == 400 and "200" in r.json()["detail"]


def test_rearrange_corrupt_422(client, pdf_corrupt):
    assert _rearrange(client, pdf_corrupt, []).status_code == 422


def test_rearrange_bad_ops_400(client, pdf_normal):
    assert _rearrange(client, pdf_normal, [{"action": "hack"}]).status_code == 400


# ── remove-pages ──
def _remove(client, data, pages):
    return client.post("/api/pdf/remove-pages", files={"file": ("a.pdf", data)}, data={"pages_to_remove": json.dumps(pages)})


def test_remove_pages_ok(client, pdf_normal):
    r = _remove(client, pdf_normal, [0, 2])
    assert r.status_code == 200 and pages_text(r.content) == ["Halaman 2"]


@pytest.mark.parametrize("pages,detail", [([0, 1, 2], "1 halaman"), ([9], "di luar jangkauan")])
def test_remove_pages_invalid_400(client, pdf_normal, pages, detail):
    r = _remove(client, pdf_normal, pages)
    assert r.status_code == 400 and detail in r.json()["detail"]


def test_remove_pages_corrupt_422(client, pdf_corrupt):
    assert _remove(client, pdf_corrupt, [0]).status_code == 422


# ── edit-overlay ──
TEXT_OP = {"type": "text", "page": 1, "x": 72, "y": 600, "text": "DISETUJUI", "font_size": 18, "color": "#ff0000"}


def _edit(client, data, ops):
    return client.post("/api/pdf/edit-overlay", files={"file": ("a.pdf", data)}, data={"operations": json.dumps(ops)})


def test_edit_overlay_text_present(client, pdf_normal, audit_rows):
    r = _edit(client, pdf_normal, [TEXT_OP])
    assert r.status_code == 200 and r.headers["x-overlay-count"] == "1"
    first = pages_text(r.content)[0]
    assert "DISETUJUI" in first and "Halaman 1" in first   # overlay menambah, tak menghapus isi asli
    assert last_audit(audit_rows)["action"] == "EDIT_OVERLAY"


def test_edit_overlay_page_out_of_range_400(client, pdf_normal):
    assert _edit(client, pdf_normal, [{**TEXT_OP, "page": 9}]).status_code == 400


def test_edit_overlay_corrupt_422(client, pdf_corrupt):
    assert _edit(client, pdf_corrupt, [TEXT_OP]).status_code == 422


def test_edit_overlay_encrypted_422(client, pdf_encrypted):
    assert _edit(client, pdf_encrypted, [TEXT_OP]).status_code == 422


# ── convert ──
@needs_soffice
def test_convert_txt_to_pdf(client, audit_rows):
    r = client.post("/api/pdf/convert", files={"file": ("catatan.txt", b"halo sulap", "text/plain")})
    assert r.status_code == 200 and r.content[:4] == b"%PDF"
    assert "halo sulap" in pages_text(r.content)[0]
    a = last_audit(audit_rows)
    assert a["action"] == "CONVERT" and a["result_file"] == "catatan.pdf"


@pytest.mark.parametrize("name,data,code,detail", [
    ("a.pdf", b"%PDF-1.4", 400, "sudah dalam format PDF"),
    ("a.exe", b"MZ", 400, "tidak didukung"),
    ("a.txt", b"", 400, "kosong"),
])
def test_convert_rejections(client, name, data, code, detail):
    r = client.post("/api/pdf/convert", files={"file": (name, data, "text/plain")})
    assert r.status_code == code and detail in r.json()["detail"]


# ── compress: level & hasil tak lebih besar dari asli ──
@needs_qpdf
@pytest.mark.parametrize("level", ["low", "balanced", "high"])
def test_compress_levels_never_grow_file(client, level):
    from tools.make_fixtures import pdf_normal as mk

    data = mk(30)  # cukup besar agar qpdf bisa memadatkan
    r = client.post("/api/pdf/compress", files={"file": ("a.pdf", data)}, data={"level": level})
    assert r.status_code == 200
    assert len(r.content) <= len(data)
    if r.headers["x-compression"] == "unchanged":
        assert r.content == data
    assert int(r.headers["x-compressed-size"]) == len(r.content)
    assert len(pages_text(r.content)) == 30


@needs_qpdf
def test_compress_tiny_pdf_returned_unchanged_when_not_smaller(client, pdf_normal):
    r = client.post("/api/pdf/compress", files={"file": ("a.pdf", pdf_normal)})
    assert r.status_code == 200 and len(r.content) <= len(pdf_normal)
    assert (r.headers["x-compression"] == "unchanged") == (r.content == pdf_normal)


def test_compress_invalid_level_400(client, pdf_normal):
    r = client.post("/api/pdf/compress", files={"file": ("a.pdf", pdf_normal)}, data={"level": "ultra"})
    assert r.status_code == 400 and "level" in r.json()["detail"]


# ── pesan error tidak membocorkan detail teknis (path /tmp, stderr alat) ──
@needs_qpdf
def test_compress_error_has_no_internal_details(client, pdf_corrupt):
    r = client.post("/api/pdf/compress", files={"file": ("a.pdf", pdf_corrupt)})
    assert r.status_code == 422
    d = r.json()["detail"]
    assert "/tmp" not in d and "cpdf_" not in d and "qpdf" not in d.lower() and "WARNING" not in d


def test_convert_error_has_no_internal_details(client, monkeypatch, caplog):
    import sys

    from pdf import convert

    # Alat gagal dengan stderr berisi path internal → user tak boleh melihatnya; log boleh.
    monkeypatch.setattr(
        convert, "_build_convert_cmd",
        lambda prof, inp: [sys.executable, "-c", "import sys; sys.stderr.write('Error: /tmp/cpdf_x_in.docx tidak terbaca'); sys.exit(1)"],
    )
    r = client.post("/api/pdf/convert", files={"file": ("a.docx", b"x", "application/octet-stream")})
    assert r.status_code == 422
    d = r.json()["detail"]
    assert "/tmp" not in d and "cpdf_" not in d and "Error" not in d
    assert any("/tmp/cpdf_x_in.docx" in rec.getMessage() for rec in caplog.records)  # detail teknis ada di log
