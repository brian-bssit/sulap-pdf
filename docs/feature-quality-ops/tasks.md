# Tasks — Quality & Operations

## Gelombang A — Observabilitas & kebersihan
- [ ] A1 `logging_setup.py` + `request_context.py` + pasang di `main.py` + test (JSON valid, request_id konsisten) [Req 5]
- [ ] A2 `/api/ready` + test (DB mock gagal → 503) [Req 5]
- [ ] A3 `docs/ops/monitoring.md` (metrik & alert, perintah gcloud untuk manusia) [Req 5]
- [ ] A4 Satu nama produk; pindah/hapus `.claude/plan.md`, `prd-init.md` [Req 8]
- [ ] **Checkpoint A** — pytest lulus

## Gelombang B — Test
- [ ] B1 `tools/make_fixtures.py` + fixture pytest (normal, korup, terenkripsi, 200 hlm, scan) [Req 6]
- [ ] B2 Test integrasi tiap tool lama (compress, merge, rearrange, remove-pages, convert, edit-overlay) dgn skip eksplisit [Req 6]
- [ ] B3 Vitest + test `lib/*`; Playwright + alur login/compress/merge/admin [Req 4]
- [ ] B4 `loadtest/locustfile.py` + laporan awal (lokal) [Req 6]
- [ ] **Checkpoint B** — `pytest`, `npm test`, `npm run test:e2e` lulus

## Gelombang C — Frontend
- [ ] C1 `lib/strings.ts`; migrasikan semua komponen ke kamus (satu tool per commit) [Req 2]
- [ ] C2 Karakterisasi + pecah `EditOverlayTool.tsx` (langkah 1–3 di design) [Req 3]
- [ ] C3 Compress level (backend arg + UI) [Req 1]
- [ ] C4 `lib/upload.ts` progres + `PdfPreview` + dark mode + responsif 360 px [Req 1]
- [ ] C5 Audit a11y (axe di Playwright) dan perbaiki temuan [Req 1]
- [ ] **Checkpoint C** — lint, tsc, build, test lulus; cek manual di browser (desktop & 375 px)

## Gelombang D — Dokumen ops & DR
- [ ] D1 `docs/ops/runbook.md`, `raci.md` (isi dengan placeholder pemilik yang eksplisit "BELUM DITETAPKAN"), `sla.md`, `retensi-audit.md` [Req 7]
- [ ] D2 `dpia-ringkas.md` + klasifikasi data (draf untuk Compliance) [Req 7]
- [ ] D3 `dr.md`: RTO/RPO usulan, prosedur restore & backup lintas region; restore drill dijalankan manusia [Req 9]
- [ ] D4 `@verifier` bukti penuh; README tautkan `docs/ops/`
