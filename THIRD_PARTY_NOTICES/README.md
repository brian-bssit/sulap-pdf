# THIRD_PARTY_NOTICES

Notis lisensi pihak ketiga SULAP PDF. Struktur:

```
THIRD_PARTY_NOTICES/
├── README.md            ← file ini
├── _licenses/           ← teks lisensi kanonik (Apache-2.0, MPL-2.0, OFL-1.1) dipakai bersama
├── python/              ← 48 komponen PyPI + salinan LICENSE tiap distribusi + index.json
├── npm/                 ← 30 komponen npm (installed tree) + salinan LICENSE + index.json
├── system/              ← Debian base, CPython, qpdf, LibreOffice, curl (index.json + *.md)
├── pdfjs/               ← pdfjs-dist 4.0.379 + LICENSE + catatan header worker
└── fonts/               ← Lato + DejaVu (Sans/Serif/Mono) + LICENSE + index.json
```

Setiap entri komponen mencatat: **nama + versi**, **lisensi**, **copyright**, **URL/sumber**,
**daftar modifikasi**, dan pointer **teks lisensi lengkap**.

## Kebijakan pointer teks lisensi
Teks lisensi kanonik ditaruh **sekali** di `_licenses/` (dipakai banyak komponen). Komponen yang
menyertakan LICENSE sendiri di distribusinya (PyPI/npm wheel) disalin verbatim ke folder miliknya.

## Memperbarui (reproducible)
- **Python** — `backend/.venv/bin/python backend/tools/gen_sbom.py`
  (resolusi ulang via pip dry-run; menulis `docs/sbom/python-cyclonedx.json` + isi `python/`).
- **npm** — `frontend/scripts/gen-npm-sbom.sh`
  (`npm sbom` installed tree → `docs/sbom/npm-cyclonedx.json` + isi `npm/`).
- **system/pdfjs/fonts** — ditulis manual dari Dockerfile/fetch.sh (lihat `system/*.md`).

## Status agregat
Lihat `../LICENSE_COMPLIANCE.md` untuk matriks compliance, kewajiban, dan open items.
