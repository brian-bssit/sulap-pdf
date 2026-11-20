# Uji beban (Locust)

Pakai: lihat docstring [locustfile.py](locustfile.py). Alat ini terpisah dari aplikasi (tidak masuk image).
**Jangan arahkan ke produksi** tanpa izin tertulis; butuh `DEV_LOGIN_ENABLED=true` dan kuota dimatikan
(`RATE_LIMIT_PER_MIN=0 QUOTA_PER_DAY=0`) agar yang terukur adalah pemrosesan, bukan pembatas kuota.

## Laporan awal (lokal, 2026-11-20) — BUKAN angka produksi
Lingkungan: MacBook Apple Silicon, satu proses uvicorn, Postgres 16 lokal, qpdf + LibreOffice 26.2 asli,
file kecil (1–3 halaman; rearrange 100 halaman; convert `.txt` ±10 byte), tanpa jaringan sungguhan.
Cloud Run (2 vCPU, concurrency 1, maks 5 instance) berperilaku berbeda; pakai ini hanya untuk
membandingkan tool satu sama lain dan mendeteksi regresi, bukan untuk kapasitas.

| Tool | 5 user, 45 s — p50 / p95 (ms) | 20 user, 45 s — p50 / p95 (ms) |
|---|---|---|
| compress | 33 / 62 | 140 / 930 |
| merge (2 file) | 28 / 84 | 84 / 980 |
| remove-pages (3 hlm) | 16 / 29 | 75 / 780 |
| rearrange (100 hlm) | 87 / 370 | 390 / 1400 |
| convert (LibreOffice, `.txt`) | 3600 / 4400 | 5300 / 6500 |
| total request / gagal | 140 / 0 | 445 / 0 |
| throughput | 3,2 req/s | 10,0 req/s |

Pengamatan:
- Nol kegagalan dan tidak ada sisa `/tmp/cpdf_*` setelah beban berhenti (diperiksa).
- `convert` mendominasi: ≈3,6 s per dokumen bahkan untuk teks sepuluh byte (start LibreOffice + profil baru
  per job), naik ke 5,3 s saat 20 user. Ini batas praktis per instance; kapasitas bankwide untuk konversi
  ditentukan oleh jumlah instance, bukan optimasi kode tool PDF.
- Tool berbasis pypdf/qpdf tetap < 1,5 s di p95 pada 20 user lokal; titik jenuh CPU lokal belum tercapai.
- Belum diukur: file besar mendekati 30 MB, dokumen Office kompleks, atau beban di Cloud Run.
