# LICENSE COMPLIANCE — SULAP PDF

Ringkasan kewajiban lisensi pihak ketiga, status compliance, dan artefak pendukung.

| | |
|:---|:---|
| **Tanggal review** | 2026-09-04 |
| **Penanggung jawab** | ______________ (diisi) |
| **Revisi** | 1 |
| **Next review** | setiap rilis / dependency bump, minimal per kuartal |

Artefak: SBOM → `docs/sbom/*.json` (CycloneDX 1.5) · Notices → `THIRD_PARTY_NOTICES/`.

---

## 1. Matriks komponen & lisensi

### 1.1 Python runtime (48 komponen ter-resolve)
Daftar lengkap (nama/versi/license/source): **`THIRD_PARTY_NOTICES/python/index.json`**.
Teks lisensi per paket: `THIRD_PARTY_NOTICES/python/<Paket>-<LICENSE…>`.

Lisensi langsung (top-level, dari `backend/requirements.txt`):

| Komponen | Lisensi |
|:---|:---|
| FastAPI, starlette | BSD-3-Clause |
| uvicorn | BSD-3-Clause |
| SQLAlchemy | MIT |
| asyncpg | Apache-2.0 |
| pydantic / pydantic-settings / pydantic-core | MIT |
| Authlib | BSD-3-Clause |
| python-jose | MIT |
| pypdf | BSD-3-Clause |
| python-multipart | Apache-2.0 |
| httpx, httpcore | BSD-3-Clause |
| google-auth | Apache-2.0 |
| requests | Apache-2.0 |
| **pikepdf** | **MPL-2.0** |

Sebaran lisensi seluruh 48: mayoritas MIT/BSD/Apache-2.0; MPL-2.0: `certifi`, `pikepdf`;
PSF/greenlet etc lihat index.json. Tidak ada AGPL/GPL di closure Python.

### 1.2 npm / frontend (30 komponen ter-install)
Daftar lengkap: **`THIRD_PARTY_NOTICES/npm/index.json`**. Termasuk komponen build-time
(`@next/swc-*` — binary SWC, TIDAK ikut di static `out/`).

| Komponen | Lisensi |
|:---|:---|
| Next.js 14.2.35, React 18.3.1, react-dom, scheduler, styled-jsx, client-only | MIT |
| axios 1.19.0 | MIT |
| lucide-react | ISC |
| pdfjs-dist 4.0.379 | Apache-2.0 |
| path2d-polyfill | MIT |

### 1.3 Sistem / Docker image
| Komponen | Versi (bookworm) | Lisensi | File |
|:---|:---|:---|:---|
| Debian GNU/Linux 12 (python:3.12-slim) | 12 | DFSG (per-paket) | `system/debian.md` |
| CPython | 3.12.x | Python-2.0 | `system/debian.md` |
| qpdf | 11.3.0-1+deb12u1 | Apache-2.0 | `system/qpdf.md` |
| LibreOffice core/writer/calc/impress/draw | 4:7.4.7-1+deb12u14 | MPL-2.0 (+LGPL-3.0) | `system/libreoffice.md` |
| curl | 7.88.1-10+deb12u5 | curl (MIT-style) | `system/curl.md` |

### 1.4 pdf.js worker
pdfjs-dist 4.0.379, Apache-2.0, © Mozilla Foundation. → `pdfjs/index.json` + `pdfjs/LICENSE-Apache-2.0.txt`.

### 1.5 Fonts di-embed (Edit PDF)
| Komponen | Versi | Lisensi | File |
|:---|:---|:---|:---|
| Lato | 2.015 | OFL-1.1 | `fonts/Lato-OFL-1.1.txt` |
| DejaVu Sans / Serif / Sans Mono | 2.37 | Bitstream Vera + DejaVu (free) | `fonts/DejaVu.txt` |

---

## 2. Ringkasan kewajiban & pemenuhan

| # | Kewajiban | Status | Bukti |
|:--|:---|:---|:---|
| 1 | SBOM CycloneDX per release (python, npm, OS image, LO+qpdf, pdfjs, fonts) | ✅ Compliant | `docs/sbom/*-cyclonedx.json` (5 file) |
| 2 | SBOM tersimpan di repo | ✅ Compliant | `docs/sbom/` |
| 3 | SBOM di Artifact Registry | ⚠️ Pending | Belum ada pipeline upload GCR/AR — langkah manual/CI (open item O-1) |
| 4 | Teks lisensi lengkap per komponen | ✅ Compliant | `THIRD_PARTY_NOTICES/{python,npm,system,pdfjs,fonts}` |
| 5 | Copyright notice per komponen | ✅ Compliant* | index.json tiap grup + header LICENSE |
| 6 | URL/source per komponen | ✅ Compliant | index.json (kolom `source`) |
| 7 | Daftar modifikasi per komponen | ✅ Compliant | index.json (`modifications: none` utk semua; satu-satunya "salinan" = pdfjs worker disalin verbatim — tanpa ubah kode) |
| 8 | Apache-2.0: LICENSE + NOTICE dipertahankan | ✅ Compliant | `_licenses/Apache-2.0.txt`; tak ada NOTICE hulu utk qpdf/pdf.js → tak ada yg disalin |
| 9 | MPL-2.0 (pikepdf, LibreOffice): source tersedia | ✅ Compliant | Tidak ada file sumber MPL yang **dimodifikasi** → tak ada source tambahan wajib. Source hulu: pikepdf (github), LO (git.libreoffice.org) |
| 10 | MPL: tandai file yang diubah | ✅ Compliant (N/A) | Tidak ada file berlisensi MPL yang diubah di repo ini |
| 11 | pdf.js: LICENSE + copyright Mozilla; header worker utuh | ✅ Compliant | `pdfjs/LICENSE-Apache-2.0.txt`; header `@licstart` di `frontend/public/pdf.worker.min.mjs` terverifikasi utuh (2026-09-04) |
| 12 | Font: LICENSE disimpan (Lato, DejaVu) | ✅ Compliant | `backend/pdf/fonts/LICENSE-*.txt` + `fonts/` |
| 13 | Font: metadata lisensi tak dihapus | ✅ Compliant | TTF di-embed UTUH (bukan subset) → name-table & lisensi terjaga |
| 14 | Font: embedding sesuai ketentuan | ✅ Compliant | OFL-1.1 & lisensi DejaVu mengizinkan embedding; nama reserved Lato dipertahankan |
| 15 | Bebas lisensi copyleft kuat (AGPL/GPL) di distribusi | ✅ Compliant | Closure Python/npm & alat PDF bebas AGPL; LibreOffice MPL/LGPL dipakai sebagai proses eksternal |

\* Copyright eksplisit (dengan tahun) tidak selalu tersedia di metadata PyPI/npm; sumber otoritatif =
header teks lisensi yang disalin. Tidak ada yang di-reka-reka.

---

## 3. Status per area

| Area | Status |
|:---|:---|
| Python dependencies | ✅ Compliant |
| npm / frontend | ✅ Compliant |
| OS & runtime image | ⚠️ Compliant parsial — komponen **eksplisit** Dockerfile terdokumentasi; dependensi **transitif** apt belum di-enumerasi |
| LibreOffice + qpdf | ✅ Compliant (versi tidak dipin → risiko drift, open item O-2) |
| pdf.js + worker | ✅ Compliant |
| Fonts ter-embed | ✅ Compliant |

---

## 4. Open items & rekomendasi

| # | Item | Aksi | Prioritas |
|:--|:---|:---|:---|
| O-1 | Upload SBOM ke Artifact Registry | Tambah step `cloudbuild.yaml`: upload `docs/sbom/*` sebagai artefak/label image | Rendah |
| O-2 | Versi OS/apt tidak dipin | Pin `qpdf`/`libreoffice-*` (mis. via `docker run` build arg / snapshot) agar SBOM stabil antar build | Sedang |
| O-3 | SBOM OS penuh (transitif apt) | Generate `syft … -o cyclonedx-json` pada image final di CI; commit hasilnya ke `docs/sbom/docker-os-cyclonedx.json` | Sedang |
| O-4 | Frekuensi regenerasi | Regenerate SBOM python+npm pada setiap `requirements.txt`/`package.json` bump, atau minimal tiap rilis | Sedang |
| O-5 | Pengisi penanggung jawab | Isi baris "Penanggung jawab" di header dokumen ini | Segera |

---

## 5. Direktori artefak (ringkas)

```
docs/sbom/                        python-cyclonedx.json · npm-cyclonedx.json
                                  docker-cyclonedx.json · pdfjs-cyclonedx.json · fonts-cyclonedx.json
THIRD_PARTY_NOTICES/              python/ npm/ system/ pdfjs/ fonts/ _licenses/ README.md
LICENSE_COMPLIANCE.md             ← file ini
backend/tools/gen_sbom.py         ← regenerasi SBOM + notices Python
frontend/scripts/gen-npm-sbom.sh  ← regenerasi SBOM + notices npm
```
