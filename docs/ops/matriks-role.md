# Matriks user dan role (kondisi saat ini)

> Checklist butir 41. Akan diperbarui saat peran baru (IT DCA Officer, IT DCA Supervisor, Super Admin) dan dual control
> diimplementasikan (`docs/feature-access-controls`, Gelombang B).

Akun dibuat otomatis saat login Google pertama (domain `banksampoerna.com`) dengan role `user`.

| Fungsi | user | auditor | admin |
|---|---|---|---|
| Kompres, Gabung, Atur Halaman, Hapus Halaman, Konversi, Edit PDF | ✔ | ✔ | ✔ |
| Lihat Panel Admin: daftar user, log audit | – | ✔ (baca saja) | ✔ |
| Ekspor CSV log audit dan daftar user | – | ✔ | ✔ |
| Ubah role user | – | – | ✔ (tercatat `USER_ROLE_CHANGE`) |
| Menurunkan admin terakhir yang aktif | – | – | ditolak sistem |

Sesi: satu sesi aktif per akun (login terbaru menang; sesi lama ditolak dengan pesan "login di tempat lain") dan keluar otomatis setelah 10 menit tanpa aktivitas (peringatan 1 menit sebelumnya). Pembatasan lain yang berlaku untuk semua role: hanya email domain korporat dan `email_verified`; kuota 10 operasi/menit dan 200/hari;
sesi 8 jam. Role dibaca dari database pada setiap request, jadi perubahan role atau penonaktifan akun berlaku seketika.
