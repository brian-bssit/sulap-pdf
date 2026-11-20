# Tasks — Quality & Operations

## Gelombang A — Observabilitas & kebersihan
- [x] A1 `logging_setup.py` + `request_context.py` + pasang di `main.py` + test (JSON valid, request_id konsisten) [Req 5]
- [x] A2 `/api/ready` + test (DB mock gagal → 503) [Req 5]
- [x] A3 `docs/ops/monitoring.md` (metrik & alert, perintah gcloud untuk manusia) [Req 5]
- [x] A4 Satu nama produk; pindah/hapus `.claude/plan.md`, `prd-init.md` [Req 8]
- [x] **Checkpoint A** — pytest lulus

## Gelombang B — Test
- [x] B1 `tools/make_fixtures.py` + fixture pytest (normal, korup, terenkripsi, 200 hlm, scan) [Req 6]
- [x] B2 Test integrasi tiap tool lama (compress, merge, rearrange, remove-pages, convert, edit-overlay) dgn skip eksplisit [Req 6]
- [x] B3 Vitest + test `lib/*`; Playwright + alur login/compress/merge/admin [Req 4]
- [x] B4 `loadtest/locustfile.py` + laporan awal (lokal) [Req 6]
- [x] **Checkpoint B** — `pytest`, `npm test`, `npm run test:e2e` lulus

## Gelombang C — Frontend
- [x] C1 `lib/strings.ts`; migrasikan semua komponen ke kamus (satu tool per commit) [Req 2]
- [x] C2 Karakterisasi + pecah `EditOverlayTool.tsx` (langkah 1–3 di design) [Req 3]
- [x] C3 Compress level (backend arg + UI) [Req 1]
- [x] C4 `lib/upload.ts` progres + `PdfPreview` + dark mode + responsif 360 px [Req 1]
- [x] C5 Audit a11y (axe di Playwright) dan perbaiki temuan [Req 1]
- [x] **Checkpoint C** — lint, tsc, build, test lulus; cek manual di browser (desktop & 375 px)

## Gelombang D — Dokumen ops & DR
- [ ] D1 `docs/ops/runbook.md`, `raci.md` (isi dengan placeholder pemilik yang eksplisit "BELUM DITETAPKAN"), `sla.md`, `retensi-audit.md` [Req 7]
- [ ] D2 `dpia-ringkas.md` + klasifikasi data (draf untuk Compliance) [Req 7]
- [ ] D3 `dr.md`: RTO/RPO usulan, prosedur restore & backup lintas region; restore drill dijalankan manusia [Req 9]
- [ ] D4 `@verifier` bukti penuh; README tautkan `docs/ops/`

## Catatan gelombang B
- Fixture dibangkitkan (`backend/tools/make_fixtures.py`) — scan = PDF gambar-saja; `tests/conftest.py` + `tests/integration/`.
- Test integrasi menemukan dan memperbaiki 3 bug nyata: PDF rusak → 500 (merge/rearrange/remove-pages; kini 422 via `open_reader`),
  op teks tanpa `font`/`font_size` → KeyError 500 di edit-overlay (default kini tersimpan di validator), PDF 0 halaman di edit-overlay → 422.
- Vitest (jsdom) hanya untuk logika murni `src/lib/*`; `@testing-library/react` belum ditambahkan (belum ada test komponen) — YAGNI.
- Playwright memakai backend sungguhan: `E2E_DATABASE_URL=… PYTHON=… PW_CHANNEL=chrome npm run test:e2e` (CI: Chromium bawaan, `playwright install --with-deps chromium`).
- Uji beban: `loadtest/` (Locust). Laporan lokal di `loadtest/README.md`.

## Catatan gelombang C
- Pratinjau-sebelum-unduh hanya untuk Kompres, Gabung, Konversi (hasil tak terlihat sebelumnya). Atur Halaman, Hapus Halaman, Edit
  sudah WYSIWYG lewat thumbnail/kanvas, jadi tetap unduh otomatis (+ progres unggah). Hasil kompresi yang tak lebih kecil dikembalikan apa adanya.
- Dark mode lewat CSS variable di `tailwind.config.ts` (kelas yang ada otomatis berbalik; teks berwarna punya skala terpisah). Tanpa tombol manual (YAGNI).
- Font Inter (CDN Google, terblokir CSP baru) diganti Plus Jakarta Sans self-host (OFL-1.1).
- A11y: axe WCAG 2.1 AA lulus di 11 layar x terang/gelap; reorder via keyboard (Gabung, Atur Halaman); tes lebar 360 px tanpa scroll horizontal.
- `@testing-library/react` tetap tidak ditambahkan: perilaku komponen dibuktikan lewat Playwright pada backend sungguhan.
