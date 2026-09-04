# Font Tambahan — Design

## Architecture & Data Flow
```
[dev] fetch.sh → backend/pdf/fonts/*.ttf (+ OFL.txt)        # di-commit
[dev] tools/build_font_data.py (fonttools, dev-only) → pdf/font_data.py
      # dict per font: postscript_name, ascent, descent, capheight,
      #   font_bbox, italic_angle, flags, stemv, widths[224] (WinAnsi 32..255)

runtime edit_overlay.py:
  op {font: "Lato"} → whitelist cocok → _ensure_embedded_font(page/pdf, name)
    → FontDescriptor indirect (+FontFile2 = bytes ttf, make_indirect) dibuat SEKALI per doc,
      /Font entry {/Type /Font, /Subtype /TrueType, /BaseFont /Lato,
                   /FirstChar 32 /LastChar 255, /Widths[224], /Encoding /WinAnsiEncoding,
                   /FontDescriptor ref}
    → content: BT /F6 24 Tf ... <hex> Tj ET
```
Embedded font memakai `_latin1_hex` yang sama (karakter non-Latin-1 → `?`).

## Components & Interfaces
```python
# pdf/font_data.py  (DIGENERATE — jangan diedit manual)
EMBEDDED_FONTS: dict[str, dict]  # key = nama font (nilai option UI + backend)
# { "Lato": {"ps": "/Lato", "file": "lato.ttf", "ascent":..,"descent":..,
#            "capheight":..,"bbox":[...],"italic":0,"flags":32,"stemv":..,
#            "widths": [224 ints]}, ... }

# pdf/edit_overlay.py
EMBED_FONTS = {name: EMBEDDED_FONTS[name] for name in EMBEDDED_FONTS}   # alias sumber data
ALL_FONTS = set(BASE14_FONTS) | set(EMBEDDED_FONTS)                      # whitelist validasi

def _ensure_embedded_font(pdf, page_res, name) -> str:
    # slot unik per (page? no — shared object via pdf), kembalikan /Fx
    # reuses pdf-level cache dict font_refs[name] → FontDescriptor indirect
```
`_ensure_font(res, base_font)` tetap untuk Base-14 (tak berubah). Alur `_apply_overlay`:
- otype text/stamp: `if font in BASE14_FONTS: slot=_ensure_font(...)  else: slot=_ensure_embedded_font(pdf,page,name)`.

## FontDescriptor (per font, sekali per dokumen, indirect)
```
/FontName /Lato  /Flags 32  /FontBBox [..]  /ItalicAngle 0  /Ascent ..  /Descent ..
/CapHeight ..  /StemV ..  /FontFile2 <stream ttf>
```
`pdf.make_indirect(pikepdf.Stream(pdf, ttf_bytes))` → dipakai ulang antar halaman [Req 5].

## Error Handling
| Kasus | Perilaku |
|---|---|
| ttf aset hilang saat runtime | log error, 500 "Font tidak tersedia" |
| font non-whitelist | 400 (validasi existing, whitelist diperluas) |
| nama ttf tak cocok font_data | 500 saat build/import (gagal cepat) |
| input >30MB | 413 (existing) |
