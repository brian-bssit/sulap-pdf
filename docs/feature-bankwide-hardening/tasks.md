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
- [ ] B1 `pdf/upload.py` `save_upload` + `BodyLimitMiddleware` + test (file > batas tidak naik RAM, 413) [Req 6]
- [ ] B2 Pasang `save_upload` di 6 endpoint pdf (satu per commit logis) [Req 6]
- [ ] B3 `pdf/errors.py` `raise_if_encrypted` + pasang di validasi tool + test fixture PDF berpassword [Req 8]
- [ ] B4 Hardening convert: seed xcu, rlimit, process group kill + test [Req 7]
- [ ] B5 `middleware/security_headers.py` + test header; verifikasi GIS login di browser lokal [Req 4]
- [ ] B6 `middleware/quota.py` + dependency di router pdf + test (mock COUNT) [Req 5]
- [ ] **Checkpoint B** — pytest lulus; smoke manual tiap tool

## Gelombang C — Data, audit, sesi (P1)
- [ ] C1 Alembic: `alembic.ini`, `alembic/env.py`, revisi 0001 baseline, 0002 `detail`+index; hapus `create_all` dari `main.py` [Req 12]
- [ ] C2 `AuditLog.detail`, `log_audit(detail=)`, log JSON terstruktur [Req 9]
- [ ] C3 Role `auditor`: dependency, admin router, regex role, log `USER_ROLE_CHANGE` + test [Req 9]
- [ ] C4 Frontend: `dashboard/page.tsx` roles, `UserManagement.tsx` read-only untuk auditor [Req 9]
- [ ] C5 `requirements.in`+`requirements.lock` hash, Dockerfile `--require-hashes`, `datetime.utcnow` → aware [Req 13]
- [ ] C6 Dokumen `infra/harden.md`: egress deny, log sink retensi, step migrasi [Req 7, 9]
- [ ] **Checkpoint C** — pytest lulus, `docker build` sukses, `alembic upgrade head` di Postgres lokal (docker compose)

## Gelombang D — Penutup
- [ ] D1 README: konfigurasi baru (env), role auditor, kuota, aturan deploy baru
- [ ] D2 `@verifier` jalankan bukti penuh; catat hasil
