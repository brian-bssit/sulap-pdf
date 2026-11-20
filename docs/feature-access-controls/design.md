# Design — Kontrol Akses

## Architecture
```
Login (GIS) → buat sesi baru: users.session_id = uuid, last_seen_at = now → JWT {user_id, sid, auth_time, exp 8 jam}
Tiap request terautentikasi (get_current_user):
   token valid? → user aktif? → token.sid == user.session_id ? (SESSION_REPLACED) → now-last_seen_at < 10 mnt ? (SESSION_IDLE)
   → update last_seen_at bila > 30 dtk lalu → lanjut
Klien: IdleGuard (timer 9 mnt peringatan, 10 mnt logout; aktivitas → POST /api/auth/ping throttle 60 dtk)
Admin: dependency require_roles(...) + RoleService (aturan dual control, invarian) + tabel role_change_requests
```

## Components & Interfaces

### Gelombang 0
- `main.py serve_frontend`: `file_path = (static_dir / full_path).resolve()`; tolak bila `static_dir.resolve() not in file_path.parents` dan bukan `static_dir` sendiri (juga untuk varian `.html` dan direktori). Tes: `..%2f`, `%2e%2e/`, `....//`, path absolut, symlink.
- `FastAPI(docs_url=None, redoc_url=None, openapi_url=None)` bila `settings.environment == "production"`.
- `pdf/*`: helper `safe_tool_error(stderr)` → pesan generik ("Dokumen tidak bisa diproses"); stderr hanya ke `logger.warning`. Frontend `common.failedWithStatus` dihapus; pesan = `detail` apa adanya.
- `auth/jwt.py logout`: butuh user opsional → baca token, `log_audit(action="LOGOUT")`; frontend `window.location.assign("/")`.
- `db/database.py`: `create_async_engine(..., pool_pre_ping=True, pool_recycle=1800)`.
- Dependency: `npm audit fix` (axios dst.), `pip-audit`; regenerasi SBOM.
- Dokumen: `docs/ops/matriks-role.md`, `docs/ops/kode-error.md`, `docs/ops/hardening-image.md`; `GET /api/admin/users/csv` (peran yang boleh melihat user).

### Gelombang A (migrasi Alembic 0003)
```sql
ALTER TABLE users ADD COLUMN session_id UUID, ADD COLUMN last_seen_at TIMESTAMPTZ;
```
- `create_token(user_id, email, sid, auth_time)`; `decode_token` memeriksa `auth_time` ≤ 8 jam.
- `auth/session.py`: `start_session(db, user) -> sid` (set `session_id`, `last_seen_at`, audit `LOGIN_REPLACED` bila sid lama ada dan beda); `touch(db, user)`.
- Respons 401 membawa header `X-Auth-Reason: SESSION_IDLE | SESSION_REPLACED | EXPIRED`.
- `POST /api/auth/ping` (auth) → 204 (hanya memperbarui `last_seen_at`).
- Frontend: `components/IdleGuard.tsx` di dashboard; `lib/api.ts` interceptor 401 membaca `x-auth-reason` → `/?error=session_idle|session_replaced`; `strings.ts` pesan baru; halaman login menampilkan.
- Token lama (tanpa `sid`) ditolak sekali → user login ulang (dampak: semua user keluar saat rilis).

### Gelombang B (migrasi Alembic 0004)
```sql
UPDATE users SET role='super_admin' WHERE role='admin';
CREATE TABLE role_change_requests (
  id UUID PRIMARY KEY, target_user_id UUID NOT NULL REFERENCES users(id),
  from_role VARCHAR(20) NOT NULL, to_role VARCHAR(20) NOT NULL, reason TEXT,
  requested_by UUID NOT NULL REFERENCES users(id), status VARCHAR(12) NOT NULL,
  decided_by UUID REFERENCES users(id), decided_at TIMESTAMPTZ, decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX ux_rcr_pending_target ON role_change_requests(target_user_id) WHERE status='PENDING';
```
Downgrade: `UPDATE users SET role='admin' WHERE role IN ('super_admin','dca_officer','dca_supervisor')`, drop tabel.
- `auth/roles.py`: konstanta peran, `require_roles(*roles)` dependency, `can_view_admin(role)`; menggantikan `get_current_admin_user` / `get_current_auditor_or_admin`.
- `admin/role_service.py`: `check_invariant(db, changes)` (hitung aktif per role setelah perubahan hipotetis), `apply_role(db, user, new_role)`, `create_request`, `approve`, `reject`, `cancel`.
- Endpoint (`admin/router.py`):
  - `POST /api/admin/users/{id}/upgrade` — hanya `super_admin` (langsung), invarian diperiksa.
  - `POST /api/admin/role-requests` {user_id, role, reason}, `GET /api/admin/role-requests?status=`, `POST /api/admin/role-requests/{id}/approve|reject|cancel`.
- Kuota: aksi `ROLE_CHANGE_*` ikut daftar yang tak dihitung.
- Frontend: tipe `Role`, `RoleBadge`, `UserManagement` (Super Admin: dropdown langsung; Officer: tombol "Ajukan" + alasan), `RoleRequests.tsx` (daftar + Setujui/Tolak), strings, nav roles. `dev-login` menerima peran baru (non-production).

## Data Models
Lihat SQL di atas. Role valid disimpan di satu tempat (`auth/roles.py`); `users.role` tetap VARCHAR(20).

## Error Handling
| Skenario | Perilaku |
|---|---|
| Token tanpa `sid` / sid beda | 401 + `X-Auth-Reason: SESSION_REPLACED`, cookie dihapus |
| Idle > 10 mnt | 401 + `SESSION_IDLE`, audit `SESSION_IDLE_EXPIRED` |
| Ping saat sesi sudah habis | 401 (klien arahkan ke login) |
| Approver = pengaju | 403 |
| Pengajuan untuk diri sendiri | 400 |
| Pengajuan ganda untuk target sama | 409 |
| Role target berubah sejak diajukan | 409, pengajuan ditandai `REJECTED` otomatis |
| Perubahan melanggar invarian | 400 + pesan jelas, tak ada perubahan |
| Officer mengajukan `super_admin` | 403 |
| Dua admin menyetujui bersamaan | `UPDATE ... WHERE status='PENDING'` atomik; yang kedua 409 |
| Path traversal | 404 |
