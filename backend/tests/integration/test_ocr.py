"""OCR (D1): tesseract + pypdfium2 asli. Fixture scan = gambar teks dalam PDF (tanpa lapisan teks)."""

import io
import shutil

import pytest
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter

from tests.integration.test_tools import last_audit, pages_text
from tools import make_fixtures as mk

needs_tesseract = pytest.mark.skipif(not shutil.which("tesseract"), reason="tesseract tidak terpasang")


def scan_pdf(*lines: str, pages: int = 1) -> bytes:
    """Halaman A4 150 dpi berisi teks besar sebagai GAMBAR."""
    imgs = []
    for _ in range(pages):
        im = Image.new("RGB", (1240, 1754), "white")
        d = ImageDraw.Draw(im)
        font = ImageFont.load_default(size=90)
        for n, line in enumerate(lines):
            d.text((100, 200 + n * 160), line, fill="black", font=font)
        imgs.append(im)
    buf = io.BytesIO()
    imgs[0].save(buf, "PDF", save_all=True, append_images=imgs[1:], resolution=150)
    return buf.getvalue()


def post(client, data, **form):
    return client.post("/api/pdf/ocr", files={"file": ("scan.pdf", data)}, data=form)


@needs_tesseract
def test_ocr_adds_text_layer(client, audit_rows):
    src = scan_pdf("Laporan Keuangan", "Tahun 2026")
    assert pages_text(src) == [""]  # prasyarat: memang tanpa teks
    r = post(client, src, lang="eng")
    assert r.status_code == 200 and r.headers["x-pages-ocr"] == "1"
    text = pages_text(r.content)[0].lower()
    assert "laporan" in text and "2026" in text
    a = last_audit(audit_rows)
    assert (a["action"], a["status"]) == ("OCR", "SUCCESS")
    # ukuran halaman tetap A4 (595×842) — bukan ukuran piksel
    box = PdfReader(io.BytesIO(r.content)).pages[0].mediabox
    assert abs(float(box.width) - 595) < 3 and abs(float(box.height) - 842) < 3


@needs_tesseract
def test_ocr_skips_pages_with_text(client):
    w = PdfWriter()
    w.append(PdfReader(io.BytesIO(mk.pdf_normal(1, "Sudah bertext"))))
    w.append(PdfReader(io.BytesIO(scan_pdf("Halaman Pindai"))))
    buf = io.BytesIO()
    w.write(buf)
    r = post(client, buf.getvalue(), lang="eng")
    assert r.status_code == 200 and r.headers["x-pages-ocr"] == "1"  # hanya halaman 2
    texts = pages_text(r.content)
    assert "Sudah bertext" in texts[0] and "pindai" in texts[1].lower()


def test_ocr_all_pages_have_text_returns_original(client, pdf_normal):
    r = post(client, pdf_normal, lang="eng")
    if not shutil.which("tesseract"):
        assert r.status_code == 503
        return
    assert r.status_code == 200 and r.headers["x-pages-ocr"] == "0" and r.content == pdf_normal


@pytest.mark.parametrize("lang", ["fra", "eng;rm", "../x"])
def test_ocr_bad_lang_400(client, lang):
    assert post(client, scan_pdf("x"), lang=lang).status_code == 400


def test_ocr_over_50_pages_413(client, pdf_201):
    if not shutil.which("tesseract"):
        pytest.skip("tesseract tidak terpasang")
    r = post(client, mk.pdf_many(51), lang="eng")
    assert r.status_code == 413


def test_ocr_corrupt_and_encrypted_422(client, pdf_corrupt, pdf_encrypted):
    assert post(client, pdf_encrypted, lang="eng").status_code == 422
    if shutil.which("tesseract"):
        assert post(client, pdf_corrupt, lang="eng").status_code == 422


def test_ocr_missing_tesseract_503(client, monkeypatch, audit_rows):
    from pdf import ocr
    monkeypatch.setattr(ocr.shutil, "which", lambda n: None)
    r = post(client, scan_pdf("x"), lang="eng")
    assert r.status_code == 503 and last_audit(audit_rows)["status"] == "FAILED"
