# Design — Bankwide Hardening

## Architecture
```
Request → SecurityHeadersMiddleware → BodyLimitMiddleware (Content-Length)
        → OriginCheckMiddleware → router
        → Depends(get_current_user) → Depends(enforce_quota)   # hitung audit_logs
        → pdf/job.save_upload (stream ke /tmp, batas byte)
        → proses → audit (DB + log JSON ke stdout → Cloud Logging)
```
Prinsip: pakai ulang `audit_logs` untuk kuota (tanpa Redis), `config.Settings` untuk semua knob, satu helper upload dipakai semua endpoint.

## Components & Interfaces

### R1 `auth/domain.py` (baru)
```python
def check_identity(email: str, email_verified: bool, hd: str | None) -> None  # raise HTTPException 401/403
```
Dipanggil di `google_token_login` dan `google_callback` sebelum `create_user`. Cocokkan `email.rsplit("@",1)[1].lower()` ∈ allowlist; `hd` bila ada harus cocok. Config: `allowed_email_domains: str` (comma-sep) + validator fail-fast di production.

### R4 `middleware/security_headers.py` (baru)
`BaseHTTPMiddleware` menambah header statis; HSTS bersyarat `frontend_url.startswith("https")`. CSP: `default-src 'self'; script-src 'self' https://accounts.google.com 'unsafe-inline'; frame-src https://accounts.google.com; img-src 'self' data: blob: https://*.googleusercontent.com; connect-src 'self' https://accounts.google.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'`. `unsafe-inline` dibutuhkan inline script hasil export Next; dicatat sebagai utang, perbaikan nonce = di luar lingkup.

### R5 `middleware/quota.py` (baru)
```python
async def enforce_quota(request, db, user=Depends(get_current_user)) -> None
```
Dua query atas `audit_logs` (`user_id`, `executed_at >= now()-jendela`, `action NOT IN ('GOOGLE_LOGIN','RATE_LIMITED')`; operasi FAILED ikut dihitung). Penolakan dicatat sebagai action `RATE_LIMITED` yang tidak dihitung, jadi penolakan tidak memperpanjang kuncian. Waktu dihitung di DB (`now()`). Index komposit `(user_id, executed_at)` (migrasi). 429 + `Retry-After`. Dipasang sebagai dependency di router pdf.

### R6 `pdf/upload.py` (baru)
```python
async def save_upload(file: UploadFile, dest: Path, max_bytes: int) -> int  # baca 1 MiB per chunk, raise 413 bila > max_bytes
```
Endpoint lama (`compress`, `merge`, `rearrange`, `remove_pages`, `convert`, `edit_overlay`) mengganti `await file.read()` dengan helper ini. `BodyLimitMiddleware` menolak `Content-Length` > `(max_file_size_mb + 1)` MiB (merge dibatasi agregat 30 MB + overhead multipart; sisa anggaran per file diteruskan ke `save_upload`).

### R7 `pdf/convert.py`
- Seed profil: tulis `registrymodifications.xcu` ke `{profil}/user/` sebelum jalan: `MacroSecurityLevel=3` (very high), `DisableMacrosExecution=true`, `UpdateLinkMode` (Writer/Calc/Impress)=never.
- Subprocess: `start_new_session=True`, `preexec_fn` set `RLIMIT_CPU`(= `request_timeout_seconds`) dan `RLIMIT_FSIZE`(200 MiB); `RLIMIT_AS` sengaja tidak dipasang (LibreOffice crash bila memori virtual dibatasi; memori dibatasi cgroup Cloud Run). Timeout → `os.killpg`; pipe dikuras via `communicate()`.
- Infra (manual): Direct VPC egress + firewall deny-all untuk service; `infra/harden.md` berisi perintah.
- Test: argv tetap lolos `tests/test_convert_cmd.py`; tambah test yang membaca xcu hasil seed.

### R8 `pdf/errors.py` (baru)
`def raise_if_encrypted(path)` → `pikepdf.open` raise `PasswordError` → HTTP 422 pesan di atas. Dipanggil di validasi tiap tool PDF.

### R9
- `db/models.py`: `AuditLog.detail: JSONB nullable`.
- `auth/dependencies.py`: `get_current_auditor_or_admin` (role ∈ {admin, auditor}); admin router endpoint GET pakai ini, `upgrade` tetap admin-only; `role` regex `^(admin|auditor|user)$`; `last admin` guard tetap.
- `upgrade_user_role` panggil `log_audit(action="USER_ROLE_CHANGE", detail={"target": id, "from": old, "to": new})`.
- `audit.log_audit` juga `logger.info(json.dumps({...}))` dengan `extra` → Cloud Logging structured; sink BigQuery/bucket retensi = langkah infra manual.
- Frontend: `navItems.roles` tambah `auditor` untuk "Admin Panel"; `UserManagement` sembunyikan tombol bila role bukan admin.

### R10 `auth/jwt.py`
`exp = now(UTC) + timedelta(hours=settings.jwt_expiry_hours)`; cookie `max_age` ikut. Hapus `jwt_expiry_days`.

### R12 Alembic
Direktori `backend/alembic/` (BUKAN `migrations/`). `env.py` memakai `settings.database_url` (async via `run_sync`). Revisi 0001 = baseline (skema saat ini, idempoten), 0002 = `audit_logs.detail` + index kuota. Hapus `create_all` dari `lifespan`. Dijalankan saat container start: `CMD alembic upgrade head && exec uvicorn ...` (Dockerfile); instance paralel diserialkan `pg_advisory_xact_lock` di env.py. Baseline 0001 idempoten (lewati tabel yang sudah ada, DB produksi dari `create_all`); 0002 memakai `IF NOT EXISTS`. Role `auditor` tetap boleh memakai tool PDF.

### R13
`jose.jwt` → `import jwt` (PyJWT): `jwt.encode`, `jwt.decode(..., algorithms=["HS256"])`, tangkap `jwt.PyJWTError`. `requirements.txt` (input, tetap dipakai SBOM/CI dev) → `requirements.lock` via `pip-compile --generate-hashes --strip-extras`; Dockerfile `pip install --require-hashes -r requirements.lock`. `datetime.utcnow` → `datetime.now(timezone.utc)` di `jwt.py` & `models.py` default (`lambda`).

### R2 CI `.github/workflows/ci.yml` (jalur diblokir hook → ditulis ke `.claude/queue` sebagai usulan manusia, lalu dipasang manual)
Job `backend` (python 3.12, install lock, `apt install qpdf`, pytest), `frontend` (node 22, `npm ci`, lint, `tsc`, build), `audit` (pip-audit, npm audit). Tanpa deploy; deploy tetap Cloud Build trigger.

### R3 `infra/setup.sh`
`--activation-policy ALWAYS --backup-start-time 18:00 --enable-point-in-time-recovery --retained-backups-count 14`. Plus perintah `patch` untuk instance existing di komentar.

## Perbaikan yang ikut (ditemukan saat implementasi)
- `audit.py`: `X-Forwarded-For` non-IP (dipalsukan klien) membuat INSERT kolom INET gagal dan meracuni session request → 500. Kini divalidasi, disimpan NULL bila bukan IP.
- `db/models.py`: default `executed_at`/`created_at` memakai `datetime.now(timezone.utc)` (sebelumnya `utcnow` naif, bergantung timezone DB; kuota butuh konsistensi).

## Data Models
```sql
-- 0002 (Alembic)
ALTER TABLE audit_logs ADD COLUMN detail JSONB;
CREATE INDEX ix_audit_user_executed ON audit_logs (user_id, executed_at);
```
`users.role` tetap VARCHAR(20); nilai baru `auditor` tidak butuh migrasi.

## Error Handling
| Skenario | Perilaku |
|---|---|
| Domain tak diizinkan | 403 "Akun tidak diizinkan", audit FAILED, tak ada user dibuat |
| `email_verified=false` | 401 generik |
| Kuota habis | 429 + `Retry-After`, audit FAILED |
| Upload > batas | 413, file parsial dihapus di `finally` |
| PDF berpassword | 422 pesan jelas |
| Makro/link di dokumen Office | diabaikan LO, konversi jalan tanpa eksekusi |
| `alembic upgrade` gagal | deploy gagal (container tidak start), revisi lama tetap melayani |
| CSP memblokir GIS | tes manual login di staging-lokal sebelum rilis |
| Token HS256 lama (jose) | PyJWT menerima (algoritma & klaim sama) |
