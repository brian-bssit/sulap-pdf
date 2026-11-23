"""Integrasi PDF Tools v2 gelombang B (split, unlock, protect, scrub, watermark, nomor halaman)."""

import io
import logging
import zipfile

import pikepdf
import pytest
from pypdf import PdfReader

from tests.integration.test_tools import last_audit, pages_text
from tools import make_fixtures as mk


def post(client, path, data, name="a.pdf", **form):
    return client.post(f"/api/pdf/{path}", files={"file": (name, data)}, data=form)


# ── split ──
def test_split_ranges(client, pdf_200, audit_rows):
    pdf = mk.pdf_normal(5)
    r = post(client, "split", pdf, mode="ranges", ranges="1-2,5")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert pages_text(r.content) == ["Halaman 1", "Halaman 2", "Halaman 5"]
    assert (last_audit(audit_rows)["action"], last_audit(audit_rows)["status"]) == ("SPLIT", "SUCCESS")


def test_split_every_n_zip(client):
    r = post(client, "split", mk.pdf_normal(5), name="laporan.pdf", mode="every_n", every_n="2")
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    assert zf.namelist() == ["laporan_bagian01.pdf", "laporan_bagian02.pdf", "laporan_bagian03.pdf"]
    assert [len(PdfReader(io.BytesIO(zf.read(n))).pages) for n in zf.namelist()] == [2, 2, 1]


@pytest.mark.parametrize("form", [
    {"mode": "ranges", "ranges": ""}, {"mode": "ranges", "ranges": "9"}, {"mode": "ranges", "ranges": "x"},
    {"mode": "every_n", "every_n": "0"}, {"mode": "bogus"},
])
def test_split_bad_params_400(client, form):
    assert post(client, "split", mk.pdf_normal(3), **form).status_code == 400


def test_split_over_200_pages_400(client, pdf_201):
    assert post(client, "split", pdf_201, mode="ranges", ranges="1").status_code == 400


def test_split_corrupt_and_encrypted(client, pdf_corrupt, pdf_encrypted):
    assert post(client, "split", pdf_corrupt, mode="ranges", ranges="1").status_code == 422
    assert post(client, "split", pdf_encrypted, mode="ranges", ranges="1").status_code == 422


# ── unlock / protect ──
def test_unlock_ok(client, pdf_encrypted, audit_rows):
    r = post(client, "unlock", pdf_encrypted, password="rahasia")
    assert r.status_code == 200
    assert not PdfReader(io.BytesIO(r.content)).is_encrypted
    assert pages_text(r.content)[0].startswith("Halaman")
    assert last_audit(audit_rows)["action"] == "UNLOCK"


def test_unlock_wrong_password_422(client, pdf_encrypted, audit_rows):
    r = post(client, "unlock", pdf_encrypted, password="salah-banget")
    assert r.status_code == 422 and r.json()["detail"] == "Password salah"
    assert last_audit(audit_rows)["status"] == "FAILED"


def test_protect_roundtrip_and_permissions(client, pdf_normal):
    r = post(client, "protect", pdf_normal, password="rahasia-baru-1", allow_print="false", allow_copy="false")
    assert r.status_code == 200
    reader = PdfReader(io.BytesIO(r.content))
    assert reader.is_encrypted
    with pytest.raises(pikepdf.PasswordError):
        pikepdf.open(io.BytesIO(r.content))
    with pikepdf.open(io.BytesIO(r.content), password="rahasia-baru-1") as p:
        assert p.is_encrypted and p.encryption.R == 6  # AES-256
        assert not p.allow.print_highres and not p.allow.extract
        assert len(p.pages) == 3


def test_protect_short_password_400(client, pdf_normal):
    assert post(client, "protect", pdf_normal, password="pendek").status_code == 400


def test_protect_rejects_already_encrypted(client, pdf_encrypted):
    assert post(client, "protect", pdf_encrypted, password="rahasia-baru-1").status_code == 422


def test_passwords_never_logged_or_audited(client, pdf_encrypted, pdf_normal, audit_rows, caplog):
    caplog.set_level(logging.DEBUG)
    secret = "RAHASIA-unik-98765"
    post(client, "protect", pdf_normal, password=secret)
    post(client, "unlock", pdf_encrypted, password=secret)  # salah → gagal
    assert secret not in caplog.text
    assert secret not in str(audit_rows)


# ── scrub ──
def test_scrub_removes_metadata_and_active_content(client, audit_rows):
    src = io.BytesIO()
    with pikepdf.new() as p:
        p.add_blank_page()
        p.docinfo["/Title"] = "Rahasia"
        p.docinfo["/Author"] = "Budi"
        p.Root["/OpenAction"] = pikepdf.Dictionary(S=pikepdf.Name("/JavaScript"), JS=pikepdf.String("app.alert(1)"))
        with p.open_metadata() as m:
            m["dc:title"] = "Rahasia"
        p.save(src)
    r = post(client, "scrub-metadata", src.getvalue())
    assert r.status_code == 200
    assert set(r.headers["x-scrubbed"].split(",")) == {"Info", "XMP", "OpenAction"}
    with pikepdf.open(io.BytesIO(r.content)) as out:
        assert len(out.docinfo) == 0
        assert "/Metadata" not in out.Root and "/OpenAction" not in out.Root
        assert len(out.pages) == 1
    assert b"Rahasia" not in r.content and b"Budi" not in r.content
    assert last_audit(audit_rows)["action"] == "SCRUB_METADATA"


def test_scrub_keeps_page_text(client, pdf_normal):
    r = post(client, "scrub-metadata", pdf_normal)
    assert r.status_code == 200 and r.headers["x-scrubbed"] == ""
    assert pages_text(r.content) == ["Halaman 1", "Halaman 2", "Halaman 3"]


# ── watermark ──
def test_watermark_all_pages_diagonal(client, audit_rows):
    r = post(client, "watermark", mk.pdf_normal(3), text="RAHASIA", position="diagonal", opacity="0.3")
    assert r.status_code == 200
    texts = pages_text(r.content)
    assert sum("RAHASIA" in t for t in texts) == 3
    assert last_audit(audit_rows)["action"] == "WATERMARK"


def test_watermark_selected_pages_only(client):
    r = post(client, "watermark", mk.pdf_normal(3), text="DRAFT", pages="2")
    t = pages_text(r.content)
    assert ["DRAFT" in x for x in t] == [False, True, False]


def test_watermark_is_inside_page_and_has_opacity(client):
    r = post(client, "watermark", mk.pdf_normal(1), text="RAHASIA", opacity="0.25")
    with pikepdf.open(io.BytesIO(r.content)) as p:
        res = p.pages[0].Resources
        assert any(abs(float(g.ca) - 0.25) < 1e-6 for g in (res.ExtGState[k] for k in res.ExtGState.keys()))
        stream = p.pages[0].Contents.read_bytes().decode("latin-1")
        assert "RAHASIA".encode("cp1252").hex().upper() in stream and " gs " in stream


@pytest.mark.parametrize("form", [
    {"text": ""}, {"text": "x" * 101}, {"text": "A", "opacity": "0"}, {"text": "A", "color": "red"},
    {"text": "A", "font_size": "5"}, {"text": "A", "position": "kiri"}, {"text": "A", "pages": "99"},
])
def test_watermark_bad_params_400(client, form):
    assert post(client, "watermark", mk.pdf_normal(2), **form).status_code == 400


# ── nomor halaman ──
@pytest.mark.parametrize("fmt,start,expected", [
    ("n", 1, ["1", "2", "3"]), ("n_of_total", 1, ["1 / 3", "2 / 3", "3 / 3"]), ("n", 10, ["10", "11", "12"]),
])
def test_page_numbers(client, audit_rows, fmt, start, expected):
    r = post(client, "page-numbers", mk.pdf_normal(3), format=fmt, start_at=str(start), position="bottom-right")
    assert r.status_code == 200
    got = [t.split("\n")[-1] for t in pages_text(r.content)]
    assert got == expected
    assert last_audit(audit_rows)["action"] == "PAGE_NUMBERS"


@pytest.mark.parametrize("position", ["bottom-center", "bottom-left", "bottom-right", "top-center", "top-left", "top-right"])
def test_page_numbers_inside_media_box(client, position):
    r = post(client, "page-numbers", mk.pdf_normal(1), position=position, format="n_of_total")
    assert r.status_code == 200
    with pikepdf.open(io.BytesIO(r.content)) as p:
        box = [float(v) for v in p.pages[0].mediabox]
    xs: list[float] = []

    def visit(text, cm, tm, font, size):
        if text.strip() and "/" in text:
            xs.append(tm[4])

    PdfReader(io.BytesIO(r.content)).pages[0].extract_text(visitor_text=visit)
    assert xs and box[0] <= xs[0] <= box[2] - 10


@pytest.mark.parametrize("form", [{"position": "tengah"}, {"format": "x"}, {"start_at": "0"}, {"font_size": "40"}])
def test_page_numbers_bad_params_400(client, form):
    assert post(client, "page-numbers", mk.pdf_normal(1), **form).status_code == 400


def test_existing_overlay_behavior_unchanged(client):
    """Regresi: op text tanpa rotate/opacity tetap memakai matriks identitas."""
    import json
    ops = [{"page": 1, "type": "text", "text": "Hai", "font": "Helvetica", "font_size": 12, "x": 50, "y": 50, "color": "#000000"}]
    r = client.post("/api/pdf/edit-overlay", files={"file": ("a.pdf", mk.pdf_normal(1))}, data={"operations": json.dumps(ops)})
    assert r.status_code == 200
    with pikepdf.open(io.BytesIO(r.content)) as p:
        assert b"1 0 0 1 50 50 Tm" in p.pages[0].Contents.read_bytes()
