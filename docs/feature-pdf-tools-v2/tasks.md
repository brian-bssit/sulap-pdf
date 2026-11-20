# Tasks — PDF Tools v2

Prasyarat: Gelombang B dari `feature-bankwide-hardening` (save_upload, kuota) selesai.

## Gelombang A — Fondasi
- [ ] A1 `pdf/job.py` `run_job` + test (cleanup saat error, audit status, disconnect) [Req 9]
- [ ] A2 `pdf/ranges.py` parser rentang + test (`1-3,5,8-`, di luar batas, kosong) [Req 1, 3]
- [ ] A3 Dockerfile: tesseract(ind,eng), libreoffice-pdfimport; pip: pypdfium2, Pillow; SBOM + notices + LICENSE_COMPLIANCE [Req 5, 6, 7, 9]
- [ ] **Checkpoint A** — pytest lulus, `docker build` sukses

## Gelombang B — Manipulasi PDF (pikepdf/pypdf)
- [ ] B1 `split.py` + UI `SplitTool.tsx` [Req 1]
- [ ] B2 `unlock.py` + `protect.py` + UI `SecurityTool.tsx` (password tak dilog; test audit tak memuat password) [Req 2]
- [ ] B3 `scrub.py` + UI [Req 4]
- [ ] B4 Ekstrak fungsi bersama dari `edit_overlay.py` (tanpa ubah perilaku; test lama tetap hijau) → `watermark.py` + `/page-numbers` + UI [Req 3]
- [ ] **Checkpoint B** — pytest lulus; render hasil di 2 viewer (pdf.js + Preview/Acrobat)

## Gelombang C — Konversi
- [ ] C1 `img2pdf.py` + UI (reorder, orientasi, batas piksel) [Req 6]
- [ ] C2 PDF → Gambar di frontend (pdf.js canvas) [Req 6]
- [ ] C3 `to_word.py` (+ test argv & fixture teks) + UI dengan peringatan [Req 5]
- [ ] **Checkpoint C**

## Gelombang D — OCR & Compare
- [ ] D1 `ocr.py` (render pypdfium2 → tesseract → gabung) + test fixture scan 2 halaman [Req 7]
- [ ] D2 `compare.py` + UI berdampingan [Req 8]
- [ ] D3 `lib/workflow.ts` `runChain` + `WorkflowTool.tsx` (setelah tool-tool B selesai); test urutan, berhenti saat gagal, protect terakhir [Req 10]
- [ ] **Checkpoint D**

## Gelombang E — Penutup
- [ ] E1 README: fitur, endpoint, audit action baru
- [ ] E2 `@verifier` bukti penuh; verifikasi memori peak OCR 50 halaman < 3 GiB
