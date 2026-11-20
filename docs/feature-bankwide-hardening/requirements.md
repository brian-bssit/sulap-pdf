# Requirements — Bankwide Hardening (P0 + P1)

## Overview
Bawa SULAP dari tool tim kecil ke layanan bankwide: akses terbatas karyawan, pipeline aman, beban terkendali, jejak audit layak periksa. Stateless `/tmp` tetap prinsip utama.

Di luar lingkup (tidak disetujui): toggle nonaktif user di admin panel, service staging, perubahan kapasitas Cloud Run (min/max instance, antrean).

## Glossary
- **Domain allowlist**: daftar domain email yang boleh login (`banksampoerna.com`).
- **Kuota**: batas jumlah operasi per user per jendela waktu, dihitung dari `audit_logs`.
- **Auditor**: role read-only atas audit log dan daftar user.

## Requirements

### R1 Batas domain login (P0)
Sebagai CISO, hanya akun korporat yang boleh masuk.
- WHEN ID token Google valid tapi `email_verified` bukan true THEN 401.
- WHEN domain email ∉ `ALLOWED_EMAIL_DOMAINS` (dan klaim `hd` tidak cocok) THEN 403, tidak ada user dibuat, audit `GOOGLE_LOGIN` status `FAILED`.
- WHEN `ALLOWED_EMAIL_DOMAINS` kosong dan `ENVIRONMENT=production` THEN start gagal (fail-fast).
- Berlaku untuk jalur GIS (`POST /api/auth/google`) dan redirect (`/google/callback`). Dev-login tetap hanya non-production.

### R2 CI (P0)
Sebagai developer, regresi tertangkap sebelum merge.
- WHEN PR dibuka/diperbarui THEN jalan: pytest backend, `tools/build_font_data.py --check`, `next lint`, `tsc --noEmit`, `next build`, `pip-audit`, `npm audit --omit=dev`.
- WHEN salah satu gagal THEN merge ke `main` diblokir (branch protection, required checks).

### R3 Cloud SQL tahan banting (P0)
- Instance `sulap-db` `activation-policy ALWAYS`, backup harian otomatis, PITR aktif; `infra/setup.sh` mencerminkan ini.

### R4 Header keamanan (P1)
- WHEN respons apa pun THEN ada `Content-Security-Policy` (self; pdf.js worker same-origin; `blob:`/`data:` img), `Strict-Transport-Security` (hanya bila `FRONTEND_URL` https), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Permissions-Policy` minimal.
- GIS memerlukan `accounts.google.com`; CSP harus mengizinkan hanya itu.

### R5 Rate limit & kuota (P1)
- WHEN user melebihi N operasi/menit atau M operasi/hari THEN 429 + `Retry-After`; tercatat di audit `FAILED`.
- Default: 10/menit, 200/hari; env `RATE_LIMIT_PER_MIN`, `QUOTA_PER_DAY`. Admin tidak dikecualikan.
- Benar di multi-instance (tanpa state in-memory).

### R6 Upload streaming (P1)
- WHEN upload melebihi batas THEN ditolak 413 setelah membaca paling banyak `limit+1` byte, tanpa memuat seluruh file ke RAM.
- WHEN header `Content-Length` > batas total THEN 413 sebelum body dibaca.
- Berlaku untuk semua endpoint pdf/*.

### R7 Hardening convert Office (P1)
- Makro tidak pernah jalan; link eksternal/OLE tidak di-update; CPU & memori subprocess dibatasi; timeout membunuh seluruh process group.
- Egress jaringan container dibatasi (infra; dokumentasi + perintah, dijalankan manusia).
- Pemindaian AV (ClamAV): DITUNDA; tambahkan hanya jika kebijakan InfoSec mewajibkan (satu langkah sebelum `save_upload`).

### R8 PDF terenkripsi (P1)
- WHEN PDF butuh password dan endpoint bukan unlock THEN 422 dengan pesan jelas "PDF terkunci password — gunakan Unlock PDF dulu", bukan error qpdf mentah.

### R9 Audit admin & role auditor (P1)
- WHEN admin ubah role THEN tercatat `USER_ROLE_CHANGE` (siapa, target, dari→ke).
- Role `auditor`: boleh `GET /api/admin/audit-logs`, `/csv`, `/users`; tidak boleh ubah role. Admin panel tab Audit tampil untuk auditor, tab User read-only.
- Audit log bisa diekspor ke Cloud Logging (log terstruktur per entri audit) sebagai salinan immutable.

### R10 Sesi (P1)
- JWT kedaluwarsa 8 jam (default `JWT_EXPIRY_HOURS=8`).
- Revokasi: role & `is_active` sudah dibaca dari DB tiap request, jadi demote berlaku seketika; tidak perlu `token_version` (YAGNI).

### R11 Ingress Cloud Run — DIBATALKAN
- Layanan sudah berada di belakang IAP. Tidak ada pekerjaan.

### R12 Migrasi skema (P1)
- Alembic menggantikan `create_all`; migrasi dijalankan sebagai langkah terpisah, bukan saat boot app. Baseline = skema saat ini.

### R13 Dependency (P1)
- `python-jose` diganti `PyJWT`; `requirements.lock` ber-hash (pip-tools); `datetime.utcnow()` → timezone-aware.
- Token lama (HS256, klaim `user_id`) tetap valid sampai kedaluwarsa agar tidak memaksa logout massal.

## Keputusan (terjawab)
1. Domain: `banksampoerna.com`.
2. Branch protection disetujui: `main` hanya via PR dengan CI hijau; push langsung ke main bukan lagi jalur deploy.
3. Ingress: sudah IAP, dilewati.
4. ClamAV: ditunda.
