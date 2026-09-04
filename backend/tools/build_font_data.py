#!/usr/bin/env python3
"""Generate pdf/font_data.py from staged TTFs (dev-only, needs fonttools).

Baca tiap font di backend/pdf/fonts, emit metadata + widths[224] WinAnsi
(32..255, cp1252 → cmap → hmtx), dinormalkan ke em 1000 (glyph space simple font).
Dipanggil manual / di CI — output di-commit, runtime TIDAK butuh fonttools.
"""
import argparse
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1] / "pdf"
FONTS_DIR = ROOT / "fonts"
OUT = ROOT / "font_data.py"

# display name (nilai option UI + key whitelist) -> staged file
FONT_FILES = {
    "Lato": "lato.ttf",
    "DejaVu Sans": "dejavu_sans.ttf",
    "DejaVu Serif": "dejavu_serif.ttf",
    "DejaVu Sans Mono": "dejavu_sans_mono.ttf",
}


def _capheight(ft: TTFont) -> int:
    os2 = ft["OS/2"]
    if getattr(os2, "sCapHeight", 0):
        return os2.sCapHeight
    # fallback (DejaVu): y max glyph "H"
    upem = ft["head"].unitsPerEm
    cmap = ft.getBestCmap()
    gname = cmap.get(ord("H"), ".notdef")
    pen = BoundsPen(ft.getGlyphSet())
    ft.getGlyphSet()[gname].draw(pen)
    return int(round(pen.bounds[3])) if pen.bounds else int(round(ft["hhea"].ascent))


def _metrics(ft: TTFont) -> dict:
    upem = ft["head"].unitsPerEm
    os2 = ft["OS/2"]
    use_typo = bool(os2.fsSelection & 0x80)
    asc = os2.sTypoAscender if use_typo else ft["hhea"].ascent
    dsc = os2.sTypoDescender if use_typo else ft["hhea"].descent
    head = ft["head"]
    bbox = [head.xMin, head.yMin, head.xMax, head.yMax]
    return {
        "ps": ft["name"].getDebugName(6),
        "ascent": int(round(asc * 1000 / upem)),
        "descent": int(round(dsc * 1000 / upem)),
        "capheight": int(round(_capheight(ft) * 1000 / upem)),
        "bbox": [int(round(v * 1000 / upem)) for v in bbox],
        "italic": round(ft["post"].italicAngle),
        "flags": (1 if ft["post"].isFixedPitch else 0) | 32,  # FixedPitch | Nonsymbolic
        "stemv": 80,
    }


def _widths(ft: TTFont) -> list[int]:
    upem = ft["head"].unitsPerEm
    cmap = ft.getBestCmap()
    hmtx = ft["hmtx"]
    notdef = hmtx[".notdef"][0]
    out = []
    for code in range(32, 256):
        try:
            ch = bytes([code]).decode("cp1252")  # WinAnsi = cp1252
        except UnicodeDecodeError:
            ch = None  # byte tak terdefinisi (0x81,0x8D,...)
        glyph = cmap.get(ord(ch), ".notdef") if ch else ".notdef"
        adv = hmtx[glyph][0]
        out.append(int(round(adv * 1000 / upem)) if glyph != ".notdef" else int(round(notdef * 1000 / upem)))
    assert len(out) == 224, len(out)
    return out


def build() -> dict:
    data = {}
    for name, fname in FONT_FILES.items():
        path = FONTS_DIR / fname
        if not path.exists():
            raise FileNotFoundError(f"aset font hilang: {path}")
        ft = TTFont(str(path))
        meta = _metrics(ft)
        meta["file"] = fname
        meta["widths"] = _widths(ft)
        data[name] = meta
        print(f"  {name:16s} ps={meta['ps']:<16s} asc={meta['ascent']:4d} "
              f"dsc={meta['descent']:4d} cap={meta['capheight']:4d} bbox={meta['bbox']}")
        ft.close()
    return data


def render(data: dict) -> str:
    body = ["# DIGENERATE oleh tools/build_font_data.py — jangan diedit manual.",
            "# fonttools hanya dibutuhkan utk regenerasi (dev).",
            "",
            '"""Metrik font embedded utk Edit PDF (em 1000). Key = nama font UI/whitelist."""',
            "",
            "EMBEDDED_FONTS = {",
    ]
    for name, m in data.items():
        widths = ", ".join(str(w) for w in m["widths"])
        body.append(f'    {name!r}: {{')
        body.append(f"        # {m['ps']}")
        for k in ("file", "ps", "ascent", "descent", "capheight", "bbox", "italic", "flags", "stemv"):
            body.append(f"        {k!r}: {m[k]!r},")
        body.append(f"        'widths': (\n            {widths},\n        ),")
        body.append("    },")
    body.append("}")
    body.append("")
    return "\n".join(body)


def emit(data: dict) -> None:
    OUT.write_text(render(data), encoding="utf-8")
    print(f"→ {OUT} ({OUT.stat().st_size} bytes)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verifikasi file commit sudah sinkron dgn font; exit 1 kalau beda")
    args = ap.parse_args()
    print("Membangun font_data dari:")
    data = build()
    if not args.check:
        emit(data)
        return
    current = OUT.read_text(encoding="utf-8") if OUT.exists() else ""
    if current == render(data):
        print("check OK — font_data.py sinkron")
        return
    print("check GAGAL — font_data.py basi; jalankan tools/build_font_data.py tanpa --check")
    raise SystemExit(1)


if __name__ == "__main__":
    main()
