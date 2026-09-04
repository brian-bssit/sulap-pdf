# Edit PDF dengan Overlay Layer — Tasks (Phase 1: Backend)

Source of truth dari requirements.md. Setiap task taut ke Req.

## Backend core

- [x] 1. Tambah `pikepdf==8.*` ke `backend/requirements.txt` + install `.venv` [Req 1]
- [x] 2. `backend/pdf/edit_overlay.py`: `_apply_overlay` append content stream flatten-ke-1-stream (font Base-14 `/Resources/Font`, ExtGState opacity) [Req 1, Req 5]
- [x] 3. `scrub_catalog()` — hapus `/OpenAction`, `/Names`→JavaScript, `/EmbeddedFiles`, `/AA` di Root [Req 7]
- [x] 4. Validasi ops: ≤50, text ≤2000, hex-color regex, font whitelist Base-14, page 1-based→0-based, file ≤30MB, PDF magic [Req 2,3,4]
- [x] 5. `_validate_bounds` anchor-point clamp (mediabox) [Req 2]
- [x] 6. Identitas `stamp` server-side: `{text} · {display_name} · {ISO ts}` [Req 6]
- [x] 7. Endpoint `POST /api/pdf/edit-overlay` + Stream + headers + log_audit(action="EDIT_OVERLAY") + `finally` cleanup `/tmp` + `settings.max_pages_edit` [Req 8,9]
- [x] 8. Wire `include_router(edit_overlay.router, prefix="/pdf")` di `backend/router.py` [Req 9]

## Checkpoint — tests pass

- [x] 9. Scaffold `backend/tests/test_edit_overlay.py` + `backend/requirements-dev.txt` (pytest dev-only) [Req 5]
  - [x] Case: `_latin1_hex` escape `(`,`)`,`\`,`#`
  - [x] Case: overlay teks → output valid PDF, base `BASE_ORIGINAL` + overlay tetap searchable
  - [x] Case: stamp → author+timestamp ikut
  - [x] Case: rectangle → struktur valid
  - [x] Case: page out-of-bounds → 400; hex invalid → 400; >50 ops → 400; font non-whitelist → 400
  - [x] Case: bounds anchor out-of-page → 400
  - [x] Case: PDF dengan JS catalog → scrub_catalog bersih
- [x] 10. `pytest` — **11 passed**; py_compile + router-import smoke — bersih [Req 5]

## Checkpoint - Ensure tests pass

> Semua task backend selesai & test hijau sebelum frontend (Phase 2) dimulai.

# Phase 2: Frontend

- [x] 11. `frontend/src/components/EditOverlayTool.tsx` — viewer pdfjs (canvas + overlay layer), page nav, tool Teks/Highlight/Stempel + preset stempel, font Base-14, ukuran, warna, transparansi [Req 1,2]
- [x] 12. Koordinat: klik/drag CSS → `viewport.convertToPdfPoint` (frame MediaBox absolut, handle `/Rotate`); simpan ops pdf-space; clamp rectangle ke kotak terlihat [Req 2]
- [x] 13. Submit `POST /api/pdf/edit-overlay` (FormData `file` + `operations` JSON), unduh via blob, header `X-Overlay-Count`, banner peringatan [Req 8]
- [x] 14. Wire tab "Edit PDF" di `frontend/src/app/dashboard/page.tsx` (Tab union, navItems, pageTitles, DashboardContent) [Req 9]
- [x] 15. Checkpoint: `npx tsc --noEmit` + `npm run build` — hijau [Req 9]
