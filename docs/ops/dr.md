# Pemulihan bencana (DR) SULAP PDF

> **RTO/RPO di bawah adalah usulan teknis**, bukan angka resmi dari manajemen risiko. Region cadangan dan pemilik
> prosedur belum ditetapkan. Perintah dijalankan manusia; belum diuji terhadap GCP.

## Yang perlu dipulihkan
| Komponen | Stateful? | Cara pulih |
|---|---|---|
| Cloud Run `sulap` | Tidak (stateless) | Deploy ulang image dari Artifact Registry atau rollback revisi |
| Image | Ya (registri) | Build ulang dari `main` (Cloud Build trigger `sulap-deploy`) |
| Cloud SQL `sulap-db` | **Ya** (`users`, `audit_logs`) | Backup harian + PITR (lihat bawah) |
| Secret Manager | Ya | Versi secret tersimpan; pulihkan versi sebelumnya |
| Kode | Ya | Repositori GitHub |

## Target usulan
| Metrik | Usulan | Dasar |
|---|---|---|
| RPO (kehilangan data maks) | 15 menit | PITR (WAL) aktif; backup harian 18:00, 14 salinan |
| RTO (waktu pulih) | 4 jam | Clone DB + deploy ulang + verifikasi |

## Cadangan yang sudah dikonfigurasi (`infra/setup.sh`)
`activation-policy ALWAYS`, backup otomatis harian 18:00, PITR aktif, retensi 14 backup, deletion protection.
Instance lama disamakan dengan blok `gcloud sql instances patch` di skrip yang sama.

## Prosedur restore (contoh, jalankan manusia)
1. **Putuskan titik pemulihan** (waktu tepat sebelum kerusakan, UTC).
2. **Clone ke instance baru** (jangan menimpa yang ada):
   ```bash
   gcloud sql instances clone sulap-db sulap-db-restore \
     --point-in-time '2026-11-20T03:00:00Z' --project PROJECT
   ```
3. **Periksa data** di instance baru (jumlah baris `users`, `audit_logs`, `alembic_version` = `0002`).
4. **Arahkan aplikasi**: perbarui secret `sulap-db-url` ke instance baru, lalu deploy ulang revisi (container menjalankan
   `alembic upgrade head` saat start; skema sudah head sehingga tidak berubah).
5. **Verifikasi**: login, satu operasi tiap tool, `GET /api/ready` = READY, baris audit baru bertambah.
6. **Bersihkan**: setelah stabil, hapus instance rusak dan instance latihan (deletion protection harus dimatikan dulu).

## Cadangan lintas region (belum ada — keputusan dibutuhkan)
Layanan hanya di `asia-southeast2`. Bila region itu tidak tersedia, tanpa cadangan lintas region pemulihan tertunda
sampai region pulih. Opsi:
1. **Ekspor terjadwal** `gcloud sql export sql` ke bucket di region lain (murah; RPO = interval ekspor, bukan 15 menit).
2. **Read replica lintas region** (RPO kecil; biaya dan kompleksitas lebih besar).
3. Terima risiko (data hanya akun user dan log audit; dokumen tidak disimpan) dan hanya jaga salinan audit di bucket
   lintas region (lihat [retensi-audit.md](retensi-audit.md)).
Region yang diizinkan regulasi data harus ditentukan Compliance sebelum memilih.

## Latihan restore
Jalankan sekali sebelum dianggap siap produksi, lalu berkala (usulan: tiap 6 bulan). Catat waktu tiap langkah untuk
membuktikan RTO. Hapus instance latihan setelahnya.

## Yang tidak perlu dipulihkan
Dokumen pengguna (tidak pernah disimpan) dan berkas `/tmp` (sementara).
