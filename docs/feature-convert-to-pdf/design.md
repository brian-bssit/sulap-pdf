# Convert to PDF — Design

**Status:** Draft → Review

---

## Architecture

```
User Browser                    Backend (FastAPI)              LibreOffice
    │                                │                            │
    ├─ POST /api/pdf/convert ───────►│                            │
    │   (multipart form: file)       │                            │
    │                                ├─ save to /tmp/cpdf_xxx_in  │
    │                                ├─ detect format (magic+ext) │
    │                                ├─ libreoffice --headless ──►│
    │                                │◄── output PDF ─────────────┤
    │                                ├─ read output               │
    │                                ├─ audit log                 │
    │◄── StreamingResponse (PDF) ────┤                            │
    │                                ├─ cleanup /tmp              │
```

## Data Flow

1. Upload file → validasi magic bytes + ekstensi → simpan ke `/tmp/cpdf_{job_id}_in.{ext}`
2. Jalankan `libreoffice --headless --convert-to pdf --outdir /tmp /tmp/cpdf_{job_id}_in.{ext}`
3. LibreOffice output: `/tmp/cpdf_{job_id}_in.pdf`
4. Baca output → StreamingResponse → download
5. Cleanup: hapus input + output dari `/tmp`

## Components

### Backend: `backend/pdf/convert.py`

```python
# Router: POST /api/pdf/convert
# Auth: get_current_user
# Input: UploadFile (single)
# Output: StreamingResponse (application/pdf)

# Allowed MIME types + extensions
ALLOWED_TYPES = {
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.oasis.opendocument.text": ".odt",
    "application/vnd.oasis.opendocument.spreadsheet": ".ods",
    "application/vnd.oasis.opendocument.presentation": ".odp",
    "application/rtf": ".rtf",
    "text/plain": ".txt",
    "text/html": ".html",
    "text/csv": ".csv",
    "application/xml": ".xml",
    "text/xml": ".xml",
}
```

### Frontend: `frontend/src/components/ConvertTool.tsx`

- Mirip `CompressTool.tsx` tapi:
  - Accept: `.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.html,.csv,.xml`
  - Icon: `FileUp` atau `RefreshCw`
  - Warna tema: violet/purple (beda dari hijau compress)
  - Label: "Convert to PDF" / "Konversi ke PDF"

## Data Models

Tidak ada perubahan schema DB. Pakai tabel `audit_logs` existing dengan action="CONVERT".

## Error Handling

| Scenario | HTTP Status | Detail |
|:---|:---|:---|
| Format tidak didukung | 400 | "Format file tidak didukung. Kirim dokumen (DOC, DOCX, XLS, etc.)" |
| File > 30MB | 413 | "File terlalu besar. Maksimal 30 MB" |
| LibreOffice gagal | 422 | "Gagal mengkonversi dokumen: {stderr}" |
| Timeout (10 menit) | 504 | "Proses timeout. Coba file lebih kecil" |
| Client disconnect | 499 | Audit log: CANCELLED_BY_CLIENT |
| Error tak dikenal | 500 | "Gagal memproses file" |

## Docker Changes

```dockerfile
# Tambahkan libreoffice-core + dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    qpdf curl libreoffice-core libreoffice-writer libreoffice-calc \
    libreoffice-impress libreoffice-draw \
    && rm -rf /var/lib/apt/lists/*
```

Package: `libreoffice-core` + component packages untuk Writer (word), Calc (excel), Impress (powerpoint), Draw (others). Estimasi tambahan image size: ~150-200MB.
