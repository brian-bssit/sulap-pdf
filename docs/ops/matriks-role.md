# Matriks user dan role

> Checklist butir 41 dan 42 (dual control). Sumber kebenaran kode: `backend/auth/roles.py` (dicerminkan `frontend/src/lib/roles.ts`,
> dijaga sama oleh `backend/tests/test_roles_parity.py`). Peran di database: `users.role`.

Akun dibuat otomatis saat login Google pertama (domain `banksampoerna.com`) dengan role `user`.

## Peran
| Peran | Nama di UI | Keterangan |
|---|---|---|
| `user` | User | Pengguna biasa |
| `auditor` | Auditor | Baca saja atas data admin |
| `dca_officer` | IT DCA Officer | Admin **Maker**: mengajukan perubahan role |
| `dca_supervisor` | IT DCA Supervisor | Admin **Approver**: menyetujui/menolak pengajuan |
| `super_admin` | Super Admin | Mengubah role **langsung**, tanpa dual control; juga boleh memutuskan pengajuan |

## Hak per peran
| Fungsi | user | auditor | DCA Officer | DCA Supervisor | Super Admin |
|---|---|---|---|---|---|
| Kompres, Gabung, Atur/Hapus Halaman, Konversi, Edit PDF | ✔ | ✔ | ✔ | ✔ | ✔ |
| Lihat daftar user, pengajuan role, log audit; ekspor CSV | – | ✔ | ✔ | ✔ | ✔ |
| Ajukan perubahan role | – | – | ✔ | – | – |
| Setujui / tolak pengajuan (bukan miliknya sendiri) | – | – | – | ✔ | ✔ |
| Batalkan pengajuan | – | – | pengaju | – | ✔ (semua) |
| Ubah role langsung | – | – | – | – | ✔ |

## Aturan dual control
- Officer hanya boleh mengajukan role `user`, `auditor`, `dca_officer`, `dca_supervisor`. Pemberian **dan** pencabutan `super_admin` hanya oleh Super Admin langsung.
- Pengaju tidak boleh menyetujui/menolak pengajuannya sendiri, dan tidak boleh mengajukan untuk dirinya sendiri.
- Satu pengajuan aktif (`PENDING`) per user. Pengajuan **tidak kedaluwarsa**; alasan **opsional**.
- Saat disetujui, sistem memeriksa ulang bahwa role target belum berubah (bila berubah, pengajuan ditutup otomatis dan tidak diterapkan).
- Semua langkah tercatat di audit: `ROLE_CHANGE_REQUESTED`, `ROLE_CHANGE_APPROVED`, `ROLE_CHANGE_REJECTED`, `ROLE_CHANGE_CANCELLED`,
  dan `USER_ROLE_CHANGE` (langsung oleh Super Admin).

## Invarian peran admin
Setelah perubahan apa pun yang menyentuh `dca_officer`, `dca_supervisor`, atau `super_admin` (hanya akun **aktif** yang dihitung), harus berlaku:

> (≥ 1 IT DCA Officer **dan** ≥ 1 IT DCA Supervisor) **atau** ≥ 1 Super Admin

Perubahan yang melanggar ditolak (HTTP 400). Perubahan antara `user` dan `auditor` tidak diperiksa.

## Migrasi dari model lama
Role `admin` lama otomatis menjadi `super_admin` (migrasi 0004) agar tak ada yang kehilangan akses. Setelah itu tetapkan Officer dan
Supervisor, lalu turunkan Super Admin yang tidak diperlukan. Downgrade migrasi mengembalikan ketiga peran admin ke `admin`.

Sesi: satu sesi aktif per akun (login terbaru menang) dan keluar otomatis setelah 10 menit tanpa aktivitas. Pembatasan lain untuk semua peran:
domain email korporat + `email_verified`, kuota 10 operasi/menit dan 200/hari, batas absolut sesi 8 jam. Role dibaca dari database di setiap
request, jadi perubahan berlaku seketika.
