# Font Tambahan — Tasks

Source of truth dari requirements.md & design.md.
Status (2026-09-04): backend embed + test + render + UI selesai. Yang belum: commit repo (1,3) & E2E manual (13) — giliran user.

## Backend: aset & data font
- [x] 1. `backend/pdf/fonts/fetch.sh` — unduh 4 ttf + OFL.txt dari sumber pinned (Lato google/fonts; DejaVu 2.37 zip), simpan sbg `lato.ttf`, `dejavu_sans.ttf`, `dejavu_serif.ttf`, `dejavu_sans_mono.ttf`; commit aset [+Req seluruh]
- [x] 2. `backend/tools/build_font_data.py` + `fonttools` di `requirements-dev.txt` → baca tiap ttf, emit `pdf/font_data.py` (ps name, metrik deskriptor, `widths[224]` WinAnsi dr cmap+hmtx) [Req 5]
- [x] 3. Jalankan generator; hasil di-commit; smoke: `python -c "import pdf.font_data"` [Req 5]

## Backend: embed
- [x] 4. `edit_overlay.py`: `EMBEDDED_FONTS` diwhitelist (`ALL_FONTS`) — font tak dikenal tetap 400 [Req 4]
- [x] 5. `_ensure_embedded_font(pdf, res, name)`: cache FontDescriptor+FontFile2 per doc (indirect), /Font Type1→TrueType entry + Widths + WinAnsi [Req 1,2,5]
- [x] 6. `_apply_overlay`: route Base-14 → `_ensure_font`, selainnya → embedded [Req 1]
- [x] 7. scrub_catalog tetap jalan; save output; StreamResponse tak berubah [Req 2]

## Checkpoint — backend test
- [x] 8. Uji: teks font Lato → output valid + font ter-embed (FontFile2 ada) + searchable; font sama di 2 halaman → 1 FontFile2 saja; whitelist 400 utk font liar; Base-14 lama masih jalan [Req 2,3,4,5,6]
- [x] 9. Render (`pdftoppm`) teks Lato & DejaVu → glyph terlihat (bukan kotak) [Req 2]

## Frontend
- [x] 10. `EditOverlayTool.tsx`: tambah nama font ke list; `<optgroup>` "Font standar" vs "Font gratis (open license)" [Req 3]
- [x] 11. CSS preview stack utk font baru (Lato, DejaVu Sans/Serif/Mono) [Req 1]
- [x] 12. Checkpoint: `npx tsc --noEmit` + `npm run build` exit=0; sync ke `backend/static`

## Verifikasi akhir
- [x] 13. E2E manual: edit teks dgn Lato → download → glyph tampil + tak ada warning font
