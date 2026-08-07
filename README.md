# SULAP PDF

Solusi Universal, Lengkap, Aman, Proses PDF — internal tool Bank Sahabat Sampoerna.

## Fitur

| Tool | Deskripsi |
|:---|:---|
| **Compress PDF** | Kompresi PDF via `qpdf` (recompress-flate, object-streams) |
| **Merge PDF** | Gabung 2–10 file PDF via `pypdf` |
| **Rearrange PDF** | Atur ulang, hapus, rotasi halaman PDF via `pypdf` |
| **Convert to PDF** | Konversi dokumen (DOCX, XLSX, PPTX, ODT, RTF, TXT, HTML, CSV, dll.) ke PDF via LibreOffice headless |

## Stack

- **Backend:** FastAPI (Python 3.12), SQLAlchemy async, PostgreSQL
- **Frontend:** Next.js 14 static export, Tailwind CSS
- **Auth:** Google OAuth (GIS popup flow), JWT cookie
- **PDF:** pypdf (BSD), qpdf (Apache 2.0), LibreOffice (MPL 2.0)
- **Infra:** Cloud Run, Cloud Build, Artifact Registry, Secret Manager

## Prasyarat

- Docker (atau Python 3.12 + Node.js 22 untuk dev lokal)
- PostgreSQL 16
- Google OAuth client ID (Google Cloud Console)
- LibreOffice (untuk fitur Convert to PDF — terinstall di Docker image, opsional di dev lokal)

## Quick Start (Docker)

```bash
cp .env.example .env
# Isi DATABASE_URL, SECRET_KEY, GOOGLE_CLIENT_ID, FRONTEND_URL

docker compose up -d
# App: http://localhost:8080
```

## Development

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080

# Frontend
cd frontend
npm install
npm run dev
```

## Deployment

Push ke `main` branch → Cloud Build trigger auto-deploy ke Cloud Run.

```
gcloud builds submit --config=cloudbuild.yaml .
```

Secret Manager: `sulap-db-url`, `sulap-jwt-secret`, `sulap-google-id`, `sulap-frontend-url`

## Lisensi

Internal use only — Bank Sahabat Sampoerna © 2026.
