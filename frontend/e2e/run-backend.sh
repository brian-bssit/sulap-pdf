#!/usr/bin/env bash
# Menjalankan backend untuk e2e: migrasi skema, sajikan static export (hasil `next build`), dev-login aktif.
set -euo pipefail
: "${E2E_DATABASE_URL:?isi E2E_DATABASE_URL=postgresql+asyncpg://user@host:port/db}"
cd "$(dirname "$0")/../../backend"
PY="${PYTHON:-python3}"
rm -rf static && mkdir static && cp -R ../frontend/out/. static/
export DATABASE_URL="$E2E_DATABASE_URL" DEV_LOGIN_ENABLED=true ENVIRONMENT=development \
  FRONTEND_URL=http://localhost:8765 RATE_LIMIT_PER_MIN=0 QUOTA_PER_DAY=0 IDLE_TIMEOUT_SECONDS="${IDLE_TIMEOUT_SECONDS:-20}" PYTHONPATH=.
"$PY" -m alembic upgrade head
exec "$PY" -m uvicorn main:app --port 8765
