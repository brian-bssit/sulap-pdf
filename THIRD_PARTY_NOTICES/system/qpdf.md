# qpdf

| | |
|:---|:---|
| **Versi** | 11.3.0-1+deb12u1 (Debian bookworm; tidak di-pin di Dockerfile) |
| **Lisensi** | Apache License 2.0 |
| **Copyright** | © Jay Berkenbilt dan kontributor |
| **Sumber / URL** | https://github.com/qpdf/qpdf · https://qpdf.sourceforge.io |
| **Modifikasi** | Tidak ada. Digunakan sebagai CLI subprocess (`qpdf --recompress-flate ...`). |

**Teks lisensi lengkap:** `../_licenses/Apache-2.0.txt`

**Kewajiban Apache-2.0:**
- Teks lisensi disertakan di distribusi → dipenuhi (`../_licenses/Apache-2.0.txt`).
- NOTICE — repo hulu qpdf tidak menerbitkan file `NOTICE`; tidak ada yang perlu disalin.
- Dokumen/notis berlisensi tersendiri tetap dipertahankan (aplikasi ini tidak mengubah file qpdf).

**Catatan versi:** Dockerfile `apt-get install qpdf` tanpa pin → versi terpasang = resolusi snapshot
`python:3.12-slim` (bookworm) saat image build. Angka di atas referensi bookworm saat review.
Tindakan yang disarankan: pin versi apt (lihat `LICENSE_COMPLIANCE.md`).
