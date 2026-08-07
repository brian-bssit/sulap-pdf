# Convert to PDF — Requirements

**Status:** Draft → Review

---

## Overview

Fitur baru: konversi dokumen (format apapun) ke PDF. Backend pakai LibreOffice headless, frontend upload + download.

## Glossary

| Term | Definition |
|:---|:---|
| LibreOffice Headless | LibreOffice CLI mode tanpa GUI, dipanggil via `subprocess` |
| Source Document | File input user: DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, ODS, ODP, RTF, TXT, HTML, CSV |

## Requirements

### R1: Convert Any Document to PDF

- **R1.1** User upload 1 file dokumen (≤ 30 MB)
- **R1.2** Format yang didukung: DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, ODS, ODP, RTF, TXT, HTML, CSV, XML, dan format lain yang didukung LibreOffice
- **R1.3** Backend deteksi format file via magic bytes + ekstensi, tolak jika bukan dokumen yang dikenal
- **R1.4** Konversi via LibreOffice headless (`libreoffice --headless --convert-to pdf`)
- **R1.5** Hasil di-stream ke browser sebagai attachment download
- **R1.6** File `/tmp` wajib terhapus setelah response selesai (`try/finally`)
- **WHEN** user upload file DOCX 5MB, **THEN** sistem convert ke PDF dan return sebagai download

### R2: Frontend UI

- **R2.1** Tab baru "Convert to PDF" di sidebar dashboard
- **R2.2** Upload area: drag-and-drop + file picker, accept banyak format
- **R2.3** Tampilkan nama file + ukuran setelah dipilih
- **R2.4** Tombol "Convert & Download"
- **R2.5** Loading overlay saat proses
- **R2.6** Error handling: tampilkan pesan error yang jelas
- **R2.7** Notifikasi sukses setelah download

### R3: Audit & Security

- **R3.1** Audit log: user, action="CONVERT", source file, result file, status, duration
- **R3.2** Endpoint dilindungi JWT (pakai `get_current_user`)
- **R3.3** Validasi Origin/Referer header (middleware existing)
- **R3.4** Client disconnect → abort proses → hapus `/tmp` → audit log `CANCELLED_BY_CLIENT`

### R4: Zero Licensing Cost

- **R4.1** LibreOffice = MPL 2.0 (compatible, setara Apache/BSD dalam hal kebebasan penggunaan)
- **R4.2** Tidak ada dependensi AGPL/GPL copyleft

## Non-Functional

| Parameter | Target | Justifikasi |
|:---|:---|:---|
| Max file size | 30 MB | Sama dengan fitur existing |
| Timeout | 600 detik | LibreOffice bisa lambat untuk file besar |
| Docker image size | +~200MB | LibreOffice-core cukup besar |

## Out of Scope

1. Batch conversion (multiple files)
2. OCR / text extraction dari hasil konversi
3. Custom conversion options (page range, DPI, etc.)
