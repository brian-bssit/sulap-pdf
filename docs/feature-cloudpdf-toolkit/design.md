# SULAP PDF — Design

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      GCP Cloud Run                        │
│                                                           │
│  Browser ──► Cloud Run Service (FastAPI + Static Frontend)│
│                │                                          │
│                ├── /api/auth/google/login    (OAuth)      │
│                ├── /api/auth/google/callback (OAuth)      │
│                ├── /api/auth/logout                      │
│                ├── /api/auth/me                          │
│                ├── /api/pdf/merge          (Long-Running) │
│                ├── /api/pdf/compress       (Long-Running) │
│                ├── /api/pdf/rearrange      (Long-Running) │
│                ├── /api/admin/audit-logs   (Admin)        │
│                ├── /api/admin/audit-logs/csv (Admin)     │
│                ├── /api/health             (Health Check) │
│                ├── /                (Static Frontend SPA)  │
│                │                                          │
│                ├── /tmp              (Ephemeral files)    │
│                └── Background thread (Orphan cleanup/5m)  │
│                                                           │
│  Cloud SQL ──── PostgreSQL 16                             │
│                   ├── users                               │
│                   └── audit_logs                          │
│                                                           │
│  Secret Manager ─── GOOGLE_CLIENT_SECRET                  │
│                     SECRET_KEY (JWT)                      │
│                     DATABASE_URL                          │
└──────────────────────────────────────────────────────────┘
```

**Single container, single Cloud Run service.** FastAPI serves API + static frontend build. No microservices, no message queue, no object storage.

## Component Design

### Backend (FastAPI)

```
backend/
├── main.py               # App factory, lifespan, middleware, orphan cleanup thread
├── config.py              # pydantic-settings from env vars
├── router.py              # APIRouter aggregation
├── auth/
│   ├── __init__.py
│   ├── oauth.py           # Authlib Google OAuth setup + callback
│   ├── jwt.py             # JWT encode/decode/validate
│   └── dependencies.py    # get_current_user dependency
├── pdf/
│   ├── __init__.py
│   ├── merge.py           # pypdf.PdfWriter append
│   ├── compress.py        # subprocess qpdf
│   └── rearrange.py       # pypdf page reorder/delete/rotate
├── db/
│   ├── __init__.py
│   ├── database.py        # SQLAlchemy async engine + session
│   ├── models.py          # User, AuditLog
│   └── queries.py         # user CRUD, audit CRUD
├── audit.py               # log_audit() helper
├── admin/
│   └── router.py          # Admin audit log endpoints
├── middleware/
│   ├── origin.py          # Origin/Referer validation
│   └── error_handler.py   # Global exception → JSON
└── static/                # Built frontend (from frontend build)
```

### Frontend (Next.js 14 → Static Export)

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Landing / Login
│   │   └── dashboard/
│   │       ├── page.tsx        # Dashboard (protected)
│   │       ├── merge/page.tsx
│   │       ├── compress/page.tsx
│   │       └── rearrange/page.tsx
│   ├── admin/
│   │   └── audit-logs/page.tsx  # Audit log table + filters + CSV export
│   ├── components/
│   │   ├── LoadingOverlay.tsx   # Full-screen spinner
│   │   ├── GoogleSignIn.tsx     # OAuth button
│   │   ├── Navbar.tsx
│   │   ├── PDFThumbnail.tsx     # Halaman preview untuk rearrange
│   │   └── AuditTable.tsx       # Tabel audit + filter + paginasi
│   ├── lib/
│   │   ├── api.ts              # Axios instance, 600s timeout
│   │   └── auth.ts             # Auth context provider
│   └── middleware.ts            # Protected route check (cookie existence)
├── next.config.js               # output: 'export'
└── package.json
```

**Frontend di-build jadi static files**, disajikan oleh FastAPI `StaticFiles` mount. Tidak perlu Node.js runtime di Cloud Run.

## Data Models (PostgreSQL)

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub      VARCHAR(255) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    display_name    VARCHAR(255) NOT NULL,
    picture_url     TEXT,
    role            VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user','admin')),
    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID REFERENCES users(id),
    user_email      VARCHAR(255) NOT NULL,

    action          VARCHAR(50) NOT NULL CHECK (action IN (
                      'GOOGLE_LOGIN','MERGE','COMPRESS','REARRANGE'
                    )),
    source_files    TEXT[],
    result_file     VARCHAR(255),
    file_sizes      BIGINT[],
    result_size     BIGINT,
    processing_ms   INT,
    status          VARCHAR(20) DEFAULT 'SUCCESS' CHECK (status IN (
                      'SUCCESS','FAILED','CANCELLED_BY_CLIENT'
                    )),
    error_message   TEXT,

    ip_address      INET,
    user_agent      TEXT,
    executed_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_date ON audit_logs(executed_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_status ON audit_logs(status);
```

## API Design

### Auth

| Method | Path | Auth | Response |
|:---|:---|:---|:---|
| `GET` | `/api/auth/google/login` | None | 302 → Google |
| `GET` | `/api/auth/google/callback` | None | 302 → `/dashboard` (Set-Cookie) |
| `POST` | `/api/auth/logout` | JWT | 200 (Clear-Cookie) |
| `GET` | `/api/auth/me` | JWT | `{id, email, display_name, picture_url, role}` |

### PDF (Long-Running)

| Method | Path | Auth | Input | Output |
|:---|:---|:---|:---|:---|
| `POST` | `/api/pdf/merge` | JWT | multipart: files[], order[] | `application/pdf` stream |
| `POST` | `/api/pdf/compress` | JWT | multipart: file, level | `application/pdf` stream |
| `POST` | `/api/pdf/rearrange` | JWT | multipart: file, operations[] | `application/pdf` stream |

### Admin

| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/api/admin/audit-logs` | JWT+admin | Paginated audit logs |
| `GET` | `/api/admin/audit-logs/csv` | JWT+admin | CSV export with filters |

Query params: `?user_id=, action=, status=, date_from=, date_to=, page=, per_page=20`

### System

| Method | Path | Auth | Description |
|:---|:---|:---|:---|
| `GET` | `/api/health` | None | `{"status":"UP","db":"connected"}` |

## PDF Processing Flow (with Disconnect Detection)

```
POST /api/pdf/compress
  │
  ├── 1. Validate JWT cookie → user_id
  ├── 2. Validate Origin/Referer header
  ├── 3. Validate file ≤ 30MB, file is PDF
  ├── 4. simpan ke /tmp/{uuid}_input.pdf
  │
  ├── 5. qpdf compress (dalam thread, polling is_disconnected)
  │      loop:
  │        if await request.is_disconnected():
  │           cleanup → audit(CANCELLED) → return 499
  │        subprocess.run(["qpdf", ...], timeout=540)
  │
  ├── 6. Baca /tmp/{uuid}_output.pdf → bytes
  ├── 7. INSERT audit_logs (SUCCESS, processing_ms, sizes)
  ├── 8. Bersihkan /tmp/{uuid}_*
  └── 9. StreamingResponse(bytes, media_type="application/pdf",
                            headers={"Content-Disposition": "attachment; filename=..."})
```

## Orphaned File Cleanup

Background thread di-start saat FastAPI lifespan `startup`:

```python
async def cleanup_orphaned_files():
    while True:
        await asyncio.sleep(300)  # 5 menit
        cutoff = time.time() - 900  # 15 menit
        for f in Path("/tmp").glob("cpdf_*"):
            if f.stat().st_mtime < cutoff:
                f.unlink(missing_ok=True)
```

## Error Handling

| Scenario | HTTP | User Message |
|:---|:---|:---|
| File > 30MB | 413 | "File terlalu besar. Maksimal 30 MB." |
| Bukan PDF (magic bytes) | 400 | "Format file tidak didukung." |
| PDF corrupt | 422 | "File PDF rusak atau tidak bisa diproses." |
| Timeout (10 menit) | 504 | "Proses timeout. Coba file lebih kecil." |
| Client disconnect | 499 | (no response body — client gone) |
| JWT expired / invalid | 401 | "Sesi habis. Silakan login kembali." |
| Bukan admin (akses /admin) | 403 | "Akses ditolak." |
| Invalid Google token | 401 | "Autentikasi Google gagal." |
| DB connection error | 503 | "Layanan sedang sibuk." |
| `/tmp` disk full | 507 | "Server kehabisan memori." |

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/cloudpdf
SECRET_KEY=<random-64-char-hex>
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
FRONTEND_URL=https://pdf.yourdomain.com

# Optional (defaults)
MAX_FILE_SIZE_MB=30
REQUEST_TIMEOUT_SECONDS=600
JWT_EXPIRY_DAYS=7
MAX_PAGES_REARRANGE=200
CLEANUP_INTERVAL_SECONDS=300
ORPHAN_AGE_SECONDS=900
LOG_LEVEL=INFO
```

## Dockerfile (Single Stage)

```dockerfile
# Stage 1: Frontend static build
FROM node:22-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Backend + frontend static files
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    qpdf curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY --from=frontend /app/out ./static
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

## Python Dependencies

```
fastapi==0.115.*
uvicorn[standard]==0.32.*
sqlalchemy[asyncio]==2.0.*
asyncpg==0.30.*
pydantic-settings==2.6.*
authlib==1.3.*
python-jose[cryptography]==3.3.*
pypdf==5.1.*
python-multipart==0.0.*
httpx==0.28.*          # Untuk test client
```

## GCP Resources

| Resource | Spec | Purpose |
|:---|:---|:---|
| Cloud Run | 4GB RAM, 2 CPU, concurrency=1, timeout=600s | App hosting |
| Cloud SQL | PostgreSQL 16, db-f1-micro, 10GB SSD | Users + audit logs |
| Secret Manager | 3 secrets | OAuth secret, JWT key, DB URL |
| Artifact Registry | Docker repo | Container images |
| Cloud Build | git trigger → build → deploy | CI/CD |

**Dihilangkan:** GCS buckets, Filestore, Redis, PubSub, VPC connector (gunakan Cloud SQL Auth Proxy built-in).

## JWT Cookie Specification

```
Set-Cookie: cpdf_token=<jwt>;
  HttpOnly;
  Secure;
  SameSite=Strict;
  Path=/api;
  Max-Age=604800
```

- `Path=/api` — cookie hanya dikirim ke endpoint API, tidak ke static file requests
- `SameSite=Strict` — mencegah CSRF entirely
- `HttpOnly` — tidak bisa dibaca JavaScript
- `Secure` — hanya via HTTPS
