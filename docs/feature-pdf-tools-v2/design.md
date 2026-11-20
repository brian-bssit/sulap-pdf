# Design — PDF Tools v2

## Architecture
```
Browser tool (React) → POST /api/pdf/<tool> multipart
  → auth → kuota → pdf/job.run_job(...)  # save_upload, hitung, audit, stream, cleanup
  → engine: pikepdf | pypdf | LibreOffice | pypdfium2+tesseract | pdfplumber
```
Ladder: pakai ulang pola `compress.py`, tapi 10 endpoint baru tidak boleh menyalin 130 baris masing-masing → satu helper `pdf/job.py` (hanya dipakai kode baru; endpoint lama tidak di-refactor).

## Components & Interfaces

### `pdf/job.py` (baru)
```python
@dataclass
class Job: id: str; dir: Path   # /tmp/cpdf_{id}_/ — satu direktori per job → cleanup rmtree 1 panggilan (prefix cpdf_ tetap dipantau sweeper)
async def run_job(request, db, user, action, files, work, *, filename_out, media_type, headers_fn) -> StreamingResponse
# work: Callable[[Job, list[Path]], Awaitable[Path | bytes]] → dijalankan dalam threadpool/subprocess
```
Menangani: save_upload (stream), cek disconnect, timeout, audit SUCCESS/FAILED/CANCELLED_BY_CLIENT, header `Content-Disposition` via `dl_headers`, cleanup.

### Per tool (satu berkas di `backend/pdf/`)
| Berkas | Endpoint | Mesin | Catatan |
|---|---|---|---|
| `split.py` | `POST /split` `file`, `ranges` \| `every_n` | pypdf | ZIP via `zipfile` stdlib; parser rentang dipakai ulang oleh watermark/nomor |
| `unlock.py` | `POST /unlock` `file`, `password` | pikepdf | `pikepdf.open(password=)` → `save()` tanpa enkripsi |
| `protect.py` | `POST /protect` `file`, `password`, `allow_print`, `allow_copy` | pikepdf | `Encryption(owner=…, user=…, R=6)` AES-256 |
| `watermark.py` | `POST /watermark`, `POST /page-numbers` | pikepdf + `edit_overlay` | memanggil fungsi pembangun content-stream & font embed yang sudah ada; ekstrak fungsi privat jadi impor, tanpa mengubah perilaku |
| `scrub.py` | `POST /scrub-metadata` | pikepdf | `del pdf.docinfo[...]`, hapus `/Metadata`, `/EmbeddedFiles`, `/OpenAction`, `/AA`, `/JavaScript` (pakai ulang catalog scrub dari edit_overlay) |
| `to_word.py` | `POST /to-word` | LibreOffice `--infilter="writer_pdf_import" --convert-to docx:"MS Word 2007 XML"` | profil terisolasi + hardening yang sama dengan convert; butuh paket `libreoffice-pdfimport`; `_LIBREOFFICE_BIN`/profil diekspor dari `convert.py` |
| `img2pdf.py` | `POST /images-to-pdf` `files[]` | Pillow | `Image.save(..., save_all=True, append_images=...)`; `ImageOps.exif_transpose`; batas piksel (`Image.MAX_IMAGE_PIXELS`) untuk cegah decompression bomb |
| `ocr.py` | `POST /ocr` `file`, `lang` | pypdfium2 (render) + tesseract CLI (`tesseract in.png out pdf`) + pypdf (gabung) | tanpa Ghostscript/ocrmypdf (AGPL risk); halaman yang sudah bertext dilewati (`extract_text()` tak kosong); `lang` ∈ whitelist `ind`,`eng`,`ind+eng`; DPI render 200 |
| `compare.py` | `POST /compare` `file_a`, `file_b` | pypdf `extract_text` + `difflib.SequenceMatcher` (kata) | respons JSON `{pages:[{n, ops:[{t:'eq'\|'add'\|'del', text}]}], summary}`; batas 100 halaman/berkas |

PDF → Gambar: frontend saja (`pdfjs-dist` canvas → `toBlob`), ZIP dengan `fflate`? Tambah dependency hanya bila perlu: unduh satuan dulu; ZIP memakai tulis manual STORE (tanpa lib) — keputusan implementasi, YAGNI.

### Frontend
Satu komponen per tool di `frontend/src/components/` meniru pola `CompressTool.tsx`; entri di `navItems` `dashboard/page.tsx`. Komponen bersama: `FileDrop` bila belum ada — cek dulu duplikasi di tool lama, ekstrak hanya jika ≥3 pemakai.

### Alur berantai (frontend saja)
`components/WorkflowTool.tsx` + `lib/workflow.ts`: daftar langkah `{id, endpoint, buildForm(blob, opts)}` untuk tool 1-file; `runChain(file, steps, onProgress)` memanggil `api.post(endpoint, form, {responseType:"blob"})` berurutan, blob keluaran → masukan berikut. Tanpa endpoint/DB baru. Validasi: `protect` hanya boleh terakhir. Logika murni `runChain` dites dengan Vitest (axios di-mock).

### Dockerfile
`apt`: `tesseract-ocr tesseract-ocr-ind tesseract-ocr-eng libreoffice-pdfimport`. pip: `pypdfium2`, `Pillow`. Setiap dependency baru → regenerasi SBOM + `THIRD_PARTY_NOTICES` (`tools/gen_sbom.py`) dan alasan di `LICENSE_COMPLIANCE.md`.

## Data Models
Tidak ada tabel baru. Action baru hanya nilai string di `audit_logs.action` (VARCHAR 50). Password tidak pernah dipetakan ke kolom apa pun; `source_files` hanya nama berkas.

## Error Handling
| Skenario | Perilaku |
|---|---|
| Rentang tidak valid | 400 + contoh format |
| Password salah (unlock) | 422 "Password salah" (tanpa detail enkripsi) |
| PDF scan di `to-word` | konversi jalan; UI sarankan OCR; tidak ditolak |
| OCR > 50 halaman / timeout | 413/504, file parsial dihapus |
| Gambar korup / terlalu besar piksel | 400 |
| Tidak ada tabel (to-xlsx) | 422 |
| tesseract/soffice tak ada di image | 503 + log; health readiness gagal |
| Klien putus | 499, audit CANCELLED_BY_CLIENT |
