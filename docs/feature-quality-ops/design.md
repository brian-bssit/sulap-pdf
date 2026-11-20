# Design — Quality & Operations

## Architecture
```
Request → RequestContextMiddleware (request_id, mulai timer, contextvars)
        → ... handler ...
        → JsonFormatter → stdout → Cloud Logging → log-based metrics → alert
GET /api/ready → cek DB + which(qpdf, soffice, tesseract)
Frontend: strings.ts (kamus) + hooks/komponen kecil + Vitest/Playwright
```

## Components & Interfaces

### R5 Observabilitas
- `middleware/request_context.py` (baru): `contextvars.ContextVar request_id`; baca `X-Request-ID` masuk bila ada, jika tidak `uuid4().hex[:12]`; set di respons.
- `logging_setup.py` (baru): `JsonFormatter` (stdlib `logging`, `json.dumps`) memuat `severity` (kunci yang dipahami Cloud Logging), `message`, `request_id`, `user_id`, `tool`. Dipanggil di `lifespan` menggantikan `basicConfig`.
- `middleware/origin.py`: tambah `GET /ready` di samping `/health` (jangan ubah `/health`).
- Metrik/alert: `docs/ops/monitoring.md` berisi definisi filter log + perintah `gcloud logging metrics create` / `alpha monitoring policies create` untuk dijalankan manusia.

### R6 Test
- `backend/tests/fixtures/` dibangkitkan skrip `tools/make_fixtures.py` (pikepdf/pypdf, tanpa berkas biner besar di git; 200 halaman dihasilkan saat test via fixture pytest `session`).
- `tests/integration/test_<tool>.py` memakai `TestClient` + override dependency `get_current_user`/`get_db` (stub). `pytest.mark.skipif(not shutil.which(...))`.
- `loadtest/locustfile.py` + `loadtest/README.md` (login via dev-login lokal; jangan arahkan ke produksi tanpa izin).

### R1/R2 Frontend UX & i18n
- `lib/strings.ts`: `export const t = { compress: { title: "...", ... } }` dipakai semua komponen; ganti literal sedikit demi sedikit per tool.
- `lib/upload.ts`: pembungkus axios `onUploadProgress` → callback persen; dipakai `api.ts` consumer. Fase "memproses" setelah 100%.
- Compress level: backend terima `level` ∈ {low, balanced, high} → argumen qpdf (`--compression-level` 3/6/9, `--object-streams` generate/disable, `--recompress-flate`). Tetap stateless.
- Pratinjau: komponen `PdfPreview` (pdf.js halaman 1, canvas).
- Dark mode: Tailwind `darkMode: "media"`; token warna di `globals.css`. Aksesibilitas: audit manual + `@axe-core/playwright`.
- Perubahan UI memakai `/anti-slop-frontend` (dial 5/10) sebelum menulis.

### R3 Refactor EditOverlayTool
Langkah aman: (1) tulis test karakterisasi untuk fungsi serialisasi operasi (ekstrak fungsi murni dulu), (2) pindahkan ke `components/edit/`: `useOverlayState.ts` (state+undo), `OverlayCanvas.tsx`, `PropertyPanel.tsx`, `serialize.ts`, (3) `EditOverlayTool.tsx` tinggal perakit. Tanpa perubahan perilaku/visual; satu commit logis per langkah.

### R4 Tooling frontend
`devDependencies`: `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test`, `@axe-core/playwright` (semua MIT/Apache). Skrip `test`, `test:e2e`. Playwright memakai backend lokal + `DEV_LOGIN_ENABLED`.

### R8 Kebersihan
`APP_NAME` default → "SULAP PDF"; cari string "CloudPDF" di frontend/docs; jangan sentuh `cpdf_`, `cpdf_token`, logger `cloudpdf`.

### R7, R9 Dokumen
`docs/ops/{runbook,raci,sla,retensi-audit,dpia-ringkas,dr}.md`. Runbook memuat gejala yang sudah dikenal dari README (login 500 → Cloud SQL, login pending → host salah, tabel tak ada). Restore drill: `gcloud sql instances clone sulap-db sulap-db-drill --point-in-time ...` lalu hapus.

## Data Models
Tidak ada.

## Error Handling
| Skenario | Perilaku |
|---|---|
| `/ready` DB turun | 503 (Cloud Run tetap hidup via `/health`) |
| Binary hilang di image | 503 `/ready` + alert; test integrasi dilaporkan "tidak tersedia" bukan lulus |
| Upload progres tak tersedia | fallback spinner |
| Test karakterisasi gagal saat refactor | berhenti, perbaiki dulu, tidak lanjut |
| Locust saturasi | catat titik jenuh; tidak mengubah kapasitas (di luar lingkup) |
