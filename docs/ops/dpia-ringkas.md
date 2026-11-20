# Ringkasan DPIA dan klasifikasi data (DRAF untuk Compliance/Legal)

> Draf teknis dari tim pengembang. **Bukan penilaian resmi**; penilaian dampak (UU PDP) dan klasifikasi final
> ditetapkan oleh Compliance/Legal dan Information Security.

## 1. Gambaran pemrosesan
Karyawan mengunggah dokumen untuk dikompres, digabung, diatur ulang, dikonversi, atau dianotasi. Hasil dikirim kembali
ke browser. Tujuan: produktivitas kantor tanpa perangkat lunak lokal atau layanan PDF pihak ketiga di internet.

```
Browser ──HTTPS (IAP)──► Cloud Run (FastAPI)
                          ├─ /tmp (sementara, dihapus di akhir request; sweeper tiap 5 mnt untuk yatim)
                          ├─ qpdf / pypdf / pikepdf / LibreOffice (proses lokal, tanpa panggilan keluar)
                          └─ Cloud SQL: tabel users, audit_logs (tanpa isi dokumen)
```

## 2. Data yang diproses
| Data | Sumber | Disimpan? | Lokasi | Catatan |
|---|---|---|---|---|
| Isi dokumen | Unggahan user | **Tidak** (hanya di `/tmp` selama request) | – | Bisa memuat data nasabah/pribadi; isinya tak dicatat |
| Identitas user (email, nama, foto, `google_sub`) | Google Sign-In | Ya | `users` | Hanya domain `banksampoerna.com` |
| Nama berkas | Unggahan user | Ya | `audit_logs.source_files`, `result_file` | **Nama berkas bisa memuat data pribadi** (mis. nama nasabah) |
| Alamat IP, user-agent | Header request | Ya | `audit_logs` | Untuk jejak audit |
| Ukuran, durasi, status, pesan error | Sistem | Ya | `audit_logs` | Pesan error dipotong 500 karakter |
| Teks anotasi | User (edit PDF) | Tidak | – | Hanya ada di dokumen hasil |

## 3. Dasar dan prinsip
- Tujuan terbatas: pemrosesan dokumen atas permintaan user; audit untuk kepatuhan internal.
- Minimisasi: tanpa penyimpanan dokumen; log hanya metadata.
- Pembatasan akses: login korporat, role `user`/`auditor`/`admin`, kuota per user.
- Transparansi: pernyataan keamanan tampil di halaman login dan tiap tool.

## 4. Risiko dan mitigasi
| Risiko | Mitigasi yang ada | Risiko tersisa / tindak lanjut |
|---|---|---|
| Dokumen tertinggal di server | Hapus di `finally`; sweeper `/tmp`; container non-root | Crash saat proses bisa menyisakan berkas hingga 15 menit |
| Akses oleh non-karyawan | IAP, batas domain, `email_verified`, sesi 8 jam | Bergantung pengelolaan akun Google Workspace |
| Berkas berbahaya (makro, tautan) | LibreOffice tanpa makro/pembaruan tautan, rlimit, timeout | Tanpa antivirus (ClamAV ditunda); egress jaringan belum dibatasi (`infra/harden.md` §1) |
| Data pribadi di nama berkas pada log audit | Akses log dibatasi admin/auditor | Perlu keputusan: masking nama berkas atau retensi lebih pendek |
| Log audit bertambah tanpa batas | – | Belum ada pembersihan; lihat [retensi-audit.md](retensi-audit.md) |
| Penyalahgunaan role admin | Perubahan role tercatat; admin terakhir tak bisa diturunkan | Tinjauan log berkala oleh auditor |
| Database terbuka (`authorized-networks 0.0.0.0/0` di `setup.sh`) | Kata sandi DB di Secret Manager | **Harus diganti** (Cloud SQL connector / private IP) sebelum dianggap siap produksi |
| Ketersediaan | Backup harian + PITR, `activation-policy ALWAYS` | Satu region; lihat [dr.md](dr.md) |

## 5. Klasifikasi data usulan
| Kategori | Contoh | Boleh diproses di SULAP PDF? |
|---|---|---|
| Publik / internal biasa | Memo, notulen, presentasi umum | Ya |
| Rahasia internal | Laporan keuangan internal, kontrak vendor | Ya, sesuai kebijakan bank (layanan bersifat stateless dan diaudit) |
| Data pribadi nasabah / sangat rahasia | Dokumen KYC, rekening, kredit | **Belum diputuskan** — menunggu persetujuan Information Security/Compliance |

## 6. Keputusan yang dibutuhkan
1. Klasifikasi tertinggi yang boleh diproses (baris terakhir tabel di atas).
2. Retensi dan masking nama berkas pada log audit.
3. Persetujuan pemrosesan oleh Google Cloud (lokasi `asia-southeast2`) untuk data kategori terkait.
4. Perlu tidaknya antivirus dan pembatasan egress sebagai syarat produksi.
