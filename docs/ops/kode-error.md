# Daftar kode dan pesan error

> Checklist butir 54. Pesan yang tampil ke user dalam Bahasa Indonesia, tanpa detail teknis (path, stderr alat). Detail teknis
> hanya ada di log (cari dengan `X-Request-ID`).

| HTTP | Pesan contoh | Penyebab | Tindakan pengguna |
|---|---|---|---|
| 400 | "Format file tidak didukung. Hanya PDF" | Berkas bukan PDF / kosong | Pilih file PDF yang benar |
| 400 | "Maksimal 200 halaman" | Dokumen melebihi batas halaman | Pecah dokumen dulu |
| 400 | "Minimal 2 file untuk digabungkan" / "Maksimal 10 file" | Jumlah file gabung di luar 2–10 | Sesuaikan jumlah file |
| 400 | "Setidaknya 1 halaman harus tersisa" / "Indeks halaman di luar jangkauan" | Pilihan hapus halaman tak valid | Pilih ulang halaman |
| 400 | "Aksi tidak dikenal…", "Operasi harus berupa array non-kosong", "Halaman N di luar jangkauan" | Permintaan anotasi/atur ulang tak valid | Muat ulang halaman lalu ulangi |
| 400 | "level harus low, balanced, atau high" | Tingkat kompresi tak dikenal | – (klien non-UI) |
| 401 | "Not authenticated" / "Invalid or expired token" | Sesi tidak ada atau habis | Login ulang |
| 401 | "Google authentication failed" | Token Google tidak valid / email belum terverifikasi | Coba login lagi |
| 403 | "Akun tidak diizinkan. Gunakan email korporat." | Email di luar domain yang diizinkan | Pakai akun korporat |
| 403 | "Akses auditor atau admin diperlukan" / "Admin access required" | Role tidak cukup | Hubungi admin |
| 403 | "Origin not allowed" | Permintaan lintas-origin | Akses lewat URL resmi |
| 404 | (tanpa isi) | Halaman tidak ada / jalur di luar situs | – |
| 413 | "File terlalu besar. Maksimal 30 MB" / "Total file > 30MB" / "Ukuran request terlalu besar" | Melebihi batas ukuran | Kompres atau pecah file |
| 422 | "PDF terkunci password. Buka kuncinya dulu dengan Unlock PDF." | PDF berenkripsi | Buka kunci di luar aplikasi (fitur Unlock belum ada) |
| 422 | "PDF rusak atau tidak bisa dibaca" / "PDF tidak bisa diproses. File mungkin rusak." | Berkas korup | Minta file asli |
| 422 | "Dokumen tidak bisa dikonversi. File mungkin rusak atau formatnya tidak didukung." | LibreOffice gagal | Simpan ulang dokumen lalu coba lagi |
| 429 | "Batas N operasi per menit/per hari tercapai. Coba lagi dalam S detik." | Kuota per user | Tunggu sesuai `Retry-After` |
| 499 | – | Klien memutus koneksi saat proses | – (tercatat `CANCELLED_BY_CLIENT`) |
| 500 | "Gagal memproses file" / "Internal server error" | Kesalahan tak terduga | Ulangi; bila berulang laporkan dengan request id |
| 503 | `/api/ready`: `NOT_READY` | DB atau binary pemroses tidak siap | Hubungi infrastruktur |
| 504 | "Proses timeout. Coba file lebih kecil" | Proses melebihi batas waktu | Kecilkan file |

Status audit: `SUCCESS`, `FAILED`, `CANCELLED_BY_CLIENT`. Aksi: `COMPRESS`, `MERGE`, `REARRANGE`, `REMOVE_PAGES`, `CONVERT`,
`EDIT_OVERLAY`, `GOOGLE_LOGIN`, `LOGOUT`, `USER_ROLE_CHANGE`, `RATE_LIMITED`.
