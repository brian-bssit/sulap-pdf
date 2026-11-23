# Tasks — Bankwide Hardening

Catatan guardrail: hook memblokir tulis ke `.github/workflows/` dan `migrations/`. Workflow CI ditulis sebagai usulan di `.claude/queue` untuk dipasang manusia; Alembic memakai folder `alembic/`.

## Gelombang A — Akses & pondasi (P0)
- [x] A1 `config.py`: `allowed_email_domains`, `jwt_expiry_hours`, fail-fast production [Req 1, 10]
- [x] A2 `auth/domain.py` + panggil di `oauth.py` (GIS & callback) + test unit (domain ok/salah, unverified, hd mismatch) [Req 1]
- [x] A3 `infra/setup.sh`: ALWAYS + backup + PITR; tulis perintah patch instance existing [Req 3]
- [x] A4 Ganti `python-jose`→`PyJWT` di `auth/jwt.py`, `requirements.txt`; test token lama tetap valid [Req 13]
- [x] A5 Usulan `ci.yml` ke `.claude/queue` (pytest, font check, lint, tsc, build, pip-audit, npm audit) + usulan aturan branch protection [Req 2]
- [x] **Checkpoint A** — `pytest backend/tests` lulus; login lokal (dev-login) masih jalan

## Gelombang B — Pipeline aman (P1)
- [x] B1 `pdf/upload.py` `save_upload` + `BodyLimitMiddleware` + test (file > batas tidak naik RAM, 413) [Req 6]
- [x] B2 Pasang `save_upload` di 6 endpoint pdf (satu per commit logis) [Req 6]
- [x] B3 `pdf/errors.py` `raise_if_encrypted` + pasang di validasi tool + test fixture PDF berpassword [Req 8]
- [x] B4 Hardening convert: seed xcu, rlimit, process group kill + test [Req 7]
- [x] B5 `middleware/security_headers.py` + test header; verifikasi GIS login di browser lokal [Req 4]
- [x] B6 `middleware/quota.py` + dependency di router pdf + test (mock COUNT) [Req 5]
- [x] **Checkpoint B** — pytest lulus; smoke manual tiap tool

## Gelombang C — Data, audit, sesi (P1)
- [x] C1 Alembic: `alembic.ini`, `alembic/env.py`, revisi 0001 baseline, 0002 `detail`+index; hapus `create_all` dari `main.py` [Req 12]
- [x] C2 `AuditLog.detail`, `log_audit(detail=)`, log JSON terstruktur [Req 9]
- [x] C3 Role `auditor`: dependency, admin router, regex role, log `USER_ROLE_CHANGE` + test [Req 9]
- [x] C4 Frontend: `dashboard/page.tsx` roles, `UserManagement.tsx` read-only untuk auditor [Req 9]
- [x] C5 `requirements.in`+`requirements.lock` hash, Dockerfile `--require-hashes`, `datetime.utcnow` → aware [Req 13]
- [x] C6 Dokumen `infra/harden.md`: egress deny, log sink retensi, step migrasi [Req 7, 9]
- [x] **Checkpoint C** — pytest lulus, `docker build` sukses, `alembic upgrade head` di Postgres lokal (docker compose)

## Gelombang D — Penutup
- [x] D1 README: konfigurasi baru (env), role auditor, kuota, aturan deploy baru
- [x] D2 `@verifier` jalankan bukti penuh; catat hasil

## Hasil verifikasi akhir (@verifier, 2026-11-20)
- pytest backend: `66 passed`; `build_font_data.py --check`: OK
- frontend: `lint` (warning lama saja), `tsc --noEmit`, `next build`: rc=0
- Alembic di Postgres 16 bersih: upgrade 0001→0002 sukses, `alembic check` → "No new upgrade operations detected."
- E2E pipeline (upload/kuota/header/convert): `19 pass, 0 fail`, tanpa sisa `/tmp/cpdf_*`
- E2E role/audit di skema hasil Alembic: `18 pass, 0 fail`
- Belum diuji: login Google korporat sungguhan, build Docker, deploy Cloud Run, perintah `infra/` terhadap GCP
