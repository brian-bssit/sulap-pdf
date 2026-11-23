# Pekerjaan keamanan yang di-HOLD (keputusan pemilik, 2026-11-20)

Sumber: `docs/security/baseline-checklist-evaluation.md`. Dikerjakan nanti; jangan dimulai tanpa instruksi.

1. **Tutup Cloud SQL dari internet (butir 70, K-17)** — ganti `authorized-networks 0.0.0.0/0` dengan Cloud SQL connector atau private IP.
   Implikasi: perubahan VPC, akses migrasi Alembic dari Cloud Build, kemungkinan downtime singkat, biaya konektor.
2. **Antivirus (butir 71, K-18)** — ClamAV di image (+≈300 MB, pembaruan signature, +detik per berkas, false positive) atau AV level container/GCP.
   Satu langkah sebelum `save_upload` (lihat `docs/feature-bankwide-hardening/requirements.md` R7).
3. **CSP tanpa `'unsafe-inline'` (butir 2, K-9)** — hash script saat build Next.js static export; risiko halaman kosong/login Google gagal bila salah.
   Kompensasi saat ini: React escaping, tanpa input HTML, IAP.
4. **Upgrade Next.js 14.2.35 → versi aman terbaru (mayor 15/16)** — `npm audit --omit=dev` menandai Next (critical), tetapi seluruh advisory-nya
   menyangkut *runtime server* Next (Image Optimizer, Server Components/Actions, rewrites, middleware, WebSocket upgrade). SULAP memakai
   `output: "export"` (file statis, tanpa server Next), jadi tidak terdampak. Upgrade mayor = risiko regresi tinggi → pekerjaan terpisah.
   Sementara: job `audit` CI untuk npm sebaiknya informatif atau memakai `--omit=dev` dengan pengecualian Next yang didokumentasikan.
