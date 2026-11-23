Berikut adalah **Dokumen Requirements Detail (Versi 2.0)** yang telah dipecah menjadi **User Stories** lengkap dengan **User Acceptance Criteria (UAC)** per role dan aktivitas. Dokumen ini dirancang agar langsung dapat digunakan oleh tim Product, Engineering, dan QA untuk memulai sprint pengembangan.

***

# 📄 CloudPDF Toolkit — Detailed Requirements & User Stories
**Version:** 2.0  

## 1. Roles & Personas
| Role | Deskripsi | Tujuan Utama |
| :--- | :--- | :--- |
| **Regular User** | Karyawan internal yang membutuhkan alat cepat untuk mengolah PDF harian. | Menggabungkan, mengompres, dan mengatur ulang halaman PDF dengan cepat tanpa instalasi software lokal. |
| **System Admin / Auditor** | Tim IT, Security, atau Compliance yang bertanggung jawab atas keamanan dan kepatuhan sistem. | Memantau siapa yang mengakses sistem, apa yang mereka lakukan dengan dokumen, dan memastikan tidak ada kebocoran data (stateless). |

---

## 2. User Stories & Acceptance Criteria (UAC)

### Epic 1: Authentication & Onboarding (Google OAuth)
**US1.1: First-Time Login (Auto-Provisioning)**
* **As a** Regular User,
* **I want to** log in using my corporate Google account,
* **So that** I can access the app without remembering a new password.
* **UAC:**
  1. User mengklik "Sign in with Google" dan di-redirect ke Google Consent Screen.
  2. Setelah approve, sistem mengecek `google_sub` di database.
  3. Jika belum ada, sistem **otomatis** membuat record user baru dengan data: `email`, `display_name`, `picture_url` dari Google.
  4. Sistem menerbitkan JWT internal dan menyimpannya di HTTP-only Secure Cookie.
  5. User di-redirect ke Dashboard utama.

**US1.2: Returning Login**
* **As a** Regular User,
* **I want to** be recognized when I log in again,
* **So that** my session is seamless.
* **UAC:**
  1. Sistem mengenali `google_sub` yang sudah ada.
  2. Sistem memperbarui `last_login_at` di database.
  3. JWT baru diterbitkan dan user langsung masuk ke Dashboard.

**US1.3: Logout**
* **As a** Regular User,
* **I want to** log out of the application,
* **So that** no one else can use my session on this device.
* **UAC:**
  1. User mengklik tombol "Logout".
  2. Sistem menghapus cookie JWT di browser.
  3. User di-redirect ke halaman Landing/Login.

---

### Epic 2: PDF Manipulation Tools (Merge, Compress, Rearrange)

**US2.1: PDF Merge**
* **As a** Regular User,
* **I want to** combine multiple PDF files into one,
* **So that** I can send a single document to my clients.
* **UAC:**
  1. User dapat meng-upload 2 hingga 10 file PDF (Total maks 30 MB).
  2. UI menampilkan daftar file yang允许 user melakukan *drag-and-drop* untuk mengubah urutan penggabungan.
  3. User mengklik "Merge".
  4. Sistem memproses menggunakan library `pypdf` (BSD).
  5. File hasil di-stream langsung ke browser user sebagai download.
  6. File di `/tmp` backend **wajib terhapus** setelah response selesai.

**US2.2: PDF Compress**
* **As a** Regular User,
* **I want to** reduce the file size of my PDF,
* **So that** I can upload it to systems with strict size limits.
* **UAC:**
  1. User meng-upload 1 file PDF (Maks 30 MB).
  2. User memilih level kompresi: Low, Medium, atau High.
  3. Sistem memproses menggunakan CLI `qpdf` (Apache 2.0).
  4. File hasil di-stream ke browser.
  5. UI menampilkan notifikasi ukuran file sebelum dan sesudah (opsional tapi disarankan untuk UX).
  6. File di `/tmp` backend **wajib terhapus**.

**US2.3: PDF Rearrange**
* **As a** Regular User,
* **I want to** reorder, delete, or rotate pages in my PDF,
* **So that** I can fix document structures before sending.
* **UAC:**
  1. User meng-upload 1 file PDF (Maks 200 halaman).
  2. UI menampilkan *grid* thumbnail halaman.
  3. User dapat *drag-and-drop* halaman, klik ikon tempat sampah untuk hapus, atau klik ikon panah untuk rotasi 90 derajat.
  4. User mengklik "Save & Download".
  5. Sistem memproses dan men-stream file baru ke browser.
  6. File di `/tmp` backend **wajib terhapus**.

---

### Epic 3: Async UI & Resource Protection

**US3.1: Full-Screen Loading Overlay**
* **As a** Regular User,
* **I want to** see a clear loading indicator while my file is processing,
* **So that** I know the system is working and I don't refresh the page.
* **UAC:**
  1. Saat user klik tombol proses (Merge/Compress/Rearrange), UI langsung menampilkan *Full-screen Overlay* dengan spinner.
  2. User **tidak bisa** berinteraksi dengan elemen di balik overlay.
  3. Overlay menampilkan teks: *"Sedang memproses dokumen... Mohon jangan tutup halaman ini."*
  4. Overlay hilang secara otomatis saat file berhasil di-download atau error muncul.

**US3.2: Client Disconnect Handling (Resource Protection)**
* **As a** System,
* **I want to** abort processing if the user closes the tab,
* **So that** I don't waste Cloud Run CPU/RAM for a result that will be discarded.
* **UAC:**
  1. Jika user menutup tab browser saat loading overlay aktif, koneksi HTTP terputus.
  2. Backend mendeteksi *client disconnect* (via `request.is_disconnected()`).
  3. Backend segera membatalkan (abort) proses PDF.
  4. Backend menghapus file di `/tmp`.
  5. Audit log mencatat status `CANCELLED_BY_CLIENT`.

---

### Epic 4: Audit Logging & Administration

**US4.1: View Audit Logs**
* **As a** System Admin,
* **I want to** view a log of all PDF operations performed by users,
* **So that** I can comply with internal security and data governance policies.
* **UAC:**
  1. Admin mengakses halaman `/admin/audit-logs`.
  2. Sistem menampilkan tabel berisi: Timestamp, User Email, Action (Merge/Compress/Rearrange), Source Files, Result File, Status, Duration, IP Address.
  3. Admin dapat memfilter berdasarkan: User, Action, Date Range, dan Status.
  4. Data di-paginasi (20 rows per page).

**US4.2: Export Audit Logs**
* **As a** System Admin,
* **I want to** export the audit logs to a CSV file,
* **So that** I can attach it to compliance reports.
* **UAC:**
  1. Admin mengklik tombol "Export CSV".
  2. Sistem men-generate file CSV berdasarkan filter yang sedang aktif.
  3. File CSV di-download ke komputer Admin.

---

## 3. Non-Functional Requirements (NFR)

### 3.1. Architecture & Infrastructure (Cloud Run)
| Parameter | Target | Justifikasi Teknis |
| :--- | :--- | :--- |
| **Memory** | **4 GB** | Mencegah OOM saat mem-parse PDF 30MB di RAM. |
| **Concurrency** | **1** | 1 instance = 1 request PDF berat. Mencegah OOM & race condition di `/tmp`. |
| **Timeout** | **600 detik** | Cloud Run hard limit diset ke 10 menit untuk mengakomodasi file besar. |
| **Max Instances** | 10 | Cloud Run auto-scale out jika ada antrian request. |
| **Storage** | **Ephemeral Only** | **TIDAK ADA** GCS/S3. File hanya hidup di `/tmp` selama HTTP request. |

### 3.2. Security & Compliance
* **NFR-SEC-01 (Zero Trust Storage):** Tidak ada file user yang tersimpan di disk persisten manapun. Setelah response HTTP dikirim, file di `/tmp` **wajib** dihapus menggunakan `try/finally` atau context manager.
* **NFR-SEC-02 (Fallback Cleanup):** Sistem harus memiliki background thread/internal cron yang berjalan setiap 5 menit untuk membersihkan *orphaned files* di `/tmp` yang berusia > 15 menit (antisipasi jika container crash sebelum `finally` tereksekusi).
* **NFR-SEC-03 (Cookie Security):** JWT cookie wajib di-set dengan atribut `SameSite=Strict`, `Secure`, dan `HttpOnly`.
* **NFR-SEC-04 (CSRF/Origin Validation):** Endpoint mutasi (POST/PUT/DELETE) wajib memvalidasi `Origin` atau `Referer` header.

### 3.3. Zero Licensing Cost (Strict Enforcement)
* **NFR-LIC-01:** Seluruh stack software (Backend, Frontend, PDF Engine, DB Driver) **WAJIB** menggunakan lisensi permisif (MIT, Apache 2.0, BSD, PostgreSQL License).
* **NFR-LIC-02 (Blacklist):** Penggunaan library berikut **DILARANG KERAS** dan akan di-*reject* saat Code Review:
  * ❌ `PyMuPDF` / `fitz` (AGPL)
  * ❌ `Ghostscript` (AGPL)
  * ❌ `iText` (AGPL/Commercial)
* **NFR-LIC-03 (Whitelist):** Stack PDF yang disetujui:
  * Merge/Rearrange: `pypdf` (BSD)
  * Compress: `qpdf` (Apache 2.0)

---

## 4. Out of Scope (Untuk Versi Ini)
Untuk menjaga fokus, batas biaya, dan kepatuhan lisensi, fitur berikut **TIDAK** akan dibangun:
1.  **PDF Compare / Diff:** (Dihapus karena kompleksitas lisensi visual highlight dan beban komputasi tinggi).
2.  **Persistent File Storage:** Tidak ada GCS, S3, atau database storage untuk file user.
3.  **Local Password Management:** Tidak ada fitur "Lupa Password" atau registrasi manual (Full Google OAuth).
4.  **OCR (Optical Character Recognition):** Tidak ada fitur ekstraksi teks dari PDF hasil scan (Tesseract terlalu berat untuk Cloud Run).
5.  **Text Editing:** Tidak ada fitur edit teks langsung di dalam PDF (seperti Adobe Acrobat).