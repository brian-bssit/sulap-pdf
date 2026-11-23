# SULAP PDF — Requirements

**Source PRD:** `docs/archive/prd-init.md` v2.0
**Status:** Approved → Design

---

## Overview

Web app stateless untuk manipulasi PDF (Merge, Compress, Rearrange) dengan Google OAuth, async UI loading, audit log PostgreSQL + admin dashboard, zero software licensing cost, zero persistent file storage.

## Glossary

| Term | Definition |
|:---|:---|
| Google OAuth | Autentikasi via Google Sign-In, tidak ada password |
| Auto-provisioning | User dibuat otomatis di DB saat pertama login |
| Long-Running Request | HTTP request ditahan sampai proses selesai (bukan async job queue) |
| Stateless | Tidak ada persistent disk/GCS/S3 untuk file user |
| Orphaned File | File `/tmp` yang tertinggal karena container crash sebelum `finally` |

## Requirements

### R1: Google Authentication

- **R1.1** User klik "Sign in with Google" → redirect ke Google Consent Screen
- **R1.2** Callback verifikasi token Google → auto-provision user baru jika `google_sub` belum ada
- **R1.3** Backend terbitkan JWT internal via HTTP-only Secure Cookie (`SameSite=Strict`, `Secure`, `HttpOnly`)
- **R1.4** OAuth flow dilindungi **state parameter** (CSRF protection)
- **R1.5** Returning user dikenali via `google_sub` → update `last_login_at` → JWT baru
- **R1.6** Logout: hapus cookie → redirect ke landing page
- **WHEN** user pertama kali login, **THEN** sistem membuat akun baru dengan data dari Google tanpa intervensi admin

### R2: PDF Merge

- **R2.1** Upload 2–10 file PDF (total ≤ 30 MB)
- **R2.2** Drag-and-drop urutan file sebelum merge
- **R2.3** Proses via `pypdf` (BSD license)
- **R2.4** Hasil di-stream langsung ke browser sebagai download
- **R2.5** File `/tmp` wajib terhapus setelah response selesai

### R3: PDF Compress

- **R3.1** Upload 1 file PDF (≤ 30 MB)
- **R3.2** Pilih level kompresi: Low, Medium, High
- **R3.3** Proses via CLI `qpdf` (Apache 2.0)
- **R3.4** Hasil di-stream ke browser sebagai download
- **R3.5** UI notifikasi ukuran sebelum/sesudah (opsional, disarankan)
- **R3.6** File `/tmp` wajib terhapus setelah response selesai

### R4: PDF Rearrange

- **R4.1** Upload 1 file PDF (≤ 200 halaman)
- **R4.2** Grid thumbnail halaman dengan drag-and-drop reorder
- **R4.3** Hapus halaman (klik ikon sampah)
- **R4.4** Rotasi 90° per halaman (klik ikon panah)
- **R4.5** Proses via `pypdf` (BSD license)
- **R4.6** Hasil di-stream ke browser sebagai download
- **R4.7** File `/tmp` wajib terhapus setelah response selesai

### R5: Async UI & Resource Protection

- **R5.1** Full-screen loading overlay saat proses (spinner + "Sedang memproses dokumen... Mohon jangan tutup halaman ini")
- **R5.2** Overlay mencegah interaksi dengan elemen di belakangnya
- **R5.3** Frontend timeout diset ke 600.000ms (10 menit)
- **R5.4** Jika error/timeout → tampilkan pesan error yang jelas
- **R5.5** Backend mendeteksi client disconnect via `request.is_disconnected()` → abort proses → hapus `/tmp` → audit log `CANCELLED_BY_CLIENT`

### R6: Audit Logging

- **R6.1** Setiap operasi PDF tercatat: user, action, source files, result file, status, duration, IP, user-agent
- **R6.2** Log disimpan di PostgreSQL tabel `audit_logs`
- **R6.3** Status mencakup: `SUCCESS`, `FAILED`, `CANCELLED_BY_CLIENT`

### R7: Admin Audit Dashboard

- **R7.1** Halaman `/admin/audit-logs` — tabel: Timestamp, User Email, Action, Source Files, Result File, Status, Duration, IP Address
- **R7.2** Filter: User, Action, Date Range, Status
- **R7.3** Paginasi: 20 rows per page
- **R7.4** Export CSV berdasarkan filter aktif

### R8: Zero Licensing Cost (Strict)

- **R8.1** Hanya library dengan lisensi MIT, Apache 2.0, BSD, PostgreSQL License
- **R8.2** Stack disetujui: `pypdf` (BSD), `qpdf` (Apache 2.0), `Authlib` (BSD)
- **R8.3** Blacklist: PyMuPDF/fitz (AGPL), Ghostscript (AGPL), iText (AGPL)

### R9: Stateless — No Persistent File Storage

- **R9.1** File diproses di `/tmp`, dihapus setelah response dikirim (`try/finally`)
- **R9.2** Tidak ada GCS/S3/bucket untuk file user
- **R9.3** Cloud Run tidak scale-to-zero selama request aktif
- **R9.4** Background thread membersihkan orphaned files di `/tmp` setiap 5 menit (file > 15 menit)

### R10: Security Hardening

- **R10.1** JWT cookie: `SameSite=Strict`, `Secure`, `HttpOnly`
- **R10.2** Endpoint mutasi (POST/PUT/DELETE) validasi `Origin`/`Referer` header
- **R10.3** Semua endpoint API (kecuali auth & health) wajib JWT valid

## Non-Functional Requirements

| Parameter | Target | Justifikasi |
|:---|:---|:---|
| Cloud Run memory | 4 GB | Mencegah OOM saat parsing PDF 30MB di RAM |
| Cloud Run concurrency | 1 | 1 instance = 1 request berat. Hindari OOM & race condition `/tmp` |
| Cloud Run timeout | 600 detik | Akomodasi file besar |
| Max instances | 10 | Auto-scale out |
| Max file size | 30 MB | — |
| Max pages (rearrange) | 200 | — |
| JWT expiry | 7 hari | — |
| DB backup | Daily (Cloud SQL automated) | — |
| Storage | Ephemeral only (`/tmp`) | Tidak ada persistent storage |

## Out of Scope

1. PDF Compare / Diff (kompleksitas lisensi, beban komputasi)
2. Persistent file storage (GCS, S3)
3. Local password management (full Google OAuth)
4. OCR / text extraction
5. In-PDF text editing
