"""Unit tests for pdf/edit_overlay.py — no DB / auth needed."""

from pathlib import Path

import pikepdf
import pytest
from fastapi import HTTPException
from pypdf import PdfReader

from pdf.edit_overlay import (
    _apply_overlay, _validate_bounds, _validate_ops, scrub_catalog, _winansi_hex,
    _ensure_embedded_font, EMBEDDED_FONTS,
)

TMP = Path("/tmp/cpdf_test_edit")


def _make_base(path: Path, text: str = "BASE_ORIGINAL", w: int = 400, h: int = 400,
               pages: int = 1) -> Path:
    with pikepdf.Pdf.new() as pdf:
        for _ in range(pages):
            page = pdf.add_blank_page(page_size=(w, h))
            res = pikepdf.Dictionary()
            res["/Font"] = pikepdf.Dictionary(
                F1=pikepdf.Dictionary(Type="/Font", Subtype="/Type1", BaseFont="Helvetica")
            )
            page.obj["/Resources"] = res
            content = f"BT /F1 12 Tf 1 0 0 1 20 {h - 20} Tm ({text}) Tj ET".encode()
            page.obj["/Contents"] = pikepdf.Stream(pdf, content)
        pdf.save(path)
    return path


def _fontfile2_objs(pdf: pikepdf.Pdf) -> set:
    """set objgen tiap objek FontFile2 yang dipakai dr page /Resources /Font.
    pikepdf 9 me-resolve referensi → cukup stream (objgen unik per objek)."""
    seen: set = set()
    for page in pdf.pages:
        res = page.obj.get("/Resources")
        if not res:
            continue
        fonts = res.get("/Font")
        if not fonts:
            continue
        for _slot, f in fonts.items():
            fd = f.get("/FontDescriptor")
            if fd is None:
                continue
            ff2 = fd.get("/FontFile2")
            if isinstance(ff2, pikepdf.Stream):
                seen.add(ff2.objgen)
    return seen


def _extract(path: Path) -> str:
    return "".join((p.extract_text() or "") for p in PdfReader(str(path)).pages)


@pytest.fixture
def base(tmp_path):
    return _make_base(tmp_path / "base.pdf")


def test_winansi_hex_escapes_special_chars():
    # ( ) \ # must survive via hex encoding
    out = _winansi_hex("DRAFT(1)\\ok #note")
    assert out == "DRAFT(1)\\ok #note".encode("cp1252").hex().upper()


def test_winansi_hex_preserves_cp1252_punctuation():
    # WinAnsi = cp1252, BUKAN latin-1: di latin-1 karakter ini adalah kontrol
    # tak tercetak (0x80-0x9F) → dulu jadi '?'. Harus tetap utuh di encoding font.
    s = "“kutip” — em-dash • €"
    assert _winansi_hex(s) == s.encode("cp1252").hex().upper()
    # '€' (U+20AC → 0x80) hanya ada di cp1252 — cek eksplisit jangan jadi 0x3F '?'
    assert _winansi_hex("€") == "80"
    assert _winansi_hex("€") != _winansi_hex("?")


def test_overlay_text_preserves_base_and_is_searchable(base):
    out = base.parent / "out.pdf"
    with pikepdf.open(str(base)) as pdf:
        n = _apply_overlay(
            pdf,
            [
                {"type": "text", "page": 0, "x": 50.0, "y": 200.0, "text": "DRAFT(1)\\x", "color": "#FF0000",
                 "font": "Helvetica-Bold", "font_size": 24}
            ],
            "A. Budi · 2026-09-03 10:00 UTC",
        )
        assert n == 1
        pdf.save(str(out))

    txt = _extract(out)
    assert "BASE_ORIGINAL" in txt  # base text untouched & searchable
    assert "DRAFT(1)" in txt  # overlay searchable, escaping correct
    assert "A. Budi" not in txt  # author only on 'stamp', never plain text


def test_stamp_appends_author(base):
    out = base.parent / "stamp.pdf"
    with pikepdf.open(str(base)) as pdf:
        _apply_overlay(pdf, [{"type": "stamp", "page": 0, "x": 10.0, "y": 10.0, "text": "APPROVED", "color": "#0000FF",
                              "font_size": 20}], "A. Budi · 2026-09-03 10:00 UTC")
        pdf.save(str(out))
    txt = _extract(out)
    assert "APPROVED" in txt
    assert "A. Budi · 2026-09-03" in txt  # identity stamped server-side


def test_rectangle_overlay(base):
    out = base.parent / "rect.pdf"
    with pikepdf.open(str(base)) as pdf:
        n = _apply_overlay(pdf, [{"type": "rectangle", "page": 0, "x": 10.0, "y": 10.0, "width": 50.0, "height": 30.0,
                                  "color": "#FFFF00", "opacity": 0.5}], "x")
        assert n == 1
        pdf.save(str(out))
    assert _extract(out)  # still readable, structure valid


def test_validate_ops_page_out_of_bounds(base):
    with pytest.raises(HTTPException) as ei:
        _validate_ops('[{"type":"text","page":99,"x":1,"y":1,"text":"x"}]', total_pages=1)
    assert ei.value.status_code == 400


def test_validate_ops_bad_hex(base):
    with pytest.raises(HTTPException) as ei:
        _validate_ops('[{"type":"text","page":1,"x":1,"y":1,"text":"x","color":"red"}]', total_pages=1)
    assert ei.value.status_code == 400


def test_validate_ops_too_many(base):
    ops = "[" + ",".join(
        '{"type":"text","page":1,"x":1,"y":1,"text":"x"}' for _ in range(51)
    ) + "]"
    with pytest.raises(HTTPException) as ei:
        _validate_ops(ops, total_pages=1)
    assert ei.value.status_code == 400
    assert "50" in ei.value.detail


def test_validate_ops_bad_font(base):
    with pytest.raises(HTTPException) as ei:
        _validate_ops('[{"type":"text","page":1,"x":1,"y":1,"text":"x","font":"Wingdings"}]', total_pages=1)
    assert ei.value.status_code == 400


def test_validate_ops_returns_0based(base):
    ops = _validate_ops('[{"type":"text","page":1,"x":1,"y":1,"text":"x"}]', total_pages=3)
    assert ops[0]["page"] == 0


def test_validate_bounds_anchor(base):
    with pikepdf.open(str(base)) as pdf:  # 400x400 page
        _validate_bounds(pdf, [{"type": "text", "page": 0, "x": 399.9, "y": 0.0}])  # ok
        with pytest.raises(HTTPException) as ei:
            _validate_bounds(pdf, [{"type": "text", "page": 0, "x": 400.5, "y": 10.0}])
        assert ei.value.status_code == 400


def test_embedded_font_embed_single_page_searchable(tmp_path):
    base = _make_base(tmp_path / "base.pdf", pages=1)
    out = tmp_path / "out.pdf"
    with pikepdf.open(str(base)) as pdf:
        n = _apply_overlay(pdf, [{"type": "text", "page": 0, "x": 50.0, "y": 50.0,
                                  "text": "TEKS_LATO", "font": "Lato", "font_size": 24, "color": "#000000"}], "x")
        assert n == 1
        pdf.save(str(out))

    txt = _extract(out)
    assert "TEKS_LATO" in txt  # Req 6: searchable/extractable

    with pikepdf.open(str(out)) as pdf:
        fonts = pdf.pages[0].obj["/Resources"]["/Font"]
        f = fonts["/F2"]
        assert f["/Subtype"] == pikepdf.Name("/TrueType")
        assert f["/BaseFont"] == pikepdf.Name("/Lato-Regular")
        assert f["/FirstChar"] == 32 and f["/LastChar"] == 255
        assert len(f["/Widths"]) == 224
        assert f["/Encoding"] == pikepdf.Name("/WinAnsiEncoding")
        fd = f["/FontDescriptor"]
        assert fd["/FontFile2"].read_bytes().startswith(b"\x00\x01\x00\x00")  # ttf sfnt
        # Widths & bbox dalam em 1000 (glyph space simple font)
        assert fd["/Ascent"] == EMBEDDED_FONTS["Lato"]["ascent"]
        assert f["/Widths"][65 - 32] == EMBEDDED_FONTS["Lato"]["widths"][65 - 32]  # 'A'


def test_embedded_font_dedup_across_pages(tmp_path):
    base = _make_base(tmp_path / "base2.pdf", pages=2)
    out = tmp_path / "out2.pdf"
    with pikepdf.open(str(base)) as pdf:
        _apply_overlay(pdf, [
            {"type": "text", "page": 0, "x": 10.0, "y": 10.0, "text": "DEJAVU_SANS_A", "font": "DejaVu Sans", "font_size": 18, "color": "#000000"},
            {"type": "text", "page": 1, "x": 10.0, "y": 10.0, "text": "DEJAVU_SANS_B", "font": "DejaVu Sans", "font_size": 18, "color": "#000000"},
        ], "x")
        pdf.save(str(out))
        with pikepdf.open(str(out)) as pdf2:  # re-open: hit disk (xref) agar hitungan sahih
            assert len(_fontfile2_objs(pdf2)) == 1  # Req 5: satu embed utk 2 halaman


def test_embedded_two_fonts_two_files(tmp_path):
    base = _make_base(tmp_path / "base3.pdf", pages=1)
    out = tmp_path / "out3.pdf"
    with pikepdf.open(str(base)) as pdf:
        _apply_overlay(pdf, [
            {"type": "text", "page": 0, "x": 10.0, "y": 10.0, "text": "LATO", "font": "Lato", "font_size": 18, "color": "#000000"},
            {"type": "text", "page": 0, "x": 10.0, "y": 60.0, "text": "SERIF", "font": "DejaVu Serif", "font_size": 18, "color": "#000000"},
        ], "x")
        pdf.save(str(out))
    with pikepdf.open(str(out)) as pdf:
        assert len(_fontfile2_objs(pdf)) == 2


def test_validate_ops_rejects_unknown_font(base):
    for bad in ("Wingdings", "Comic Sans MS", "lato"):  # case-sensitive whitelist
        with pytest.raises(HTTPException) as ei:
            _validate_ops(f'[{{"type":"text","page":1,"x":1,"y":1,"text":"x","font":"{bad}"}}]', total_pages=1)
        assert ei.value.status_code == 400


def test_embedded_font_reused_within_page(tmp_path):
    """Dua op font sama di 1 halaman → satu slot /Font, satu FontFile2."""
    base = _make_base(tmp_path / "base4.pdf", pages=1)
    out = tmp_path / "out4.pdf"
    with pikepdf.open(str(base)) as pdf:
        _apply_overlay(pdf, [
            {"type": "text", "page": 0, "x": 10.0, "y": 10.0, "text": "AA", "font": "Lato", "font_size": 18, "color": "#000000"},
            {"type": "text", "page": 0, "x": 10.0, "y": 60.0, "text": "BB", "font": "Lato", "font_size": 18, "color": "#000000"},
        ], "x")
        pdf.save(str(out))
    with pikepdf.open(str(out)) as pdf:
        fonts = pdf.pages[0].obj["/Resources"]["/Font"]
        lato = [s for s, f in fonts.items() if str(f.get("/BaseFont")) == "/Lato-Regular"]
        assert len(lato) == 1
        assert len(_fontfile2_objs(pdf)) == 1


def test_scrub_catalog_removes_js(base):
    with pikepdf.open(str(base)) as pdf:
        root = pdf.Root
        root["/OpenAction"] = pikepdf.String("javascript:evil()")
        root["/Names"] = pikepdf.Dictionary(
            JavaScript=pikepdf.Dictionary(Names=pikepdf.Array(["X", pikepdf.String("evil")])),
            EmbeddedFiles=pikepdf.Dictionary(Names=pikepdf.Array()),
        )
        scrub_catalog(pdf)
        assert "/OpenAction" not in root
        # /Names may be dropped entirely once empty
        names = root.get("/Names")
        if names is not None:
            assert "/JavaScript" not in names
            assert "/EmbeddedFiles" not in names
