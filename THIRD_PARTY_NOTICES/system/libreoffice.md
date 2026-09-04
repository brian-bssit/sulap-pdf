# LibreOffice (core / writer / calc / impress / draw)

| | |
|:---|:---|
| **Versi** | 4:7.4.7-1+deb12u14 (Debian bookworm; tidak di-pin di Dockerfile) |
| **Lisensi** | MPL-2.0 (utama) dan LGPL-3.0-or-later (dua-lisensi / komponen pihak ketiga; distribusi resmi mengizinkan memilih) |
| **Copyright** | © The Document Foundation dan kontributor |
| **Sumber / URL** | https://www.libreoffice.org/ · https://git.libreoffice.org/core |
| **Modifikasi** | Tidak ada. Dipakai sebagai konverter headless (`soffice --convert-to pdf`). Tidak ada source file LibreOffice yang diubah. |

**Teks lisensi lengkap:**
- MPL-2.0 → `../_licenses/MPL-2.0.txt`
- LGPL-3.0 → tautan resmi https://www.gnu.org/licenses/lgpl-3.0.txt (teks kanonik tidak disalin ke repo — komponen berjalan dengan lisensi MPL-2.0 yang teksnya tersedia di atas)

**Kewajiban MPL-2.0:**
- Kode berlisensi MPL dipakai **tanpa modifikasi**, sebagai proses eksternal (tidak dilink, tidak di-embed). 
  Karena tak ada file sumber MPL yang diubah, tidak ada kewajiban menyediakan source dari modifikasi — 
  source hulu lengkap tersedia di https://git.libreoffice.org/core.
- Kode MPL (LibreOffice) dan kode aplikasi (MIT, FastAPI) adalah **file terpisah** → tidak terjadi
  file-level copyleft terhadap aplikasi ini.

**Catatan versi:** tidak di-pin apt; referensi bookworm saat review. Tindakan: pin versi.
