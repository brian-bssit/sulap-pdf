# Runbook insiden SULAP PDF

Layanan: Cloud Run `sulap` (region `asia-southeast2`), DB Cloud SQL `sulap-db`. Perintah memakai
`--project bss-sandbox-project-1`; sesuaikan bila proyek berbeda. Metrik dan alert: [monitoring.md](monitoring.md).

## Langkah awal untuk insiden apa pun
1. Minta user menyebut **request id** (header `X-Request-ID` pada respons, atau waktu + email). Cari di Cloud Logging:
   `resource.type="cloud_run_revision" AND resource.labels.service_name="sulap" AND jsonPayload.request_id="<id>"`
2. Cek `GET /api/ready` (lewat IAP): `db`, `qpdf`, `libreoffice` harus `true`.
3. Cek revisi aktif dan error terbaru: `gcloud run services describe sulap --region asia-southeast2` dan
   log `severity>=ERROR`.
4. Catat: waktu mulai, gejala, dampak (berapa user), tindakan, waktu pulih.

## Gejala → penyebab → tindakan
| Gejala | Penyebab umum | Tindakan |
|---|---|---|
| Login 500 | Cloud SQL `STOPPED` | `gcloud sql instances describe sulap-db --format='value(state)'` harus `RUNNABLE`. Jika tidak: `gcloud sql instances patch sulap-db --activation-policy ALWAYS`. |
| Login menggantung ("pending") | Akses lewat host yang salah (bukan URL kanonik) | Pakai `gcloud run services describe sulap --format='value(status.url)'`. CORS dan OAuth hanya mengizinkan satu origin (`FRONTEND_URL`). |
| Login ditolak 403 "Akun tidak diizinkan" | Email di luar `ALLOWED_EMAIL_DOMAINS` atau `email_verified` palsu | Normal untuk akun non-korporat. Lihat `audit_logs` (`GOOGLE_LOGIN` + `FAILED`). |
| Deploy merah / revisi baru gagal start | Container menjalankan `alembic upgrade head` lebih dulu; DB tak terjangkau atau migrasi gagal | Revisi lama tetap melayani. Pastikan DB `RUNNABLE`, baca log startup, deploy ulang. Rollback skema: lihat `infra/harden.md` §3. |
| User melapor 429 | Kuota 10/menit atau 200/hari per user tercapai | Cek `audit_logs` (`RATE_LIMITED`, `user_id`). Pesan memuat `Retry-After`. Ubah `RATE_LIMIT_PER_MIN` / `QUOTA_PER_DAY` hanya bila ada alasan sah. |
| 413 saat unggah | File > 30 MB (atau total gabung > 30 MB) | Normal. Sarankan kompres/pecah dulu. |
| 422 "PDF terkunci password" | PDF berenkripsi | Normal. Minta user membuka kunci dulu (fitur Unlock belum tersedia). |
| 422 "PDF rusak" | Berkas korup | Normal. Minta file asli ulang. |
| Konversi dokumen lambat / 504 | LibreOffice butuh ±4–6 dtk per dokumen; antrean di instance | Lihat [sla.md](sla.md). Jika berulang: naikkan `max-instances` (keputusan kapasitas, bukan perbaikan kode). |
| 5xx melonjak | Bug rilis, DB, atau kehabisan memori | Bandingkan revisi (`gcloud run revisions list`). Rollback: `gcloud run services update-traffic sulap --to-revisions <revisi-lama>=100`. |
| `/api/ready` 503 | `db:false` (DB turun) atau binary hilang dari image | `db:false` → ikuti baris "Login 500". Binary hilang → image rusak, rollback revisi. |
| Disk `/tmp` penuh | Berkas yatim (jarang) | Sweeper membersihkan `cpdf_*` tiap 5 menit (umur > 15 menit). Restart revisi bila perlu. |

## Setelah insiden
- Tulis ringkasan singkat (garis waktu, akar masalah, perbaikan) dan simpan di tempat yang disepakati tim.
- Bila ada data pengguna yang mungkin terekspos: ikuti prosedur pelaporan insiden internal bank (di luar dokumen ini).
