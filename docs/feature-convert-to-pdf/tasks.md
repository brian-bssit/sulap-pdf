# Convert to PDF — Tasks

**Status:** Draft → Review

---

## Tasks

### Wave 1: Backend

- [ ] [R1.1–R1.6, R3.1–R3.4] Buat `backend/pdf/convert.py` — endpoint POST `/api/pdf/convert`
  - Validasi format file (MIME type + ekstensi)
  - LibreOffice headless subprocess
  - StreamingResponse + audit log + cleanup
  - Client disconnect detection
- [ ] [R4.1] Update `Dockerfile` — tambahkan `libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress libreoffice-draw`
- [ ] Register router di `backend/router.py`

**Checkpoint:** Test backend: `curl -F "file=@test.docx" http://localhost:8080/api/pdf/convert` → download PDF

### Wave 2: Frontend

- [ ] [R2.1–R2.7] Buat `frontend/src/components/ConvertTool.tsx`
  - Upload area (drag-and-drop + file picker)
  - Accept multiple document formats
  - Loading overlay + error handling
  - Download trigger
- [ ] [R2.1] Update `frontend/src/app/dashboard/page.tsx`:
  - Tambah tab "convert" ke `Tab` type
  - Tambah nav item "Convert to PDF" dengan icon `FileUp`
  - Tambah case di `DashboardContent` switch
  - Tambah page title di `pageTitles`

**Checkpoint:** UI muncul, upload file DOCX, convert, download PDF

### Wave 3: Verify

- [ ] Build Docker image, test conversion DOCX → PDF
- [ ] Test XLSX → PDF
- [ ] Test format tidak didukung → error 400
- [ ] Test file > 30MB → error 413
- [ ] Test client disconnect → audit log CANCELLED
