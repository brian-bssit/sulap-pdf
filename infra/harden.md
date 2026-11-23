# Hardening infra (dijalankan manusia)

Perintah di sini mengubah infrastruktur GCP; tidak dijalankan otomatis. Ganti `PROJECT`/`REGION` sesuai
(`bss-sandbox-project-1`, `asia-southeast2`). Ingress: layanan sudah di belakang IAP → tidak ada langkah.

## 1. Egress jaringan service (konversi dokumen Office)
Tujuan: kalau dokumen berbahaya lolos dari pembatasan LibreOffice, ia tak bisa menghubungi internet/host lain.
Aplikasi hanya butuh: Cloud SQL, `accounts.google.com`/`www.googleapis.com` (verifikasi ID token Google).

```bash
# Direct VPC egress + semua egress lewat VPC (default: private-ranges-only)
gcloud run services update sulap --region REGION --project PROJECT \
  --network NETWORK --subnet SUBNET --vpc-egress all-traffic

# Tolak egress default, izinkan hanya yang perlu
gcloud compute firewall-rules create sulap-egress-deny --network NETWORK --direction EGRESS \
  --priority 65000 --action DENY --rules all --destination-ranges 0.0.0.0/0
gcloud compute firewall-rules create sulap-egress-allow-google --network NETWORK --direction EGRESS \
  --priority 1000 --action ALLOW --rules tcp:443 --destination-ranges <rentang Google APIs / Private Google Access>
```
Catatan: Cloud SQL via IP publik perlu diizinkan atau dipindah ke private IP / Cloud SQL connector.
Uji di lingkungan non-produksi dulu: login Google, upload, convert harus tetap jalan.

## 2. Salinan audit immutable (Cloud Logging → bucket terkunci)
Di production aplikasi menulis tiap audit sebagai baris log JSON `event="audit"` (selain tabel `audit_logs`).
```bash
gcloud storage buckets create gs://PROJECT-sulap-audit --location REGION --uniform-bucket-level-access
gcloud storage buckets update gs://PROJECT-sulap-audit --retention-period=<detik sesuai kebijakan retensi>
# Kunci retensi HANYA setelah nilai disetujui (tidak bisa dibatalkan):
# gcloud storage buckets update gs://PROJECT-sulap-audit --lock-retention-period
gcloud logging sinks create sulap-audit-sink storage.googleapis.com/PROJECT-sulap-audit \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="sulap" AND jsonPayload.event="audit"'
# Beri service account sink hak objectCreator pada bucket (alamat ada di output perintah di atas).
```
Retensi resmi belum ditetapkan (lihat docs/feature-quality-ops). Jangan kunci sebelum disetujui.

## 3. Migrasi skema (Alembic)
Container menjalankan `alembic upgrade head` sebelum uvicorn (lihat Dockerfile). Konsekuensi:
- DB tak terjangkau saat start → container gagal start → Cloud Run menolak revisi baru; revisi lama tetap melayani.
- Instance paralel dilindungi `pg_advisory_xact_lock`.
- Rollback skema: `alembic downgrade 0001` (hanya revisi 0002). Baseline sengaja tidak bisa di-downgrade.
- Deploy pertama setelah rilis ini: tabel produksi sudah ada → 0001 dilewati (idempoten), 0002 menambah kolom `detail` + indeks.

## 4. Cloud SQL
Instance existing: jalankan `infra/setup.sh` atau hanya blok `gcloud sql instances patch` di dalamnya
(ALWAYS, backup 18:00, PITR, retensi 14, deletion protection).
`setup.sh` masih membuka `authorized-networks=0.0.0.0/0` (komentar "sandbox") — ganti ke Cloud SQL
connector / private IP sebelum dianggap siap produksi.
