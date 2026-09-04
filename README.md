# SULAP PDF

**Solusi Universal, Lengkap, Aman, Proses PDF**

Internal document processing toolkit for Bank Sahabat Sampoerna. Stateless, zero-cost licensing, Google OAuth secured.

---

## Architecture

```
┌─────────────┐     HTTPS      ┌──────────────────┐     SQL      ┌──────────────┐
│   Browser   │ ◄──────────────►│   Cloud Run       │ ◄──────────► │  Cloud SQL   │
│  (Next.js   │                │  (FastAPI + LO)   │              │ (PostgreSQL) │
│   static)   │                │  /tmp ephemeral   │              └──────────────┘
└─────────────┘                └──────────────────┘
                                      │
                               ┌──────┴──────┐
                               │  Secret     │
                               │  Manager    │
                               └─────────────┘
```

**Request lifecycle:**
1. Browser uploads file via multipart POST
2. Backend validates format + size, writes to `/tmp/cpdf_{jobid}_*`
3. Processing: `qpdf` (compress), `pypdf` (merge/rearrange), `libreoffice` (convert), `pikepdf` (edit overlay)
4. Result streamed directly to browser as download
5. `finally` block deletes `/tmp` files — **zero persistent storage**
6. Background asyncio task sweeps orphaned `/tmp` files (default every 5 min, configurable) — crash recovery

---

## Features

### Compress PDF
| | |
|:---|:---|
| **Engine** | `qpdf` (Apache 2.0) |
| **Input** | 1 PDF file, max 30 MB |
| **Method** | `--recompress-flate --compression-level=9 --object-streams=generate --linearize` |
| **Output** | Streamed PDF with `X-Original-Size` / `X-Compressed-Size` headers |

### Merge PDF
| | |
|:---|:---|
| **Engine** | `pypdf` (BSD) |
| **Input** | 2–10 PDF files, aggregate size ≤ 30 MB |
| **UX** | Drag-and-drop reorder before merge |
| **Output** | Single streamed PDF, `X-Input-Files` / `X-Output-Size` headers |

### Rearrange PDF
| | |
|:---|:---|
| **Engine** | `pypdf` (BSD) |
| **Input** | 1 PDF file, max 200 pages |
| **UX** | Thumbnail grid with drag reorder, rotate 90°, delete page |
| **Output** | Streamed PDF, `X-Pages-Before` / `X-Pages-After` headers |

### Edit PDF (Overlay)
| | |
|:---|:---|
| **Engine** | `pikepdf` (MPL 2.0) — content-stream append, no rasterization |
| **Input** | 1 PDF file, max 30 MB, up to 200 pages |
| **UX** | WYSIWYG canvas (pdfjs): click to place teks / stempel (APPROVED, DRAFT…) / highlight, drag to move, warna, opacity. Font: Base-14 + open-license **Lato / DejaVu** (di-embed `/FontFile2` agar render identik di semua viewer; metadata di `pdf/font_data.py`, digenerate `tools/build_font_data.py`) |
| **Safety** | Catalog scrub (removes `/OpenAction`, JS `/Names`, `/EmbeddedFiles`, `/AA`); stamp identity (author + timestamp) injected server-side |
| **Output** | Streamed PDF, `X-Original-Size` / `X-Edited-Size` / `X-Overlay-Count` headers |

### Convert to PDF
| | |
|:---|:---|
| **Engine** | LibreOffice headless (MPL 2.0) |
| **Input** | 1 document file, max 30 MB |
| **Formats** | DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, ODS, ODP, ODG, ODF, RTF, TXT, HTML, CSV, XML, WPD, WPS, PAGES |
| **Rejected** | PDF itself, images, archives, executables (`.pdf .png .jpg .gif .webp .svg .zip .rar .7z .exe`…) |
| **Output** | Streamed PDF, `X-Original-Size` / `X-Converted-Size` headers |

### Admin Dashboard
| | |
|:---|:---|
| **Audit Logs** | Table view, server-side search (email/aksi, wildcard di-escape) + filters: user, action, status, date range; paginated |
| **User Management** | View registered users (paginated `{data,total}`), promote/demote admin role |
| **Export** | CSV download mengikuti filter + search aktif (BOM UTF-8 utk Excel) |
| **Access** | Admin role only (`user.role == "admin"`), role-gated in sidebar |

### Security & Compliance
- **Google OAuth** — GIS popup flow (client_id only, no client_secret needed)
- **Auto-provisioning** — new users created on first login via `google_sub`
- **JWT cookie** — `SameSite=Strict`, `HttpOnly`, 7-day expiry (`Secure` when served over HTTPS)
- **Single-origin CORS** — only `FRONTEND_URL` is allowlisted (`allow_origins` + `allow_credentials`)
- **Role gating** — `/api/admin/*` requires `role == "admin"` (`get_current_admin_user`)
- **Origin check** — `OriginCheckMiddleware` menolak request lintas-origin (`Origin`/`Referer` ≠ `FRONTEND_URL`); CSRF defense di sisi API
- **Dev-login gerbang eksplisit** — `/api/auth/dev/login` aktif HANYA jika `ENVIRONMENT != production` **dan** `DEV_LOGIN_ENABLED=true`; tak pernah disimpulkan dari keberadaan OAuth
- **Fail-fast secret** — `ENVIRONMENT=production` + `SECRET_KEY` default/kosong → start gagal (JWT ditandatangani key publik = forge token admin)
- **Audit IP proxy-aware** — IP klien dari entry pertama `X-Forwarded-For` (audit-grade); error klien 4xx juga dicatat `FAILED`
- **Client disconnect** — `request.is_disconnected()` aborts processing, cleans `/tmp`, logs `CANCELLED_BY_CLIENT`
- **Audit trail** — every operation logged: who, what, when, source files, result size, duration, IP, user-agent, status

---

## Tech Stack

| Layer | Technology | License |
|:---|:---|:---|
| **Backend** | FastAPI 0.115, Python 3.12 | MIT |
| **Frontend** | Next.js 14 (static export), React 18, Tailwind CSS 3 | MIT |
| **Database** | PostgreSQL 16, SQLAlchemy 2.0 async, asyncpg | PostgreSQL / MIT |
| **PDF Merge/Rearrange** | pypdf 5.1 | BSD |
| **PDF Edit Overlay** | pikepdf 8 | MPL 2.0 |
| **PDF Compress** | qpdf (CLI) | Apache 2.0 |
| **Document Convert** | LibreOffice headless | MPL 2.0 |
| **Auth** | Authlib 1.3, python-jose 3.3, google-auth 2.35 | BSD / MIT / Apache 2.0 |
| **Infra** | Cloud Run, Cloud SQL, Cloud Build, Artifact Registry, Secret Manager | GCP |

### License compliance (NFR-LIC)
- ✅ MIT, Apache 2.0, BSD, MPL 2.0, PostgreSQL License — all permissive
- ❌ Banned: PyMuPDF/fitz (AGPL), Ghostscript (AGPL), iText (AGPL)

---

## Project Structure

```
pdf-super/
├── Dockerfile                  # Multi-stage: Node build → Python runtime (non-root `app`)
├── docker-compose.yml          # Local dev: app + PostgreSQL
├── cloudbuild.yaml             # CI/CD: build → push → deploy to Cloud Run
├── .env.example                # Environment variable template
├── infra/setup.sh              # One-shot GCP provisioning: Cloud SQL, secrets, IAM
│
├── backend/
│   ├── main.py                 # FastAPI app, lifespan, CORS, static serve
│   ├── config.py               # Pydantic Settings (env vars)
│   ├── router.py               # API router aggregator
│   ├── requirements.txt        # Python dependencies
│   ├── tests/                  # Unit tests tanpa DB/auth (incl. test_convert_cmd.py — regression gate argv soffice)
│   ├── audit.py                # Audit log helper
│   ├── auth/
│   │   ├── oauth.py            # Google OAuth (redirect + GIS popup), dev bypass
│   │   ├── jwt.py              # JWT create/decode, cookie get/set
│   │   ├── dependencies.py     # get_current_user, get_current_admin_user
│   │   └── me.py               # GET /api/auth/me
│   ├── pdf/
│   │   ├── compress.py         # POST /api/pdf/compress (qpdf)
│   │   ├── merge.py            # POST /api/pdf/merge (pypdf)
│   │   ├── rearrange.py        # POST /api/pdf/rearrange (pypdf)
│   │   ├── convert.py          # POST /api/pdf/convert (LibreOffice)
│   │   ├── edit_overlay.py     # POST /api/pdf/edit-overlay (pikepdf)
│   │   ├── dl_headers.py       # Content-Disposition: ASCII fallback + RFC5987 (anti header injection)
│   │   ├── font_data.py        # Metadata font open-license (Lato/DejaVu) + subset
│   │   └── fonts/              # .ttf + LICENSE di-commit (aset statis, dibaca sekali per proses)
│   ├── admin/
│   │   └── router.py           # GET /api/admin/audit-logs, /api/admin/users
│   ├── db/
│   │   ├── database.py         # Async engine + session factory
│   │   ├── models.py           # SQLAlchemy ORM: User, AuditLog
│   │   └── queries.py          # DB query functions
│   ├── middleware/
│   │   ├── error_handler.py    # Global exception → JSONResponse
│   │   └── origin.py           # Origin/Referer validation + health endpoint
│   ├── tools/
│   │   └── build_font_data.py  # Generator font_data.py dari .ttf (`--check` utk sinkronisasi)
│   └── static/                 # Frontend build output (served by FastAPI)
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx      # Root layout
│   │   │   ├── page.tsx        # Landing/login page
│   │   │   ├── globals.css     # Tailwind + custom styles
│   │   │   ├── favicon.ico
│   │   │   └── dashboard/
│   │   │       └── page.tsx    # Dashboard shell: sidebar + role-filtered tabs (incl. AdminPanel)
│   │   ├── components/
│   │   │   ├── CompressTool.tsx
│   │   │   ├── MergeTool.tsx
│   │   │   ├── RearrangeTool.tsx
│   │   │   ├── ConvertTool.tsx
│   │   │   ├── EditOverlayTool.tsx
│   │   │   ├── LoadingOverlay.tsx
│   │   │   ├── SecurityFooter.tsx
│   │   │   ├── AuditTable.tsx
│   │   │   └── UserManagement.tsx
│   │   └── lib/
│   │       ├── api.ts          # Axios: timeout, credentials, interceptor 401→/login, parse blob error
│   │       ├── download.ts     # filenameFromDisposition (RFC5987) + downloadBlob
│   │       ├── error.ts        # errorDetail: detail string/array/object → teks
│   │       └── format.ts       # formatBytes (dipakai semua tool)
│   ├── public/
│   │   └── pdf.worker.min.mjs  # pdf.js worker self-hosted — tanpa CDN eksternal
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   └── package.json
│
└── docs/
    └── feature-*/              # Feature design documents (requirements, design, tasks)
```

---

## API Reference

All endpoints prefixed with `/api`. Mutating endpoints require valid JWT cookie.

### Auth
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/api/auth/me` | JWT | Current user info |
| `POST` | `/api/auth/google` | None | GIS popup token verification |
| `GET` | `/api/auth/google/login` | None | OAuth redirect flow |
| `GET` | `/api/auth/google/callback` | None | OAuth callback |
| `GET` | `/api/auth/google/config` | None | Client ID for GIS |
| `POST` | `/api/auth/logout` | None | Clear cookie |
| `GET` | `/api/auth/dev/login` | None | Dev auto-login (no OAuth) — aktif hanya jika `ENVIRONMENT != production` && `DEV_LOGIN_ENABLED=true` |

### PDF Operations
| Method | Path | Input | Description |
|:---|:---|:---|:---|
| `POST` | `/api/pdf/compress` | `file` (multipart) | Compress PDF |
| `POST` | `/api/pdf/merge` | `files` (multipart, 2-10) | Merge PDFs |
| `POST` | `/api/pdf/rearrange` | `file` + `operations` (JSON) | Rearrange pages |
| `POST` | `/api/pdf/convert` | `file` (multipart) | Convert document to PDF |
| `POST` | `/api/pdf/edit-overlay` | `file` + `operations` (JSON) | Add text/stamp/highlight overlays |

### Admin
| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/api/admin/audit-logs` | Admin JWT | Paginated logs; filter `user_id/action/status/search/date_from/date_to` |
| `GET` | `/api/admin/audit-logs/csv` | Admin JWT | Export logs mengikuti filter + `search` (≤10k baris, BOM) |
| `GET` | `/api/admin/users` | Admin JWT | User list paginated (`page`/`per_page`) → `{data,total}` |
| `POST` | `/api/admin/users/{id}/upgrade?role=admin\|user` | Admin JWT | Promote/demote user role |

### Error Responses

| Status | Meaning |
|:---|:---|
| `400` | Invalid input (bad format, empty file, wrong file type) |
| `401` | Missing or expired JWT |
| `403` | Insufficient role (non-admin hitting admin endpoints) |
| `413` | File exceeds 30 MB limit |
| `422` | Processing failed (corrupt file, LibreOffice/qpdf error) |
| `499` | Client disconnected — process aborted |
| `504` | Processing timeout (600s) |

---

## Database Schema

### `users`
| Column | Type | Description |
|:---|:---|:---|
| `id` | UUID (PK) | Auto-generated |
| `google_sub` | VARCHAR(255) UNIQUE | Google account subject identifier |
| `email` | VARCHAR(255) UNIQUE | User email |
| `display_name` | VARCHAR(255) | Display name from Google |
| `picture_url` | TEXT NULL | Avatar URL |
| `role` | VARCHAR(20) | `user` or `admin` |
| `is_active` | BOOLEAN | Soft disable |
| `last_login_at` | TIMESTAMPTZ | Updated on each login |
| `created_at` | TIMESTAMPTZ | Account creation |

### `audit_logs`
| Column | Type | Description |
|:---|:---|:---|
| `id` | BIGINT (PK) | Auto-increment |
| `user_id` | UUID NULL | FK to users |
| `user_email` | VARCHAR(255) | Denormalized for fast queries |
| `action` | VARCHAR(50) | COMPRESS, MERGE, REARRANGE, CONVERT, EDIT_OVERLAY, GOOGLE_LOGIN |
| `source_files` | TEXT[] | Original filenames |
| `result_file` | VARCHAR(255) | Output filename |
| `file_sizes` | BIGINT[] | Input file sizes in bytes |
| `result_size` | BIGINT | Output file size in bytes |
| `processing_ms` | INTEGER | Processing duration |
| `status` | VARCHAR(20) | SUCCESS, FAILED, CANCELLED_BY_CLIENT (4xx/error operasi → FAILED) |
| `error_message` | TEXT NULL | Error details if failed |
| `ip_address` | INET NULL | Client IP |
| `user_agent` | TEXT NULL | Browser user-agent |
| `executed_at` | TIMESTAMPTZ | When the operation occurred |

---

## Configuration

All config via environment variables (`.env` or Secret Manager).

| Variable | Required | Default | Description |
|:---|:---|:---|:---|
| `DATABASE_URL` | Yes | — | `postgresql+asyncpg://user:pass@host:5432/db` |
| `SECRET_KEY` | Yes | — | JWT signing key (64+ char hex recommended) |
| `GOOGLE_CLIENT_ID` | Yes | — | Google OAuth client ID (GIS) |
| `GOOGLE_CLIENT_SECRET` | No | `""` | Only needed for redirect OAuth fallback |
| `FRONTEND_URL` | Yes | `http://localhost:8080` | CORS origin + cookie domain |
| `APP_NAME` | No | `CloudPDF Toolkit` | App display name |
| `ENVIRONMENT` | No | `development` | `production` → fail-fast jika `SECRET_KEY` default/kosong |
| `DEV_LOGIN_ENABLED` | No | `false` | Gerbang eksplisit `/api/auth/dev/login` — WAJIB `false` di prod |
| `LOG_LEVEL` | No | `INFO` | Python logging level |
| `MAX_FILE_SIZE_MB` | No | `30` | Upload size limit |
| `REQUEST_TIMEOUT_SECONDS` | No | `600` | Processing timeout |
| `MAX_PAGES_REARRANGE` | No | `200` | Page limit for rearrange |
| `MAX_PAGES_EDIT` | No | `200` | Page limit for edit-overlay |
| `JWT_EXPIRY_DAYS` | No | `7` | Cookie/session duration |
| `CLEANUP_INTERVAL_SECONDS` | No | `300` | Orphan file cleanup interval |
| `ORPHAN_AGE_SECONDS` | No | `900` | File age before cleanup |

---

## Getting Started

### Docker (recommended)

```bash
cp .env.example .env
# Edit .env with real values

docker compose up -d
# → http://localhost:8080
```

### Local Development

**Prerequisites:** Python 3.12, Node.js 22, PostgreSQL 16, LibreOffice (optional, for convert feature)

```bash
# Database
createdb cloudpdf

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # edit DATABASE_URL, SECRET_KEY, GOOGLE_CLIENT_ID
uvicorn main:app --port 8080   # --reload opsional utk dev; jangan utk prod

# Frontend (build static, then serve from backend — single origin)
cd frontend
npm install
npm run build
cp -r out/* ../backend/static/
# → http://localhost:8080 (single server)

# NOTE: OAuth requires one origin — the JWT cookie is SameSite=Strict, so the
# frontend and API must share a host:port. `next dev` alone (:3000) has no API
# proxy and will break login; always serve the static build from FastAPI.
```

### Dev Auth Bypass

Aktif hanya jika dua-duanya: `ENVIRONMENT` **bukan** `production` dan `DEV_LOGIN_ENABLED=true`.
Set di `.env`:
```
ENVIRONMENT=development
DEV_LOGIN_ENABLED=true
```
Kunjungi:
```
http://localhost:8080/api/auth/dev/login?email=admin@local.dev&role=admin
```
Auto-create/login user dengan email & role tsb. Jangan nyalakan di production.

---

## Deployment

**`git push origin main` adalah SATU-SATUNYA jalur deploy.** Push memicu Cloud Build GitHub
trigger **`sulap-deploy`** → `cloudbuild.yaml`:

```
Docker build → push to Artifact Registry → gcloud run deploy sulap
```

Catatan operasional:
- Trigger **2nd-gen → regional** (`asia-southeast2`). Inspeksi WAJIB pakai `--region`:
  `gcloud builds triggers list --project bss-sandbox-project-1 --region asia-southeast2`
  (list global tak menampilkan trigger regional). UUID di build history = **build ID**, bukan trigger.
- **Jangan** `gcloud builds submit` utk pekerjaan sehari-hari — itu menciptakan build `triggerId: None`
  yang tampil sebagai "deploy duplikat" di history (penyebab gejala duplikat dulu; hanya ada SATU
  trigger, `sulap-deploy`). Untuk redeploy ulang, amend/commit kosong lalu push.
- Manual submit hanya utk darurat (mis. trigger sedang rusak):
  `gcloud builds submit --config=cloudbuild.yaml .` — lalu jangan lupa lapor ke tim agar tak menumpuk.

### Secret Manager setup

```bash
gcloud secrets create sulap-db-url --data-file=-     # DATABASE_URL
gcloud secrets create sulap-jwt-secret --data-file=-  # SECRET_KEY
gcloud secrets create sulap-google-id --data-file=-   # GOOGLE_CLIENT_ID
gcloud secrets create sulap-frontend-url --data-file=- # FRONTEND_URL

# Grant Cloud Run service account access:
gcloud secrets add-iam-policy-binding sulap-db-url \
  --member="serviceAccount:PROJECT-NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
# (repeat for each secret)
```

### Cloud Run settings (from cloudbuild.yaml)

| Setting | Value | Reason |
|:---|:---|:---|
| Memory | 4 GiB | LibreOffice + 30MB PDF processing |
| CPU | 2 | Conversion benefits from multi-core |
| Timeout | 600s | Large document accommodation |
| Concurrency | 1 | 1 request per instance, avoid `/tmp` race |
| Max instances | 5 | Auto-scale ceiling |

---

## Design Decisions

**Why LibreOffice and not an online API?**
Zero external dependencies, zero API costs, fully offline. MPL 2.0 license is permissive and compatible with internal use. LibreOffice supports the widest range of document formats of any open-source converter.

**Why stateless `/tmp` processing?**
Compliance requirement: no document storage, ever. Files exist only for the duration of the HTTP request. `try/finally` guarantees cleanup. Background orphan sweeper handles crash recovery.

**Why Cloud Run concurrency = 1?**
Single-request isolation prevents memory exhaustion and `/tmp` filename collisions. Cloud Run auto-scales instances horizontally instead.

**Why `soffice` on macOS, `libreoffice` on Linux?**
Homebrew installs LibreOffice as `soffice`. Debian packages provide the `libreoffice` wrapper. Auto-detected at import time via `shutil.which()`.

**Why embed Lato/DejaVu instead of only Base-14 fonts?**
Base-14 rendering bergantung viewer — sebagian reader tak menampilkannya. Overlay teks pakai font open-license yang di-embed (`/FontFile2`, subset WinAnsi) agar hasil identik di semua viewer. Aset `.ttf` + `LICENSE` di-commit; `font_data.py` digenerate `tools/build_font_data.py` (mode `--check` menjaga sinkron).

**Why self-host pdf.js worker?**
Static export tak bisa andalkan CDN eksternal; worker disalin ke `frontend/public/pdf.worker.min.mjs` dan di-pin via `GlobalWorkerOptions.workerSrc` — satu origin, tanpa CSP pihak ketiga.

**Why per-job soffice profile?**
LibreOffice headless memakai profil user di `~/.config`; konversi paralel bisa deadlock rebutan lock. Setiap job memakai profil sendiri → terisolasi, dibersihkan di `finally`. Argumen WAJIB satu token `-env:UserInstallation=file:///tmp/cpdf_{job}_lo` (strip TUNGGAL, nilai menyatu via `=`): bentuk `--env:` dua-strip atau nilai token terpisah ditolak LibreOffice (`Error in option`) → semua konversi 422. Itu regresi prod 2026-09 yang sudah diperbaiki; dikunci `tests/test_convert_cmd.py`.

---

## Production Notes & Troubleshooting

- **Login returns 500** → check Cloud SQL is running. `infra/setup.sh` leaves
  the instance with `--activation-policy NEVER` (it can silently STOP). Verify:
  `gcloud sql instances describe sulap-db --format='value(state)'` → must be `RUNNABLE`.
  Start it and keep it on: `gcloud sql instances patch sulap-db --activation-policy ALWAYS`.
- **Login hangs "pending"** → you are on the wrong host. CORS + the Google OAuth
  console authorize exactly **one origin** (`FRONTEND_URL`). Access the app only via
  the canonical service URL (`gcloud run services describe sulap --format='value(status.url)'`),
  not the legacy `<service>-<project-number>...run.app` alias.
- **First deploy never auto-created tables** — `Base.metadata.create_all` runs once at
  startup and is non-fatal; if the DB was down at boot, tables are missing. Restart the
  revision after the DB is `RUNNABLE`, or create tables manually.

## License

Internal use only — Bank Sahabat Sampoerna © 2026.

Third-party libraries under their respective licenses: MIT, Apache 2.0, BSD, MPL 2.0, PostgreSQL License.
