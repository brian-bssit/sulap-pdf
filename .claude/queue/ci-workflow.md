# Usulan untuk manusia: CI + branch protection (Req R2, hardening)

Hook memblokir tulis ke `.github/workflows/`. Salin blok di bawah ke `.github/workflows/ci.yml`,
lalu di GitHub: Settings → Branches → rule untuk `main`:
- Require a pull request before merging
- Require status checks: `backend`, `frontend`, `audit`
- (Deploy tetap lewat trigger Cloud Build `sulap-deploy` saat merge ke `main`)

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  backend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12", cache: pip, cache-dependency-path: backend/requirements-dev.txt }
      - run: sudo apt-get update && sudo apt-get install -y --no-install-recommends qpdf
      - run: pip install -r requirements-dev.txt
      - run: python tools/build_font_data.py --check
      - run: PYTHONPATH=. python -m pytest -q tests
  frontend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: frontend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm test
      - run: npm run build
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install pip-audit && pip-audit -r backend/requirements.lock --require-hashes
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: cd frontend && npm audit --omit=dev --audit-level=high
```

Tambahan (job e2e, opsional sampai disetujui): service Postgres 16, `playwright install --with-deps chromium`, lalu
`E2E_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/e2e PYTHON=python npm run test:e2e`
(butuh backend dependency terpasang + qpdf + libreoffice di runner; tanpa PW_CHANNEL).

Catatan keamanan dependency: `npm audit --omit=dev` akan tetap melaporkan Next.js 14.2.35 (advisory runtime server; SULAP memakai static export). Jadikan job npm audit
informatif atau abaikan advisory Next sampai upgrade mayor dikerjakan (`security-holds.md` #4). `pip-audit` pada `requirements.lock` bersih.

Catatan: pin action ke SHA bila kebijakan bank mensyaratkan. `audit` bisa merah karena CVE
upstream; putuskan apakah wajib (required) atau informatif.

Tambahan job `backend-db` (tes Postgres dual control, `backend/tests/db`): service `postgres:16`, env
`TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/test`, lalu
`PYTHONPATH=. python -m pytest -q tests/db`. DB diisi ulang tiap tes (jangan diarahkan ke DB berisi data).
