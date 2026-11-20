# Retensi log audit

> **Status: nilai retensi BELUM DITETAPKAN.** Dokumen ini memetakan apa yang tercatat, di mana, dan keputusan yang
> dibutuhkan. Jangan mengunci retensi bucket sebelum angka disetujui (tidak bisa dibatalkan).

## Apa yang dicatat
Tabel `audit_logs` (satu baris per operasi, login, dan perubahan role):
email user, aksi, nama berkas sumber, ukuran, durasi, status, pesan error, alamat IP, user-agent, waktu, dan `detail`
(JSON, mis. dari/ke role pada `USER_ROLE_CHANGE`). **Isi dokumen tidak pernah disimpan.** Kata sandi tidak pernah dicatat.

## Tempat penyimpanan
| Lokasi | Sifat | Retensi saat ini |
|---|---|---|
| Tabel `audit_logs` (Cloud SQL) | Dapat dibaca admin/auditor lewat panel; bisa diubah oleh admin DB | **Tanpa batas, tanpa proses pembersihan** (tabel terus bertambah) |
| Cloud Logging (baris `event="audit"`) | Salinan, tidak bisa diubah dari aplikasi | Bawaan bucket log (30 hari untuk `_Default`) kecuali ada sink |
| Bucket audit terkunci (opsional, `infra/harden.md` §2) | Immutable bila retensi dikunci | Belum dibuat; nilai belum ditetapkan |

## Akses
- Panel Admin: role `admin` dan `auditor` (baca dan ekspor CSV, maks 10.000 baris per ekspor).
- Perubahan role admin hanya oleh `admin` dan selalu tercatat (`USER_ROLE_CHANGE`).
- Akses langsung ke database dibatasi pada pemegang akses Cloud SQL (di luar aplikasi).

## Keputusan yang dibutuhkan (Compliance/Legal)
1. Lama retensi minimum (mengacu ketentuan OJK/internal bank) dan maksimum (prinsip minimisasi UU PDP).
2. Apakah salinan immutable (bucket terkunci) wajib.
3. Mekanisme pembersihan baris lama di `audit_logs` setelah masa retensi (belum ada; perlu pekerjaan kode/infra).
4. Siapa yang boleh meminta ekspor di luar panel.
