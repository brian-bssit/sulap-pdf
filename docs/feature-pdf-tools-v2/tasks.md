# Tasks — PDF Tools v2

Prasyarat: Gelombang B dari `feature-bankwide-hardening` (save_upload, kuota) selesai.

## Gelombang A — Fondasi
- [x] A1 `pdf/job.py` `run_job` + test (cleanup saat error, audit status, disconnect) [Req 9]
- [x] A2 `pdf/ranges.py` parser rentang + test (`1-3,5,8-`, di luar batas, kosong) [Req 1, 3]
- [ ] A3 Dockerfile: tesseract(ind,eng), libreoffice-pdfimport; pip: pypdfium2, Pillow; SBOM + notices + LICENSE_COMPLIANCE [Req 5, 6, 7, 9]
  - Ditunda ke gelombang pemakai pertama (YAGNI; Docker tidak tersedia di mesin dev untuk memverifikasi build): Pillow di C1, libreoffice-pdfimport di C3, pypdfium2+tesseract di D1.
- [ ] **Checkpoint A** — pytest lulus, `docker build` sukses

## Gelombang B — Manipulasi PDF (pikepdf/pypdf)
- [x] B1 `split.py` + UI `SplitTool.tsx` [Req 1] — UI memakai kerangka bersama `PdfToolFrame.tsx` + `ModeRadio.tsx` (≥3 pemakai); unlock+protect digabung di `security.py`, watermark+nomor di `watermark.py`
- [x] B2 `unlock.py` + `protect.py` + UI `SecurityTool.tsx` (password tak dilog; test audit tak memuat password) [Req 2]
- [x] B3 `scrub.py` + UI [Req 4]
- [x] B4 Ekstrak fungsi bersama dari `edit_overlay.py` (tanpa ubah perilaku; test lama tetap hijau) → `watermark.py` + `/page-numbers` + UI [Req 3]
- [x] **Checkpoint B** — pytest lulus; render hasil di 2 viewer (pdf.js + Preview/Acrobat)

## Gelombang C — Konversi
- [x] C1 `img2pdf.py` + UI (reorder, A4/ikuti gambar, batas piksel; orientasi = EXIF + landscape/portrait otomatis) [Req 6]
- [x] C2 PDF → Gambar di frontend (pdf.js canvas) [Req 6]
- [x] C3 `to_word.py` (+ test argv & fixture teks) + UI dengan peringatan [Req 5]
- [x] **Checkpoint C** — kecuali `docker build` (Docker tidak ada di mesin dev; `libreoffice-pdfimport` ditambah di Dockerfile, belum terbukti terpasang di image)

## Gelombang D — OCR & Compare
- [x] D1 `ocr.py` (tesseract dijalankan dengan cwd=job dir + nama relatif: Leptonica macOS memetakan ulang path /tmp) (render pypdfium2 → tesseract → gabung) + test fixture scan 2 halaman [Req 7]
- [x] D2 `compare.py` + UI berdampingan [Req 8]
- [x] D3 `lib/workflow.ts` `runChain` + `WorkflowTool.tsx` (setelah tool-tool B selesai); test urutan, berhenti saat gagal, protect terakhir [Req 10]
- [x] **Checkpoint D** — OCR 50 halaman terukur: 57 dtk, puncak RSS python ≈ 960 MB + tesseract ≈ 100 MB (< 3 GiB). Catatan: PDF hasil 70,9 MB dari input 15,2 MB (PNG 200 dpi tertanam)

## Gelombang E — Penutup
- [x] E1 README: fitur, endpoint, audit action baru
- [ ] E2 `@verifier` bukti penuh; verifikasi memori peak OCR 50 halaman < 3 GiB
