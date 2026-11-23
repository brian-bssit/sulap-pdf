"""PDF Tools v2 gelombang C: gambar → PDF, PDF → Word."""

import io
import shutil
import zipfile

import pikepdf
import pytest
from PIL import Image
from pypdf import PdfReader

from tests.integration.test_tools import last_audit, needs_soffice, pages_text
from tools import make_fixtures as mk


def img_bytes(fmt="PNG", size=(300, 200), mode="RGB", color="red", exif_orientation=None) -> bytes:
    im = Image.new(mode, size, color)
    buf = io.BytesIO()
    kw = {}
    if exif_orientation:
        ex = Image.Exif()
        ex[0x0112] = exif_orientation
        kw["exif"] = ex
    im.save(buf, fmt, **kw)
    return buf.getvalue()


def post_imgs(client, items, **form):
    return client.post("/api/pdf/images-to-pdf", files=[("files", it) for it in items], data=form)


def page_sizes(data: bytes) -> list[tuple[float, float]]:
    return [(float(p.mediabox.width), float(p.mediabox.height)) for p in PdfReader(io.BytesIO(data)).pages]


# ── gambar → PDF ──
def test_images_a4_order_and_audit(client, audit_rows):
    r = post_imgs(client, [("a.png", img_bytes("PNG")), ("b.jpg", img_bytes("JPEG", (200, 300)))])
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    sizes = page_sizes(r.content)
    assert len(sizes) == 2
    # gambar landscape → halaman A4 landscape; potret → potret
    assert sizes[0][0] > sizes[0][1] and sizes[1][0] < sizes[1][1]
    assert all(abs(max(s) - 842) < 2 and abs(min(s) - 595) < 2 for s in sizes)
    a = last_audit(audit_rows)
    assert (a["action"], a["status"], a["source_files"]) == ("IMG_TO_PDF", "SUCCESS", ["a.png", "b.jpg"])


def test_images_fit_uses_image_size(client):
    r = post_imgs(client, [("a.png", img_bytes("PNG", (300, 150)))], page_size="fit")
    (w, h), = page_sizes(r.content)
    assert abs(w / h - 2.0) < 0.02


def test_images_exif_orientation_respected(client):
    # 300×200 dengan EXIF 6 (putar 90°) → tampil potret
    r = post_imgs(client, [("p.jpg", img_bytes("JPEG", (300, 200), exif_orientation=6))], page_size="fit")
    (w, h), = page_sizes(r.content)
    assert h > w


def test_images_alpha_flattened_on_white(client):
    r = post_imgs(client, [("t.png", img_bytes("PNG", (50, 50), "RGBA", (0, 0, 0, 0)))], page_size="fit")
    assert r.status_code == 200
    with pikepdf.open(io.BytesIO(r.content)) as p:
        assert len(p.pages) == 1


@pytest.mark.parametrize("item,code", [
    (("x.gif", img_bytes("GIF")), 400),
    (("x.png", b"bukan gambar"), 400),
    (("x.png", b""), 400),
])
def test_images_bad_input_400(client, audit_rows, item, code):
    r = post_imgs(client, [item])
    assert r.status_code == code and last_audit(audit_rows)["status"] == "FAILED"


def test_images_pixel_limit_400(client, monkeypatch):
    from pdf import img2pdf
    monkeypatch.setattr(img2pdf, "MAX_PIXELS_EACH", 10_000)
    assert post_imgs(client, [("big.png", img_bytes("PNG", (200, 200)))]).status_code == 400


def test_images_total_pixel_limit_400(client, monkeypatch):
    from pdf import img2pdf
    monkeypatch.setattr(img2pdf, "MAX_PIXELS_TOTAL", 50_000)
    two = [("a.png", img_bytes("PNG", (200, 200))), ("b.png", img_bytes("PNG", (200, 200)))]
    assert post_imgs(client, two).status_code == 400


def test_images_count_and_params_400(client):
    assert post_imgs(client, [(f"{i}.png", img_bytes()) for i in range(21)]).status_code == 400
    assert post_imgs(client, [("a.png", img_bytes())], page_size="letter").status_code == 400


# ── PDF → Word ──
@needs_soffice
def test_to_word_ok(client, audit_rows):
    r = client.post("/api/pdf/to-word", files={"file": ("laporan.pdf", mk.pdf_normal(2, "Laporan keuangan"))})
    assert r.status_code == 200
    assert r.headers["content-disposition"].startswith('attachment; filename="laporan.docx"')
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    assert "Laporan keuangan 1" in zf.read("word/document.xml").decode("utf-8")
    assert (last_audit(audit_rows)["action"], last_audit(audit_rows)["status"]) == ("PDF_TO_WORD", "SUCCESS")


@needs_soffice
def test_to_word_corrupt_and_encrypted_422(client, pdf_corrupt, pdf_encrypted, audit_rows):
    for body in (pdf_corrupt, pdf_encrypted):
        assert client.post("/api/pdf/to-word", files={"file": ("a.pdf", body)}).status_code == 422
    assert last_audit(audit_rows)["status"] == "FAILED"


def test_to_word_not_pdf_400(client):
    assert client.post("/api/pdf/to-word", files={"file": ("a.pdf", b"bukan pdf")}).status_code == 400


def test_to_word_cmd_single_env_token():
    """Regresi: `-env:UserInstallation=...` harus SATU token (lihat convert.py)."""
    from pathlib import Path
    from pdf.to_word import _build_cmd
    cmd = _build_cmd(Path("/tmp/p"), Path("/tmp/x/input.pdf"))
    assert "-env:UserInstallation=file:///tmp/p" in cmd
    assert "--infilter=writer_pdf_import" in cmd and "docx:MS Word 2007 XML" in cmd
