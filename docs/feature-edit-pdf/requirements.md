# Edit PDF dengan Overlay Layer — Requirements

## Overview

Stempel/annotasi/watermark di atas PDF existing secara **backend, non-rasterisasi** (teks asli tetap selectable/searchable). Pengganti Acrobat/online-tool untuk reviewer internal. Arsitektur stateless sama seperti fitur PDF lain: upload → proses di `/tmp` → stream → cleanup → audit.

## Glossary

- **Overlay** — teks/rectangle yang digambar DI ATAS konten halaman existing via append content stream.
- **User-space** — sistem koordinat PDF (origin bottom-left, unit point). Kontrak: **absolute MediaBox frame**.
- **Base-14 fonts** — Helvetica/Times/Courier, dijamin viewer tanpa embedding (PDF Ref 1.7 §5.5.1).
- **Catalog scrub** — hapus key berbahaya di root PDF catalog (bukan rekursif).

## Business Context (Rung-1)

Kebutuhan Tim **Credit & Risk Analysis** + **Legal/Compliance**: reviewer stempel "APPROVED/REVIEWED" + catatan singkat di kontrak/kredit sebelum dikirim ke core banking. Saat ini pakai Acrobat (lisensi) / tool online (risiko leakage). Fitur ini: in-house, tanpa lisensi tambahan, audit trail.

**Batasan (anti-salah-guna):**
- BUKAN secure redaction — rectangle tidak menghapus teks.
- BUKAN tanda tangan legal — identitas diikat via audit log + stempel author/timestamp.

## Requirements

### Req 1 — Backend overlay teks + rectangle
- **WHEN** user POST file PDF + operasi overlay (type `text`/`rectangle`)
- **THEN** server stream PDF hasil dengan konten asli utuh, overlay di atasnya, vektor & form field terjaga.
- AC: teks hasil tetap selectable/searchable (no rasterisasi); form field tetap interaktif; per-page content stream di-append tanpa menyentuh objek existing.

### Req 2 — Kontrak koordinat (single source of truth = frontend)
- **WHEN** frontend kirim `x,y` **absolute user-space (MediaBox frame)**, sudah termasuk offset CropBox + inverse-rotation
- **THEN** backend gambar verbatim, tanpa kalkulasi geometri offset/rotasi.
- AC: backend validasi bounds = anchor point saja `0<=x<=W, 0<=y<=H` (baca `page.mediabox`). Overflow teks/rect kanan-bawah DITERIMA (tanpa font-metrics di MVP).

### Req 3 — Page index
- **WHEN** frontend kirim `page` (1-based, sesuai UI)
- **THEN** backend konversi `idx = page - 1`, validasi `0<=idx<total`.
- AC: out-of-bounds → `400`. Hindari `IndexError`/500.

### Req 4 — Validasi input keras
- **WHEN** input tiba
- **THEN** backend tolak input tak valid sebelum proses.
- AC: max 50 operasi/request → `400`; warna hanya hex `#RGB|#RRGGBB` → `400`; font hanya whitelist Base-14 → `400`; file ≤30MB → `413`; PDF korup → `422`; text ≤2000 char.

### Req 5 — String escaping
- **WHEN** teks user mengandung `(`, `)`, `\`
- **THEN** tidak merusak content stream.
- AC: semua teks dibungkus `pikepdf.String(...)`; unit test kasus `DRAFT(1)`, backslash.

### Req 6 — Identitas stempel (evidentiary)
- **WHEN** ops type `stamp` (atau `text` tanpa identitas)
- **THEN** backend menambahkan identitas author + timestamp server-side.
- AC: teks akhir = `{user_text} · {display_name} · {UTC timestamp}`.

### Req 7 — Sanitasi catalog (scope jujur)
- **WHEN** output dihasilkan dari PDF input yang mungkin mengandung JS
- **THEN** hapus `/OpenAction`, `/Names→JavaScript`, `/AA` (catalog), `/EmbeddedFiles`.
- AC: **catalog-level only**; dokumentasikan limitasi (page/annotation-level actions TIDAK di-scrub).

### Req 8 — Audit + lifecycle
- **WHEN** request selesai (sukses/gagal/disconnect)
- **THEN** `log_audit(action="EDIT_OVERLAY", ...)`; file `/tmp` dihapus di `finally`.
- AC: audit success pakai kolom existing (error_message HANYA untuk FAILED); pola status 499/504 konsisten sibling.

### Req 9 — Error parity
- **WHEN** kegagalan
- **THEN** status code konsisten endpoint lain.
- AC: `400` invalid, `401` JWT, `413` >30MB, `422` proses gagal, `499` disconnect, `504` timeout (600s).
