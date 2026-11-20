# Evaluasi Baseline Security Assessment Checklist — SULAP PDF

Sumber: `Baseline Security Assessment Checklist.xlsx`, sheet *Checklist*, kolom **Web Based – Internal** (75 butir dari 299).
Asumsi dari pemilik aplikasi: cakupan Web Based Internal; semua butir terkait User ID dan password = N/A.

Status: **OK** terpenuhi · **PARTIAL** kurang sedikit, bisa dibereskan tanpa implikasi · **FIX** kerentanan, perbaiki segera · **CONFIRM** perlu keputusan karena ada implikasi · **NA** tidak berlaku.

## Ringkasan

| Status | Jumlah (baris tabel) |
|---|---|
| OK — Terpenuhi | 16 |
| PARTIAL — Parsial — perbaikan kecil, tanpa implikasi | 12 |
| FIX — Perbaiki segera (kerentanan/kebocoran) | 4 |
| CONFIRM — Perlu konfirmasi (ada implikasi) | 20 |
| NA — N/A (User ID/password/mobile) | 17 |

(Butir 24–30 digabung dalam satu baris.)

## Tabel butir

| No | Checkpoint | Status | Kondisi / bukti |
|---|---|---|---|
| 1 | Validasi SQL Injection | OK | Semua query lewat SQLAlchemy (parameter terikat); pencarian audit meng-escape wildcard; tidak ada SQL mentah selain `SELECT 1`. |
| 2 | XSS | CONFIRM | React meng-escape output; tidak ada `innerHTML`/`dangerouslySetInnerHTML`. Namun CSP masih `script-src 'unsafe-inline'` (script hidrasi Next). Penguji sering menandai ini. Lihat K-9. |
| 3 | Clickjacking | OK | `X-Frame-Options: DENY` + `frame-ancestors 'none'` (diuji lewat curl). |
| 4 | Disable autocomplete password | NA | User ID/password. |
| 5 | Disable remember password | NA | User ID/password. |
| 6 | Masking password | NA | User ID/password. Aplikasi tidak punya kolom password (login Google). |
| 7 | Directory browsing nonaktif | FIX | Tidak ada listing direktori, TAPI penyajian berkas statis rentan path traversal (lihat Temuan Kritis). |
| 8 | Two factor authentication | CONFIRM | Didelegasikan ke Google Workspace. Perlu bukti 2-Step Verification diwajibkan untuk domain. K-1. |
| 9 | CAPTCHA | CONFIRM | Tidak ada; login lewat Google. Usul N/A. K-2. |
| 10 | Login tanpa user/password | OK | Semua `/api/pdf/*`, `/api/admin/*`, `/api/auth/me` mengembalikan 401 tanpa sesi (diuji). |
| 11 | Login dengan kredensial salah | OK | ID token Google tidak valid → 401; domain/`email_verified` salah → 401/403. |
| 12 | Akses URL lewat incognito | OK | API 401; halaman statis hanya cangkang tanpa data. Di produksi di belakang IAP. |
| 13 | Single Sign On | CONFIRM | Google Sign-In + IAP. Apakah Google Workspace = SSO bank? K-1. |
| 14 | SSO emergency (bypass) | CONFIRM | Tidak ada, dan sengaja tidak dibuat: jalur bypass = pintu belakang. Usul cukup dokumen BCP. K-3. |
| 15 | Self-service reset password | NA | Password. |
| 16 | Ganti password login pertama | NA | Password. |
| 17 | Hashing password | NA | Aplikasi tidak menyimpan password. |
| 18 | User ID auto-create | NA | User ID. (Catatan: akun dibuat otomatis saat login pertama; tak ada feed HC.) |
| 19 | Panjang User ID | NA | User ID. |
| 20 | Create User ID oleh admin | NA | User ID. |
| 21 | Expiry User ID | NA | User ID. |
| 22 | Flag disable / auto-disable 60 hari | NA | User ID. (Catatan: kolom `is_active` ada, tanpa UI dan tanpa auto-disable; usulan toggle sebelumnya tidak disetujui.) |
| 23 | Jam akses (parameter) | NA | User ID. |
| 24-30 | Kebijakan password (panjang, isi, validasi, siklus, default, expiry, revoke 3x) | NA | Password. |
| 31 | Super User | NA | User ID. Role `admin` ada. |
| 32 | Force logout idle 10 menit | CONFIRM | Tidak ada. Sesi 8 jam absolut. K-4. |
| 33 | Tanpa multi-session per UID | CONFIRM | Tidak ada. K-5. |
| 34 | Komunikasi mobile↔backend HTTPS | NA | Bukan aplikasi mobile (HTTPS tetap terpenuhi). |
| 35 | Hapus memori saat sesi habis | PARTIAL | Logout menghapus cookie lalu navigasi; state di memori halaman baru hilang saat reload. Perbaikan kecil: reload penuh saat logout/idle. |
| 37 | Audit user access management (create/disable) | PARTIAL | `created_at` ada; perubahan role tercatat (`USER_ROLE_CHANGE`); tanggal disable tidak ada (tak ada fitur disable). |
| 38 | Log login & logout | PARTIAL | Login tercatat (`GOOGLE_LOGIN`, sukses/gagal). Logout belum tercatat. Perbaikan kecil. |
| 39 | Log aktivitas user (akses menu) | CONFIRM | Setiap operasi dan setiap request API tercatat (log terstruktur memuat `user_id` dan path). Perpindahan menu di browser tanpa panggilan API tidak. K-6. |
| 40 | Audit trail transaksi | OK | Setiap operasi PDF tercatat (sukses/gagal/dibatalkan, ukuran, durasi, IP). |
| 41 | User matrix: role | PARTIAL | Ada 3 role (user/auditor/admin); tabel matriks belum didokumentasikan. Perbaikan: dokumen. |
| 42 | User matrix: dual control | CONFIRM | Admin bisa mengubah role sendirian. Perlu fitur maker-checker. K-7. |
| 43 | User matrix: user group | CONFIRM | Tidak ada grup, hanya role. K-8. |
| 44 | Audit trail perubahan data parameter | CONFIRM | Parameter = variabel lingkungan/Secret Manager; tak ada menu parameter. Jejak ada di Cloud Audit Logs + git. K-10. |
| 45 | Fungsi lihat audit trail | OK | Panel Admin (admin dan auditor), filter, ekspor CSV. |
| 46 | Menu ubah data ad hoc via script SQL | CONFIRM | Tidak ada dan TIDAK disarankan dibuat (konsol SQL di aplikasi = risiko besar). Mohon waiver. K-11. |
| 47 | Laporan audit trail (filter tanggal, user, aplikasi) | OK | Filter user, aksi, status, tanggal, pencarian; "aplikasi" tidak relevan (satu aplikasi). |
| 48 | Laporan seluruh user (aktif/disable, tanggal) | PARTIAL | Daftar user ada; tanpa filter status/tanggal dan tanpa ekspor. |
| 49 | Laporan review user tahunan | PARTIAL | Belum ada; mudah (ekspor user + last login). |
| 50 | Laporan UAM (per departemen, role) | CONFIRM | Departemen tidak dikenal aplikasi (hanya email dan role). K-12. |
| 51 | Laporan user dibuat/disable otomatis | PARTIAL | Pembuatan otomatis (JIT) tercatat lewat `created_at`; tak ada laporan dan tak ada auto-disable. |
| 52 | Sembunyikan kode error dari UI | FIX | UI menampilkan awalan `[422]`; pesan 422 dari qpdf/LibreOffice membocorkan stderr dan path `/tmp/cpdf_…`. Perbaikan tanpa implikasi. |
| 53 | Semua aktivitas punya error handling | OK | Pesan error berbahasa Indonesia dan informatif; 500 generik. |
| 54 | Daftar kode error dan deskripsi | PARTIAL | Belum ada dokumen; mudah dibuat. |
| 55 | Audit login tidak menyimpan password | OK | Tidak ada password sama sekali. |
| 56 | Tidak simpan data sensitif di server | OK | Dokumen hanya di `/tmp` selama request; rahasia di Secret Manager. |
| 57 | Tidak simpan data sensitif di device | OK | Cookie HttpOnly; tidak memakai localStorage; dokumen hanya di memori halaman. |
| 58 | Tidak simpan temp/cache di storage publik/bersama | CONFIRM | Aplikasi berjalan di cloud publik (Cloud Run, Cloud SQL, Cloud Logging). Butuh persetujuan kebijakan cloud/lokasi data. K-13. |
| 59 | Password tidak disimpan clear text | NA | Password. |
| 60 | Tidak simpan di SD card | NA | Mobile. |
| 62 | Enkripsi jaringan HTTPS | OK | Cloud Run HTTPS; HSTS aktif bila `FRONTEND_URL` https. |
| 63 | Validasi sertifikat SSL resmi/berbayar | CONFIRM | Sertifikat `*.run.app` dikelola Google (CA publik tepercaya, tidak berbayar). Domain bank + sertifikat bank butuh load balancer. K-14. |
| 64 | Port tidak umum | CONFIRM | Tidak bisa dipenuhi: Cloud Run hanya melayani 443. Mohon waiver. K-15. |
| 65 | Tanpa SQL di URL | OK | Tidak ada SQL di URL; parameter terikat. |
| 66 | Patch terbaru | PARTIAL | `npm audit` melaporkan severity high (axios 1.19.0, follow-redirects, brace-expansion); `pip-audit` belum dijalankan. Perbaikan tanpa implikasi besar. |
| 67 | OS hardening (dokumen) | CONFIRM | OS dikelola Google (Cloud Run); dokumen hardening image belum ada. Apakah model tanggung jawab bersama cukup? K-16. |
| 68 | User bawaan DB | OK | DB memakai user `sulap` (bukan `sa`/`postgres`). Compose lokal memakai `postgres` (hanya dev). |
| 69 | Layanan bawaan nonaktif | FIX | `/docs`, `/redoc`, `/openapi.json` aktif (HTTP 200). Matikan di produksi. |
| 70 | Port aktif | CONFIRM | Cloud SQL punya IP publik dengan `authorized-networks 0.0.0.0/0` (`infra/setup.sh`). Harus ditutup. K-17. |
| 71 | Antivirus/antimalware | CONFIRM | Belum ada (ClamAV ditunda atas keputusan Anda). Checklist mewajibkan. K-18. |
| 72 | Backup aplikasi dan data | OK | Backup harian + PITR + dokumen `docs/ops/dr.md`. |
| 73 | Prosedur restore | PARTIAL | Dokumen ada (draf); belum pernah diuji (restore drill). |
| 74 | Prosedur DC dan DR | CONFIRM | Satu region, tanpa situs pemulihan. K-19. |
| 75 | URL masking / injection | FIX | Path traversal pada penyajian berkas statis (lihat Temuan Kritis). |
| 77 | Download file dibatasi | PARTIAL | Unduhan hanya hasil operasi sendiri dan CSV audit; tertutup sepenuhnya setelah path traversal diperbaiki. |
| 78 | Tutup koneksi DB setelah idle | PARTIAL | Pool 5+10 tanpa `pool_recycle`/`pool_pre_ping`. Perbaikan kecil. |

## Temuan kritis (ditemukan saat evaluasi, bukan dari checklist)
**Path traversal pada penyajian berkas statis** (`backend/main.py`, `serve_frontend`): `GET /..%2fmain.py` mengembalikan
kode sumber backend dan `GET /..%2f..%2f..%2fetc%2fhosts` mengembalikan berkas sistem (diuji lokal dengan `curl --path-as-is`).
Rute `static_dir / full_path` tidak memeriksa bahwa hasilnya tetap di dalam `static/`. Di Cloud Run, proses memakai
variabel lingkungan untuk `SECRET_KEY` dan `DATABASE_URL`; membaca `/proc/self/environ` kemungkinan terbuka (belum diverifikasi di Linux),
yang berarti pemalsuan token admin dan akses DB. IAP mempersempit penyerang menjadi karyawan terautentikasi, tetapi tidak menghilangkan risiko.
Perbaikan: `resolve()` jalur lalu tolak bila bukan di bawah `static_dir`. Tanpa implikasi fungsional.

## Daftar konfirmasi (butir yang punya implikasi)
| K | Butir | Kondisi | Implikasi bila diimplementasikan | Usulan |
|---|---|---|---|---|
| K-1 | 8, 13 | 2FA dan SSO didelegasikan ke Google Workspace + IAP | Tidak ada perubahan kode; butuh bukti kebijakan 2-Step Verification wajib dan pernyataan bahwa Google Workspace adalah SSO resmi bank | Konfirmasi ke tim IT/IAM |
| K-2 | 9 | CAPTCHA tidak ada | Menambah reCAPTCHA = layanan Google tambahan, perubahan CSP, friksi login; tidak menambah keamanan karena login sudah lewat Google + IAP | N/A |
| K-3 | 14 | Tidak ada jalur login darurat tanpa SSO | Jalur bypass = pintu belakang bagi penyerang; harus dijaga kredensial terpisah yang dikelola ketat | Cukup dokumen BCP (mis. pemulihan akses admin lewat GCP/IAM), tanpa fitur di aplikasi |
| K-4 | 32 | Sesi absolut 8 jam, tanpa idle logout | Idle 10 menit memaksa login ulang: pekerjaan di Edit PDF yang belum diterapkan hilang; unggahan besar yang lama bisa terpotong. Butuh timer klien + refresh sesi geser di server | Setujui nilai idle (usul 15–30 menit) dan peringatan 1 menit sebelum keluar |
| K-5 | 33 | Satu akun bisa login di beberapa browser/tab | Satu sesi per akun: login baru menendang yang lama (laptop vs HP, dua browser). Butuh penyimpanan sesi di DB (kolom versi sesi per user) | Setujui perilaku "login terbaru menang" atau minta waiver |
| K-6 | 39 | Operasi dan request API tercatat; klik menu tanpa API tidak | Mencatat tiap navigasi = volume log lebih besar dan data aktivitas pribadi karyawan (DPIA) | Konfirmasi tingkat detail yang dibutuhkan; usul cukup log request yang sudah ada |
| K-7 | 42 | Admin bisa mengubah role sendirian | Dual control = fitur baru: permintaan perubahan, persetujuan admin kedua, kedaluwarsa permintaan, tabel baru, UI. Perlu minimal 2 admin aktif | Wajib atau tidak? Bila wajib, jadi pekerjaan terpisah |
| K-8 | 43 | Tidak ada grup user | Grup = pemetaan Google Groups ke role atau tabel grup; menambah kompleksitas sinkronisasi | Konfirmasi apakah 3 role cukup |
| K-9 | 2 | CSP memakai `'unsafe-inline'` untuk script | Menghapusnya butuh hash/nonce di build Next.js static export (pekerjaan teknis non-trivial, risiko merusak login Google bila salah) | Terima sebagai risiko tercatat, atau jadwalkan pekerjaan khusus |
| K-10 | 44 | Tidak ada menu parameter; parameter = env var/Secret Manager | Jejak perubahan ada di Cloud Audit Logs + git, bukan di aplikasi | Konfirmasi bukti tersebut diterima |
| K-11 | 46 | Tidak ada menu ubah data via SQL | Membuatnya = konsol SQL (DDL/DML) di aplikasi: risiko sangat besar bagi bank | Mohon waiver; perubahan data ad hoc dilakukan lewat prosedur DBA di luar aplikasi |
| K-12 | 50 | Departemen tidak diketahui | Butuh sumber data HC/Google Directory dan penyimpanan data pegawai tambahan (DPIA) | Konfirmasi apakah laporan per role cukup |
| K-13 | 58 | Aplikasi di cloud publik (Cloud Run/SQL/Logging, region Jakarta) | Butuh persetujuan kebijakan penggunaan cloud, lokasi data, dan pelaporan ke regulator bila diwajibkan | Konfirmasi ke Compliance/IT Risk |
| K-14 | 63 | Sertifikat dikelola Google (CA publik, gratis) | "Resmi/berbayar" ala bank butuh domain bank + sertifikat bank di load balancer (biaya, perubahan OAuth origin dan `FRONTEND_URL`) | Konfirmasi apakah sertifikat Google cukup |
| K-15 | 64 | Cloud Run hanya melayani port 443 | Tidak bisa dipenuhi secara harfiah; port kontainer 8080 tidak terekspos | Mohon waiver |
| K-16 | 67 | OS dikelola Google; dokumen hardening image belum ada | Dokumen hardening bisa saya tulis (non-root, image slim, tanpa shell login); OS host bukan wewenang kita | Konfirmasi model tanggung jawab bersama diterima |
| K-17 | 70 | Cloud SQL IP publik, `0.0.0.0/0` | Ditutup = pindah ke Cloud SQL connector/private IP: perubahan jaringan (VPC), akses migrasi Alembic dari Cloud Build, kemungkinan downtime singkat dan biaya konektor | Sangat disarankan; butuh jadwal perubahan |
| K-18 | 71 | Tidak ada antivirus (ClamAV ditunda) | ClamAV di image: +≈300 MB, pembaruan signature, tambahan detik per berkas, kemungkinan false positive menolak berkas sah | Bila checklist mewajibkan, aktifkan; konfirmasi apakah AV pada level container/GCP cukup |
| K-19 | 74 | Satu region, tanpa situs pemulihan | Cadangan lintas region = biaya (replika/ekspor) dan keputusan region yang diizinkan regulasi | Tentukan opsi di `docs/ops/dr.md` |

## Perbaikan yang bisa langsung dikerjakan (tanpa implikasi)
1. Path traversal (butir 7, 75, 77).
2. Matikan `/docs`, `/redoc`, `/openapi.json` di produksi (butir 69).
3. Bersihkan pesan error 422 dari stderr/path `/tmp`, dan hilangkan awalan `[kode]` di UI (butir 52).
4. Catat logout di audit (butir 38); reload penuh saat logout (butir 35).
5. `pool_recycle`/`pool_pre_ping` untuk koneksi DB (butir 78).
6. Perbarui dependency yang rentan (butir 66).
7. Dokumen: matriks user/role (41), daftar kode error (54), hardening image (67), ekspor user untuk review tahunan (49).

## Keputusan pemilik aplikasi (2026-11-20)
| K | Butir | Keputusan | Tindak lanjut |
|---|---|---|---|
| K-2 | 9 CAPTCHA | **Waiver** | Alasan: tanpa form kredensial; autentikasi Google + IAP |
| K-3 | 14 SSO darurat | **Waiver** | – |
| K-4 | 32 Idle logout 10 menit | **Disetujui** | `docs/feature-access-controls` (Gelombang A) |
| K-5 | 33 Satu sesi per akun | **Disetujui** (login terbaru menang) | Gelombang A |
| K-6 | 39 Log akses menu | **Dianggap cukup** (audit trail saat ini) | Tidak ada pekerjaan |
| K-7 | 42 Dual control role | **Disetujui** dengan model peran baru (IT DCA Officer = maker, IT DCA Supervisor = approver, Super Admin) | Gelombang B |
| K-8 | 43 User group | **Waiver** | – |
| K-9 | 2 CSP `unsafe-inline` | **Hold** | `.claude/queue/security-holds.md` |
| K-10 | 44 Audit parameter | **Waiver** | – |
| K-12 | 50 Laporan UAM per departemen | **Waiver** | – |
| K-11 | 46 Menu SQL | **Waiver** | – |
| K-15 | 64 Port tidak umum | **Waiver** | – |
| K-19 | 74 DR site | **Waiver** | – |
| K-17 | 70 Tutup Cloud SQL dari internet | **Hold** | `.claude/queue/security-holds.md` |
| K-18 | 71 Antivirus | **Hold** | `.claude/queue/security-holds.md` |
| K-1, K-13, K-14, K-16 | 8, 13, 58, 63, 67 | **Ditutup di luar kode** (bukti dari tim terkait) | – |

## Pembaruan: Gelombang 0 selesai (2026-11-20)
| Butir | Status baru | Bukti |
|---|---|---|
| 7, 75, 77 Path traversal | **OK** | `backend/static_files.py` + 20 tes (`..%2f`, `%2e%2e/`, symlink, NUL, absolut); `curl --path-as-is` ke server nyata → 404 untuk `/..%2fmain.py`, `/..%2f..%2f..%2fetc%2fhosts`, `/%2e%2e/%2e%2e/etc/hosts`; e2e Playwright |
| 69 Layanan bawaan | **OK** | `/docs`, `/redoc`, `/openapi.json` → 404 di `ENVIRONMENT=production` (tes) |
| 52 Kode error ke UI | **OK** | Awalan `[kode]` dihapus; pesan 422 tanpa stderr/path (2 tes); detail hanya di log |
| 54 Daftar kode error | **OK** | `docs/ops/kode-error.md` |
| 38 Log login & logout | **OK** | Aksi `LOGOUT` tercatat (3 tes); filter audit memuat `LOGOUT` |
| 35 Hapus memori saat logout | **OK** | Logout memuat ulang halaman penuh (e2e) |
| 78 Koneksi DB idle | **OK** | `pool_pre_ping=True`, `pool_recycle=1800` |
| 66 Patch terbaru | **OK (dengan catatan)** | Python: `pip-audit` → "No known vulnerabilities found" (fastapi 0.165, starlette 1.10, pypdf 7.1.1, authlib 1.9.9, requests 2.34). Frontend: axios 1.21.1, **pdfjs-dist 4.0.379 → 4.10.38** (worker self-host ikut diperbarui), brace-expansion. Sisa: Next.js 14.2.35 ditandai critical oleh `npm audit` tetapi semua advisory-nya menyangkut *runtime server* Next; SULAP memakai `output: "export"` (tanpa server Next) → tidak terdampak. Upgrade mayor ditahan (`.claude/queue/security-holds.md` #4) |
| 41 Matriks role | **OK** | `docs/ops/matriks-role.md` (diperbarui lagi di Gelombang B) |
| 49 Laporan review user | **OK** | `GET /api/admin/users/csv` + tombol "Ekspor CSV" di Manajemen User (admin/auditor) |
| 67 Hardening | **Dokumen ada** | `docs/ops/hardening-image.md`; OS host ditutup di luar kode |

Temuan tambahan yang ikut diperbaiki:
- **CSV/formula injection:** ekspor log audit dan daftar user kini menetralkan sel berawalan `= + - @` (nama berkas dan email berasal dari user).
- **pdfjs-dist lama (4.0.379)** rentan eksekusi JavaScript lewat PDF berbahaya (CVE-2024-4367, diperbaiki di ≥ 4.2.67); versi 4.10.38 sudah memperbaikinya.

## Pembaruan: Gelombang A selesai (2026-11-20)
| Butir | Status baru | Bukti |
|---|---|---|
| 32 Force logout idle 10 menit | **OK** | `IdleGuard` (peringatan 1 menit + keluar otomatis), server menolak sesi idle (`SESSION_IDLE`), 14 tes unit, skrip Postgres (idle → 401), e2e Playwright (peringatan → keluar; "Tetap masuk" memperpanjang) |
| 33 Tanpa multi-session | **OK** | `users.session_id` (migrasi 0003); login kedua → sesi pertama 401 `SESSION_REPLACED`; e2e dua browser; audit `SESSION_REPLACED` |
| 38 Log login & logout | **OK** | Login, logout (`detail.reason=idle` bila dipaksa), penggantian sesi, dan idle-expiry tercatat |
