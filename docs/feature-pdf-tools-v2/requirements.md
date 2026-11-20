# Requirements — PDF Tools v2 (P2)

## Overview
Tambah tool dokumen agar mencakup kebutuhan kantor sehari-hari. Semua stateless (`/tmp`, hapus di `finally`), diaudit, tunduk pada kuota & batas ukuran dari fitur hardening.

Di luar lingkup: tanda tangan/stempel, redaksi permanen, batch multi-file. **Alur kerja berantai: belum diputuskan** — dikeluarkan sampai ada jawaban.

## Glossary
- **Rentang halaman**: string seperti `1-3,5,8-` (1-based).
- **Scrub metadata**: hapus `/Info`, XMP, dan properti dokumen.
- **Text layer**: teks tak terlihat di atas gambar scan agar bisa dicari/disalin.

## Requirements

### R1 Split / Extract
- WHEN user kirim PDF + rentang THEN keluar 1 PDF berisi halaman itu; WHEN mode "pisah per N halaman" THEN keluar ZIP berisi beberapa PDF.
- WHEN rentang di luar jumlah halaman / kosong THEN 400 jelas. Batas 200 halaman input.

### R2 Unlock / Protect
- Unlock: WHEN password benar THEN PDF tanpa enkripsi; salah THEN 401-style 422 "Password salah". Hanya untuk PDF yang user-password-nya diketahui (tidak ada cracking).
- Protect: WHEN user beri password (≥8 char) THEN PDF AES-256, izin cetak/salin opsional.
- Password tidak pernah masuk log/audit/URL; dikirim sebagai field form.

### R3 Watermark & nomor halaman
- Watermark teks (diagonal/tengah, opacity, warna, halaman terpilih); nomor halaman (posisi, format "n" / "n / total", mulai dari).
- Memakai mesin overlay + font embed yang sudah ada (`pdf/edit_overlay.py`, `font_data.py`).

### R4 Scrub metadata
- WHEN dijalankan THEN `/Info`, XMP, `/Metadata`, lampiran dihapus; respons memuat daftar yang dihapus (header `X-Scrubbed`). Konten halaman tidak berubah.

### R5 PDF → Word (best-effort)
- WHEN PDF berbasis teks THEN DOCX via LibreOffice; UI menampilkan peringatan "tata letak tidak selalu sama persis; PDF scan butuh OCR dulu".
- PDF → Excel: DIBATALKAN.

### R6 Gambar ↔ PDF
- Gambar → PDF: 1–20 gambar (JPG/PNG), urutan sesuai UI, ukuran halaman A4/ikuti gambar. EXIF orientasi dihormati.
- PDF → Gambar: dirender di browser (pdf.js) menjadi PNG/JPG per halaman, unduh satuan/ZIP; tanpa beban server.

### R7 OCR
- WHEN PDF scan (≤50 halaman) + bahasa (`ind`, `eng`) THEN PDF dengan text layer; WHEN halaman sudah punya teks THEN dilewati.
- Progres per halaman di respons akhir (`X-Pages-OCR`); timeout & memori dibatasi.

### R8 Perbandingan dua PDF
- WHEN dua PDF dikirim THEN hasil JSON: per halaman, blok teks ditambah/dihapus/tetap (diff kata), ringkasan jumlah perubahan. UI tampil berdampingan dengan penyorotan.
- Perbandingan visual (overlay pixel) = di luar lingkup.

### R9 Konsistensi
- Semua endpoint baru: auth, kuota, audit action sendiri (`SPLIT`, `UNLOCK`, `PROTECT`, `WATERMARK`, `PAGE_NUMBERS`, `SCRUB_METADATA`, `PDF_TO_WORD`, `IMG_TO_PDF`, `OCR`, `COMPARE`), cleanup di `finally`, `request.is_disconnected()` dicek.
- Lisensi: hanya permissive (MIT/BSD/Apache/MPL). Dilarang AGPL (Ghostscript, PyMuPDF).

### R10 Alur kerja berantai
- WHEN user memilih 2–5 langkah (compress, unlock, watermark, nomor halaman, scrub metadata, remove pages, protect) dan satu PDF THEN langkah dijalankan berurutan, keluaran tiap langkah jadi masukan berikutnya, hasil akhir diunduh.
- Dijalankan di frontend (rantai panggilan endpoint yang ada): server tetap stateless, tiap langkah diaudit dan dihitung kuota sendiri.
- WHEN satu langkah gagal THEN rantai berhenti, pesan menyebut langkah yang gagal; hasil antara tidak disimpan.
- Protect, bila dipilih, wajib langkah terakhir.

## Keputusan (terjawab)
1. Alur berantai: jadi (R10).
2. PDF → Excel: batal.
3. Bahasa OCR: `ind` + `eng` cukup.
