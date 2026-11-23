# Hardening image kontainer SULAP PDF

> Checklist butir 67 (OS hardening). Host/OS dikelola Google Cloud Run; dokumen ini mencakup bagian yang menjadi tanggung
> jawab aplikasi (image dan konfigurasi proses). Sumber: `Dockerfile`, `backend/pdf/convert.py`, `cloudbuild.yaml`.

| Area | Kontrol | Bukti |
|---|---|---|
| Basis image | `python:3.12-slim` (Debian slim); paket sistem hanya `qpdf`, `curl`, dan komponen LibreOffice (core, writer, calc, impress, draw) dengan `--no-install-recommends --no-install-suggests` | `Dockerfile` |
| Pengguna proses | Non-root (`app`); hanya `/app`, `/tmp`, dan `/home/app` yang dimiliki user itu | `Dockerfile` (`USER app`) |
| Dependency Python | Terkunci dan ber-hash; dipasang dengan `--require-hashes`; tanpa cache pip | `backend/requirements.lock` |
| Dependency frontend | Hasil `npm ci` dari lockfile; artefak hanya berkas statis (tanpa server Node di image akhir) | `Dockerfile` (multi-stage) |
| Port | Satu port (8080), dilayani Cloud Run di HTTPS 443 | `Dockerfile`, `cloudbuild.yaml` |
| Dokumentasi API | `/docs`, `/redoc`, `/openapi.json` dimatikan di production | `backend/main.py` |
| Penyajian berkas | Hanya di dalam `static/` (path traversal ditolak, termasuk symlink) | `backend/static_files.py`, tes |
| Header | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS (HTTPS) | `backend/middleware/security_headers.py` |
| Subproses dokumen | Profil LibreOffice per-job, makro dimatikan, tautan eksternal tak diperbarui, `RLIMIT_CPU`/`RLIMIT_FSIZE`, seluruh process group dibunuh saat timeout | `backend/pdf/convert.py` |
| Data sementara | Hanya `/tmp` selama request, dihapus di `finally`; sweeper berkas yatim tiap 5 menit | `backend/main.py` |
| Rahasia | Di Secret Manager (`DATABASE_URL`, `SECRET_KEY`, `GOOGLE_CLIENT_ID`, `FRONTEND_URL`); tidak ada di image | `cloudbuild.yaml` |
| Health | Liveness `/api/health`, readiness `/api/ready` | `backend/middleware/origin.py` |

## Belum ada / ditahan
- Antivirus di image (ditahan; `.claude/queue/security-holds.md`).
- Pembatasan egress jaringan (`infra/harden.md` §1, dijalankan manusia).
- CSP tanpa `unsafe-inline` (ditahan).
- Pemindaian kerentanan image otomatis (mis. Artifact Analysis) belum diaktifkan; usulan: aktifkan di Artifact Registry.

## Tanggung jawab bersama
Patch OS host, isolasi sandbox, dan hardening kernel dilakukan Google (Cloud Run). Yang perlu dilakukan tim: membangun ulang image secara berkala
agar paket Debian dan `python:3.12-slim` terbaru ikut (rilis rutin atau jadwal bulanan).
