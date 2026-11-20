# Requirements — Kontrol Akses (hasil evaluasi Baseline Security Checklist)

## Overview
Menutup butir checklist yang disetujui: perbaikan segera, idle logout, satu sesi per akun, dan dual control perubahan role
dengan peran baru. Sumber keputusan: `docs/security/baseline-checklist-evaluation.md`. Di luar lingkup (hold): Cloud SQL
tertutup, antivirus, CSP tanpa `unsafe-inline` — lihat `.claude/queue/security-holds.md`.

## Glossary
- **Maker / Approver**: pengaju dan penyetuju perubahan role.
- **IT DCA Officer** (`dca_officer`): Admin Maker. **IT DCA Supervisor** (`dca_supervisor`): Admin Approver.
- **Super Admin** (`super_admin`): boleh mengubah role langsung tanpa dual control.
- **Sesi**: cookie `cpdf_token` + catatan sesi di DB.

## Gelombang 0 — Perbaikan segera (butir 7, 35, 38, 52, 66, 69, 75, 77, 78, 41, 49, 54, 67)
- **R0.1** WHEN path URL berisi `..` atau hasil resolusi di luar `static/` THEN 404; tidak ada berkas lain yang tersaji.
- **R0.2** WHEN `ENVIRONMENT=production` THEN `/docs`, `/redoc`, `/openapi.json` tidak tersedia (404).
- **R0.3** WHEN qpdf/LibreOffice gagal THEN pesan ke user tidak memuat stderr maupun path `/tmp`; detail teknis hanya di log. UI tidak menampilkan awalan `[kode]`.
- **R0.4** WHEN user logout THEN tercatat di audit (`LOGOUT`) dan halaman dimuat ulang penuh (memori klien bersih).
- **R0.5** Pool DB memakai `pool_pre_ping` dan `pool_recycle` (koneksi idle tidak menggantung).
- **R0.6** Dependency produksi frontend/backend tanpa temuan severity high yang punya perbaikan (`npm audit`, `pip-audit`).
- **R0.7** Dokumen: matriks user/role, daftar kode error, hardening image; ekspor CSV daftar user (nama, role, status, login terakhir) untuk review tahunan.

## Gelombang A — Sesi
- **R1 Idle logout.** WHEN tidak ada aktivitas 10 menit THEN sesi berakhir; 1 menit sebelumnya muncul peringatan dengan tombol "Tetap masuk". Aktivitas = klik, ketik, gerak pointer, atau panggilan API. Batas absolut 8 jam tetap berlaku.
- **R2 Satu sesi per akun.** WHEN akun login di tempat baru THEN sesi lama tidak valid; request berikutnya dari sesi lama → 401 dengan alasan `SESSION_REPLACED` dan pesan "Sesi berakhir karena login di tempat lain".
- **R3 Alasan jelas.** WHEN sesi berakhir karena idle THEN pesan "Sesi berakhir karena tidak ada aktivitas"; keduanya tampil di halaman login.
- **R4 Audit.** Login, logout, idle-expiry, dan penggantian sesi tercatat.

## Gelombang B — Peran dan dual control
- **R5 Peran.** `user`, `auditor`, `dca_officer`, `dca_supervisor`, `super_admin`. Role `admin` lama dimigrasikan ke `super_admin`.
- **R6 Hak.**
  | Aksi | user | auditor | DCA Officer | DCA Supervisor | Super Admin |
  |---|---|---|---|---|---|
  | Pakai tool PDF | ✔ | ✔ | ✔ | ✔ | ✔ |
  | Lihat daftar user, log audit, ekspor | – | ✔ | ✔ | ✔ | ✔ |
  | Ajukan perubahan role | – | – | ✔ | – | ✔ (langsung, tanpa pengajuan) |
  | Setujui/tolak pengajuan | – | – | – | ✔ | ✔ |
  | Ubah role langsung | – | – | – | – | ✔ |
- **R7 Dual control.** WHEN DCA Officer mengajukan perubahan role THEN status `PENDING`; hanya DCA Supervisor (atau Super Admin) yang berbeda dari pengaju dapat menyetujui/menolak. Pengaju tidak bisa menyetujui miliknya sendiri; tidak bisa mengajukan untuk dirinya sendiri.
- **R8 Batasan pengajuan.** DCA Officer hanya boleh mengajukan role `user`, `auditor`, `dca_officer`, `dca_supervisor`. Pemberian/pencabutan `super_admin` hanya oleh Super Admin langsung.
- **R9 Satu pengajuan aktif per target.** Pengajuan kedua untuk user yang sama saat masih `PENDING` ditolak 409. Pengajuan tidak kedaluwarsa (keputusan pemilik: tanpa masa berlaku); pengaju dapat membatalkannya (`CANCELLED`).
- **R10 Validasi saat eksekusi.** WHEN disetujui THEN role asal harus masih sama dengan saat diajukan, dan invarian R11 diperiksa; bila gagal → 409/400 dan pengajuan tetap tercatat gagal.
- **R11 Invarian peran admin.** Setelah perubahan apa pun (langsung atau via persetujuan), harus berlaku: (≥ 1 `dca_officer` aktif **dan** ≥ 1 `dca_supervisor` aktif) **atau** ≥ 1 `super_admin` aktif. Pelanggaran ditolak 400 "Tidak boleh menyisakan sistem tanpa pasangan Officer–Supervisor atau Super Admin".
- **R12 Audit.** `ROLE_CHANGE_REQUESTED`, `ROLE_CHANGE_APPROVED`, `ROLE_CHANGE_REJECTED`, `ROLE_CHANGE_CANCELLED`, dan `USER_ROLE_CHANGE` (langsung oleh Super Admin), masing-masing dengan `detail` (target, dari, ke, alasan bila diisi, pengaju, penyetuju).
- **R13 UI.** Tab "Pengajuan Role" untuk Officer/Supervisor/Super Admin; label peran: "IT DCA Officer", "IT DCA Supervisor", "Super Admin", "Auditor", "User". Alasan pengajuan opsional (keputusan pemilik: tidak wajib).

## Asumsi (jawab bila berbeda)
1. Role `admin` yang ada sekarang menjadi `super_admin` saat migrasi (agar tidak ada yang kehilangan akses); Anda lalu menurunkan sesuai kebutuhan.
2. Officer dan Supervisor boleh melihat daftar user dan log audit (seperti auditor), karena butuh konteks untuk mengajukan/menyetujui.
3. Pengajuan tanpa masa berlaku dan alasan tidak wajib (keputusan pemilik).
4. Satu orang hanya punya satu role pada satu waktu; maker dan approver otomatis orang berbeda.
5. Idle 10 menit (sesuai checklist), peringatan 1 menit, batas absolut 8 jam.
6. Tidak ada mekanisme "bootstrap" Super Admin lewat env; Super Admin pertama berasal dari migrasi `admin` lama atau diubah langsung di DB oleh DBA.
