# Edit PDF dengan Overlay Layer — Design

## Architecture & Data Flow

```
Frontend (pdfjs-dist, existing)
  pdf.js render → user click/drag overlay → map display→absolute MediaBox user-space
  (offset CropBox + inverse-rotation di frontend) → POST multipart
                                                         │
                                                         ▼
Backend POST /api/pdf/edit-overlay (FastAPI)
  1. validasi: ukuran ≤30MB, PDF magic, operasi ≤50, page bounds, hex color, font whitelist
  2. tulis /tmp/cpdf_{job}_edit_input.pdf
  3. buka pikepdf; per-page append content stream (font /Resources + ExtGState utk opacity)
  4. scrub_catalog(): hapus /OpenAction, /Names→JS, /AA(catalog), /EmbeddedFiles
  5. tulis /tmp/cpdf_{job}_edit_output.pdf → stream (Content-Disposition, X-* headers)
  6. finally: unlink input/output; log_audit(action="EDIT_OVERLAY")
```

Tidak ada rasterisasi. Base content stream TIDAK diubah — hanya menambah /Contents + resource tambahan per halaman yang kena overlay.

## Components & Interfaces

`backend/pdf/edit_overlay.py`:

```
DEFAULT_FONTS = {"Helvetica","Helvetica-Bold","Times-Roman","Courier", ...}  # Base-14 whitelist
MAX_OVERLAYS = 50, MAX_TEXT_LEN = 2000, MAX_PAGES_EDIT = 200

def scrub_catalog(pdf: pikepdf.Pdf) -> None          # Req 7 — hapus key berbahaya di Root
def _validate_ops(ops) -> list[dict]                  # Req 4 — decode+validasi JSON ops
def _add_text(page, op, author) -> None               # Req 1,5,6 — append teks content stream
def _add_rect(page, op) -> None                       # Req 1 — append rect + ExtGState/opacity
def _apply_overlay(pdf, ops, author_label) -> int     # loop ops, return overlay count
async def edit_overlay(request, file, operations: str = Form(...), db=Depends, user=Depends)
```

Ops normalized: `{"type","page"(1-based),"x","y", ...}`. Backend ubah page→0-based.

## Endpoint

`POST /api/pdf/edit-overlay` — multipart `file` + `operations` (JSON string). Mirip rearrange.py.

Headers respon: `Content-Disposition`, `X-Original-Size`, `X-Edited-Size`, `X-Overlay-Count`.

## Data Models

TIDAK ada perubahan skema (tanpa Alembic, `create_all` tak migrasi tabel existing).
`audit_logs.action` VARCHAR — nilai baru `EDIT_OVERLAY`; tanpa constraint → tanpa migration.

## Resource Dictionary (spike — inti)

Per halaman yang kena overlay, pastikan `/Resources` berisi:
- `/Font /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`
- `/ExtGState /GS1 << /Type /ExtGState /ca 0.5 /CA 0.5 >>` (untuk rectangle opacity)

Append content stream harus MERGE dgn content existing (bukan replace):
- content existing tunggal → ubah ke array `[old, new]`
- konten baru = `BT ... Tf x y Td (text) Tj ET` dibangun via `pikepdf.ContentStream` + `pikepdf.String()` utk escaping.

## Error Handling

| Skenario | Behavior |
|---|---|
| JSON ops malformed | 400 |
| ops > 50 / text > 2000 | 400 |
| page 1-based out-of-bounds | 400 |
| hex color invalid / font non-whitelist | 400 |
| file > 30MB | 413 |
| pikepdf gagal buka / korup | 422 |
| client disconnect | 499 + cleanup |
| proses > 590s | 504 |
| exception tak dikenal | log + audit FAILED + 500 |

## Security

- JWT di semua mutating endpoint (pola existing).
- Catalog scrub (bukan rekursif — limitasi terdokumentasi).
- Overlay teks = identitas author ditambahkan server-side (Req 6). Kontrol evidentiary = audit log, bukan visual.
- Bukan redaction; bukan tanda tangan legal.
