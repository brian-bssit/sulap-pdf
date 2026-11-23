# SULAP PDF — Implementation Tasks

## Wave 0: Project Scaffold

- [x] **T0.1** Init monorepo structure: `backend/`, `frontend/`, `docker-compose.yml` (local dev)
- [x] **T0.2** `backend/requirements.txt` dengan semua dependency
- [x] **T0.3** `frontend/` init Next.js 14 + `output: 'export'` di `next.config.js`
- [x] **T0.4** `Dockerfile` multi-stage (frontend build + backend)
- [ ] **T0.5** Cloud SQL instance provision (terraform atau gcloud CLI)
- [ ] **T0.6** Secret Manager: `GOOGLE_CLIENT_SECRET`, `SECRET_KEY`, `DATABASE_URL`
- [ ] **T0.7** Artifact Registry repository
- [ ] **T0.8** Google OAuth consent screen + OAuth 2.0 Client ID di GCP Console

**Checkpoint:** `docker build` sukses, Cloud SQL ready, OAuth credentials ready.

---

## Wave 1: Database + Auth (R1, R6, R10)

- [x] **T1.1** `backend/db/database.py` — SQLAlchemy async engine + session factory [R1, R6]
- [x] **T1.2** `backend/db/models.py` — `User` + `AuditLog` SQLAlchemy models [R1, R6]
- [x] **T1.3** `backend/db/queries.py` — `get_or_create_user()`, `update_last_login()` [R1.2, R1.5]
- [x] **T1.4** `backend/config.py` — pydantic-settings dari env vars [R1, R10]
- [x] **T1.5** `backend/auth/oauth.py` — Authlib Google OAuth setup + `/login` + `/callback` [R1.1, R1.2, R1.4]
- [x] **T1.6** `backend/auth/jwt.py` — `create_token()`, `decode_token()` [R1.3]
- [x] **T1.7** `backend/auth/dependencies.py` — `get_current_user()` FastAPI dependency [R1.3, R10.3]
- [x] **T1.8** `backend/audit.py` — `log_audit(user_id, email, action, ...)` [R6.1]
- [x] **T1.9** JWT cookie spec: `SameSite=Strict`, `Secure`, `HttpOnly`, `Path=/api` [R1.3, R10.1]
- [x] **T1.10** `backend/middleware/origin.py` — Origin/Referer validator untuk POST/PUT/DELETE [R10.2]
- [x] **T1.11** `backend/middleware/error_handler.py` — global exception → JSON handler
- [x] **T1.12** `GET /api/auth/me` — return current user [R1.5]
- [x] **T1.13** `POST /api/auth/logout` — clear cookie [R1.6]
- [x] **T1.14** `GET /api/health` — health check endpoint

**Checkpoint:** Google OAuth flow bekerja end-to-end. User baru auto-provision. JWT cookie valid.

---

## Wave 2: Frontend Auth + Shell (R1, R5)

- [x] **T2.1** `frontend/src/lib/api.ts` — Axios instance 600s timeout, `withCredentials: true` [R5.3]
- [x] **T2.2** `frontend/src/lib/auth.ts` — AuthContext provider (cek `/api/auth/me` on mount) [R1.5]
- [x] **T2.3** `frontend/src/middleware.ts` — redirect ke `/` jika tidak ada auth cookie [R1]
- [x] **T2.4** `frontend/src/components/GoogleSignIn.tsx` — "Sign in with Google" button [R1.1]
- [x] **T2.5** `frontend/src/app/page.tsx` — landing page dengan GoogleSignIn [R1.1]
- [x] **T2.6** `frontend/src/app/dashboard/page.tsx` — dashboard dengan links ke tools [R1.5]
- [x] **T2.7** `frontend/src/components/Navbar.tsx` — navigation + user avatar + logout [R1.6]
- [x] **T2.8** `frontend/src/components/LoadingOverlay.tsx` — full-screen spinner [R5.1, R5.2]
- [x] **T2.9** `frontend/src/app/layout.tsx` — root layout dengan AuthProvider

**Checkpoint:** User bisa login via Google, lihat dashboard, logout. Loading overlay siap digunakan.

---

## Wave 3: PDF Tools — Compress (R3)

Pilih Compress dulu karena paling sederhana (1 file in, 1 file out, no UI kompleks).

- [x] **T3.1** `backend/pdf/compress.py` — `compress_pdf(input_path, output_path, level)` [R3.3]
- [x] **T3.2** Level mapping: Low=`--compression-level=1`, Medium=`--compression-level=5`, High=`--recompress-flate --compression-level=9` [R3.2]
- [x] **T3.3** Validasi file: magic bytes `%PDF`, max 30MB [R3.1]
- [x] **T3.4** Disconnect detection loop saat qpdf berjalan [R5.5]
- [x] **T3.5** `POST /api/pdf/compress` — full flow: validate → save → process → audit → stream → clean [R3.1–R3.6]
- [x] **T3.6** `frontend/src/app/dashboard/compress/page.tsx` — upload form + level selector + LoadingOverlay [R3.1, R3.2, R5.1]
- [x] **T3.7** Notifikasi ukuran sebelum/sesudah di UI [R3.5]

**Checkpoint:** User upload PDF → compress → download hasil. Disconnect detection bekerja.

---

## Wave 4: PDF Tools — Merge (R2)

- [x] **T4.1** `backend/pdf/merge.py` — `merge_pdfs(input_paths, output_path)` via `pypdf.PdfWriter` [R2.3]
- [x] **T4.2** Validasi: 2-10 file, total ≤ 30MB [R2.1]
- [x] **T4.3** Disconnect detection saat merge [R5.5]
- [x] **T4.4** `POST /api/pdf/merge` — full flow [R2.1–R2.5]
- [x] **T4.5** `frontend/src/app/dashboard/merge/page.tsx` — multi-file upload + drag-and-drop sort list + LoadingOverlay [R2.2, R5.1]

**Checkpoint:** User upload 2+ file → atur urutan → merge → download.

---

## Wave 5: PDF Tools — Rearrange (R4)

- [x] **T5.1** `backend/pdf/rearrange.py` — `rearrange_pdf(input_path, output_path, operations)` [R4.3, R4.4, R4.5]
  - Operations: `[{action: "delete|rotate|move", page: N, ...}]`
- [x] **T5.2** Validasi: ≤ 200 halaman, ≤ 30MB [R4.1]
- [x] **T5.3** Disconnect detection [R5.5]
- [x] **T5.4** `POST /api/pdf/rearrange` — full flow [R4.1–R4.7]
- [x] **T5.5** `frontend/src/components/PDFThumbnail.tsx` — render halaman sebagai thumbnail image [R4.2]
- [x] **T5.6** `frontend/src/app/dashboard/rearrange/page.tsx` — grid thumbnail + drag-drop reorder + delete button + rotate button + LoadingOverlay [R4.2–R4.4, R5.1]

**Checkpoint:** User upload PDF → lihat grid halaman → reorder/hapus/rotasi → download.

---

## Wave 6: Orphan Cleanup (R9.4)

- [x] **T6.1** `backend/main.py` lifespan — start background `asyncio.create_task(cleanup_orphaned_files())` [R9.4]
- [x] **T6.2** Cleanup logic: glob `/tmp/cpdf_*`, `unlink` jika mtime > 15 menit [R9.4]
- [x] **T6.3** Logging: jumlah file dibersihkan + total bytes freed

**Checkpoint:** File yatim terhapus otomatis. Bisa di-test dengan buat file dummy > 15 menit di `/tmp`.

---

## Wave 7: Admin Audit Dashboard (R6, R7)

- [x] **T7.1** `backend/db/queries.py` — `get_audit_logs()` dengan filter + paginasi [R7.2, R7.3]
- [x] **T7.2** `backend/admin/router.py` — `GET /api/admin/audit-logs` [R7.1]
- [x] **T7.3** `backend/admin/router.py` — `GET /api/admin/audit-logs/csv` [R7.4]
- [x] **T7.4** Admin authorization check: `user.role == 'admin'` [R7.1]
- [x] **T7.5** `frontend/src/components/AuditTable.tsx` — tabel + filter (user dropdown, action dropdown, date range picker, status dropdown) [R7.1, R7.2]
- [x] **T7.6** Paginasi client-side: prev/next, page indicator [R7.3]
- [x] **T7.7** Export CSV button — panggil `/api/admin/audit-logs/csv` dengan filter aktif [R7.4]
- [x] **T7.8** `frontend/src/admin/audit-logs/page.tsx` — halaman admin dengan AuditTable [R7.1]

**Checkpoint:** Admin bisa lihat, filter, paginasi, dan export audit logs ke CSV.

---

## Wave 8: Deploy to Cloud Run

- [x] **T8.1** `cloudbuild.yaml` — Cloud Build trigger: build Docker → push Artifact Registry → deploy Cloud Run
- [x] **T8.2** Cloud Run service: 4GB RAM, 2 CPU, concurrency=1, timeout=600s
- [x] **T8.3** Cloud Run env vars + secret refs
- [x] **T8.4** Cloud SQL connection via Cloud Run built-in proxy (addCloudSqlInstance)
- [x] **T8.5** Custom domain mapping + managed TLS
- [x] **T8.6** IAM: Cloud Run SA → Secret Manager Accessor + Cloud SQL Client
- [x] **T8.7** Smoke test: login → compress → merge → rearrange → audit logs → CSV export
- [x] **T8.8** Set min-instances=0 (scale-to-zero enabled)

**Checkpoint:** App live di custom domain dengan HTTPS. Semua flow bekerja end-to-end.

---

## Wave 9: Hardening (Optional but Recommended)

- [x] **T9.1** Rate limiting: `slowapi` middleware, 10 req/min per IP untuk `/api/pdf/*`
- [x] **T9.2** `MAX_INSTANCES=10` untuk cegah bill runaway
- [x] **T9.3** Cloud Logging sink → export audit logs ke BigQuery (opsional)
- [x] **T9.4** Alerting: Cloud Monitoring alert jika error rate > 5% atau latency > 5 menit

---

## Dependency Order

```
Wave 0 (Scaffold)
  └── Wave 1 (DB + Auth)
        └── Wave 2 (Frontend Shell)
              ├── Wave 3 (Compress)  ← Mulai dari sini, paling sederhana
              ├── Wave 4 (Merge)
              └── Wave 5 (Rearrange)
        └── Wave 6 (Orphan Cleanup)
        └── Wave 7 (Admin Audit)
              └── Wave 8 (Deploy)
                    └── Wave 9 (Hardening)
```

Waves 3, 4, 5 independen — bisa dikerjakan paralel. Wave 6 independen dari semuanya.

## Requirement Traceability

| Wave | Tasks | Covers |
|:---|:---|:---|
| 0 | T0.1–T0.8 | Infrastructure |
| 1 | T1.1–T1.14 | R1, R6, R10 |
| 2 | T2.1–T2.9 | R1, R5 |
| 3 | T3.1–T3.7 | R3, R5.5 |
| 4 | T4.1–T4.5 | R2, R5.5 |
| 5 | T5.1–T5.6 | R4, R5.5 |
| 6 | T6.1–T6.3 | R9.4 |
| 7 | T7.1–T7.8 | R6, R7 |
| 8 | T8.1–T8.8 | All (deployment) |
| 9 | T9.1–T9.4 | Hardening |
