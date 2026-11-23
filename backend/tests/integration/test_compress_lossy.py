"""Compress lossy (balanced/high): gambar diperkecil + JPEG, level low tetap lossless."""

import io
import os
import zlib

import pikepdf
import pytest

from tests.integration.test_tools import last_audit, needs_qpdf

pytestmark = needs_qpdf

SIDE = 1200  # piksel; ditempatkan 200 pt (≈2,8 inci) → ±430 DPI


def _pdf(color="rgb", *, bits=8, smask=False, place=200) -> bytes:
    n = {"rgb": 3, "gray": 1}[color]
    raw = os.urandom(SIDE * SIDE * n) if bits == 8 else os.urandom(SIDE * SIDE // 8)
    with pikepdf.new() as p:
        page = p.add_blank_page(page_size=(200, 200))
        img = p.make_stream(zlib.compress(raw))
        img.Type, img.Subtype, img.Width, img.Height = pikepdf.Name.XObject, pikepdf.Name.Image, SIDE, SIDE
        img.ColorSpace = pikepdf.Name.DeviceRGB if n == 3 else pikepdf.Name.DeviceGray
        img.BitsPerComponent, img.Filter = bits, pikepdf.Name.FlateDecode
        if bits == 1:
            img.ImageMask = True
        if smask:
            sm = p.make_stream(zlib.compress(bytes([200]) * 64))
            sm.Type, sm.Subtype, sm.Width, sm.Height = pikepdf.Name.XObject, pikepdf.Name.Image, 8, 8
            sm.ColorSpace, sm.BitsPerComponent, sm.Filter = pikepdf.Name.DeviceGray, 8, pikepdf.Name.FlateDecode
            img.SMask = sm
        page.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Im0=img))
        page.Contents = p.make_stream(f"q {place} 0 0 {place} 0 0 cm /Im0 Do Q".encode())
        out = io.BytesIO()
        p.save(out)
    return out.getvalue()


def _post(client, data, level, **form):
    return client.post("/api/pdf/compress", files={"file": ("a.pdf", data)}, data={"level": level, **form})


def _img(content: bytes):
    with pikepdf.open(io.BytesIO(content)) as p:
        im = p.pages[0].Resources.XObject.Im0
        return int(im.Width), int(im.Height), str(im.ColorSpace), str(im.Filter), len(im.read_raw_bytes())


@pytest.mark.parametrize("level,dpi", [("balanced", 150), ("high", 100)])
def test_lossy_downsamples_to_target_dpi(client, audit_rows, level, dpi):
    src = _pdf()
    r = _post(client, src, level)
    assert r.status_code == 200 and r.headers["x-compression"] == "reduced"
    w, h, _, flt, _ = _img(r.content)
    expected = round(200 / 72 * dpi)
    assert abs(w - expected) <= 2 and abs(h - expected) <= 2 and flt == "/DCTDecode"
    assert len(r.content) < len(src) * 0.5
    assert (r.headers["x-images-total"], r.headers["x-images-optimized"]) == ("1", "1")
    assert (last_audit(audit_rows)["action"], last_audit(audit_rows)["status"]) == ("COMPRESS_LOSSY", "SUCCESS")


def test_high_is_smaller_than_balanced(client):
    src = _pdf()
    assert len(_post(client, src, "high").content) < len(_post(client, src, "balanced").content)


def test_low_stays_lossless(client, audit_rows):
    src = _pdf()
    r = _post(client, src, "low")
    assert _img(r.content)[:2] == (SIDE, SIDE) and "x-images-total" not in r.headers
    assert last_audit(audit_rows)["action"] == "COMPRESS"


def test_default_level_is_lossless(client):
    r = client.post("/api/pdf/compress", files={"file": ("a.pdf", _pdf())})
    assert _img(r.content)[:2] == (SIDE, SIDE)


def test_grayscale_option(client):
    r = _post(client, _pdf(), "balanced", grayscale="true")
    assert _img(r.content)[2] == "/DeviceGray"


def test_image_already_small_is_not_touched(client):
    """Gambar ≤ target DPI & bukan Flate-besar yang menguntungkan: tidak dibesarkan, PDF tak lebih besar."""
    src = _pdf(place=700)  # ≈123 DPI < 150
    r = _post(client, src, "balanced")
    assert len(r.content) <= len(src)
    assert _img(r.content)[:2] == (SIDE, SIDE)


def test_bitonal_mask_is_skipped(client):
    src = _pdf("gray", bits=1)
    r = _post(client, src, "high")
    assert r.status_code == 200 and _img(r.content)[:2] == (SIDE, SIDE) and r.headers["x-images-optimized"] == "0"


def test_smask_kept(client):
    r = _post(client, _pdf(smask=True), "balanced")
    with pikepdf.open(io.BytesIO(r.content)) as p:
        assert "/SMask" in p.pages[0].Resources.XObject.Im0


def test_no_images_pdf_ok(client, pdf_normal):
    r = _post(client, pdf_normal, "high")
    assert r.status_code == 200 and r.headers["x-images-total"] == "0"


def test_lossy_corrupt_422(client, pdf_corrupt, audit_rows):
    r = _post(client, pdf_corrupt, "high")
    assert r.status_code == 422 and "/tmp" not in r.text
    a = last_audit(audit_rows)
    assert (a["action"], a["status"]) == ("COMPRESS_LOSSY", "FAILED")
