# Requirements — Quality & Operations (P3)

## Overview
Kualitas UX/kode dan kesiapan operasi: bisa diamati, diuji, dipulihkan, dan diaudit divisi risiko. Semua P3 disetujui.

## Glossary
- **RTO/RPO**: target waktu/data pemulihan.
- **Log terstruktur**: satu baris JSON per kejadian dengan `request_id`.
- **Readiness**: cek siap-layani (DB + binary) berbeda dari liveness.

## Requirements

### R1 UX
- Compress punya pilihan level (Rendah/Seimbang/Tinggi) dan menampilkan penghematan %.
- Semua tool: progres upload (persen) dan status "sedang diproses"; pratinjau hasil (halaman pertama) sebelum unduh untuk tool yang menghasilkan PDF.
- Layout dipakai nyaman di ≥360 px; dark mode mengikuti `prefers-color-scheme`.
- Aksesibilitas: fokus terlihat, label form, dropzone bisa keyboard, kontras ≥ AA, `aria-live` untuk status; diperiksa dengan axe di Playwright.
- WHEN error THEN pesan dalam Bahasa Indonesia, tindakan jelas.

### R2 i18n
- Satu bahasa UI konsisten (Bahasa Indonesia); semua string di `lib/strings.ts` (kamus), tanpa pustaka i18n.

### R3 Refactor EditOverlayTool
- `EditOverlayTool.tsx` (1099 baris) dipecah: hook state/histori, kanvas, panel properti, serialisasi operasi; perilaku identik (dibuktikan test serialisasi sebelum & sesudah).

### R4 Test frontend
- Vitest untuk `lib/*` dan logika murni (serialisasi overlay, rentang halaman). Playwright untuk alur: login dev, compress, merge, edit, admin audit.

### R5 Observabilitas
- Log JSON dengan `request_id` (header `X-Request-ID` dikembalikan), `user_id`, `tool`, `status`, `duration_ms`, ukuran.
- Readiness `GET /api/ready`: DB `SELECT 1` + `qpdf`/`soffice`/`tesseract` ada; liveness `/api/health` tetap.
- Metrik log-based di Cloud Monitoring + alert: 5xx rate, latensi p95, 429 melonjak, readiness gagal. Definisi dan perintah di `docs/ops/monitoring.md`.

### R6 Test integrasi & beban
- Fixture PDF: normal, korup, terenkripsi, 200 halaman, scan; test integrasi per tool memakai `qpdf`/LO sungguhan (di-skip bila binary tak ada, dilaporkan jelas).
- Uji beban dengan Locust (MIT); **bukan k6 (AGPL)**. Laporan: p95 per tool, titik jenuh.

### R7 Dokumen operasional
- `docs/ops/`: runbook insiden, RACI, SLA/SLO, kebijakan retensi audit, ringkasan DPIA/PDP, klasifikasi data. Draf teknis; persetujuan Compliance/Legal oleh manusia.

### R8 Kebersihan repo
- Satu nama produk: **SULAP PDF** (UI, `APP_NAME` default, README, docs). Prefix `/tmp/cpdf_` dan nama cookie `cpdf_token` TETAP (mengganti = logout massal + risiko sweeper).
- `.claude/plan.md` dan `prd-init.md` dipindah ke `docs/archive/` atau dihapus bila usang.

### R9 Disaster recovery
- Dokumen RTO/RPO (usulan: RTO 4 jam, RPO 15 menit via PITR), prosedur restore diuji sekali ke instance sementara, salinan backup lintas region (`asia-southeast1`) atau ekspor terjadwal.

## Open Questions
1. Nilai RTO/RPO resmi dari manajemen risiko?
2. Region cadangan yang diperbolehkan regulasi data?
3. Siapa pemilik layanan (RACI) dan on-call?
