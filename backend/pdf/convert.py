import asyncio
import os
import resource
import shutil
import signal
import time
import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, Request, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.database import get_db
from auth.dependencies import get_current_user
from audit import log_audit
from pdf.dl_headers import attachment_filename
from pdf.upload import save_upload

logger = logging.getLogger("cloudpdf")

router = APIRouter()

# soffice (macOS/universal) preferred, libreoffice (Linux wrapper) fallback
_LIBREOFFICE_BIN = "soffice" if shutil.which("soffice") else "libreoffice"

# Profil LO per-job di-seed: makro dimatikan total (level 3 + disable), link eksternal
# tak di-update saat load (Link: 0=Always 1=On request 2=Never; Writer & Calc).
# Kunci diverifikasi terhadap registry/main.xcd LibreOffice terpasang.
_LO_XCU = """<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Writer/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Content/Update"><prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>
</oor:items>
"""

_FSIZE_LIMIT = 200 * 1024 * 1024


def _seed_lo_profile(lo_profile: Path) -> None:
    user_dir = lo_profile / "user"
    user_dir.mkdir(parents=True, exist_ok=True)
    (user_dir / "registrymodifications.xcu").write_text(_LO_XCU, encoding="utf-8")


def _child_limits() -> None:
    """Dipanggil di child sebelum exec. CPU = batas wall-clock request; file output ≤ 200 MiB.
    RLIMIT_AS sengaja TIDAK dipasang: LibreOffice memetakan banyak memori virtual dan
    crash bila dibatasi; memori sudah dibatasi cgroup Cloud Run (4 GiB)."""
    cpu = settings.request_timeout_seconds
    resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))
    resource.setrlimit(resource.RLIMIT_FSIZE, (_FSIZE_LIMIT, _FSIZE_LIMIT))


def _build_convert_cmd(lo_profile: Path, input_path: Path) -> list[str]:
    """Argv soffice headless. Profil UserInstallation unik per-job (cegah konflik lock
    antar request paralel). WAJIB satu token `-env:X=Y` (strip TUNGGAL, nilai menyatu
    dengan =): bentuk `--env:` dua strip / dua token terpisah ditolak LibreOffice
    ("Error in option") — regresi ini sempat lolos ke produksi."""
    return [
        _LIBREOFFICE_BIN,
        "--headless",
        "--norestore",
        f"-env:UserInstallation=file://{lo_profile}",
        "--convert-to", "pdf",
        "--outdir", str(input_path.parent),
        str(input_path),
    ]

# MIME → recommended extension (fallback kalau browser kirim generic MIME)
_MIME_TO_EXT: dict[str, str] = {
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
    "text/rtf": ".rtf",
    "text/plain": ".txt",
    "text/html": ".html",
    "text/csv": ".csv",
    "application/xml": ".xml",
    "text/xml": ".xml",
    "application/vnd.oasis.opendocument.graphics": ".odg",
    "application/vnd.oasis.opendocument.formula": ".odf",
}

_ALLOWED_EXTENSIONS: set[str] = {
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".odt", ".ods", ".odp", ".odg", ".odf",
    ".rtf", ".txt", ".html", ".htm", ".csv", ".xml",
    ".wpd", ".wps", ".pages",
}

# Extensions yang TIDAK bisa dikonversi (gambar, binary, PDF sendiri)
_BLOCKED_EXTENSIONS: set[str] = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".zip", ".rar", ".7z", ".exe", ".dmg"}

PDF_MAGIC = b"%PDF"


def _validate_document(filename: str, content_type: str | None, size: int) -> str:
    """Validate file is a convertible document. Returns lowercase extension with dot."""
    ext = Path(filename).suffix.lower() if "." in filename else ""

    # Reject PDF (already PDF)
    if ext == ".pdf":
        raise HTTPException(status_code=400, detail="File sudah dalam format PDF. Tidak perlu dikonversi.")

    # Reject blocked extensions
    if ext in _BLOCKED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Format file tidak didukung: {ext}")

    # Check MIME type first
    if content_type and content_type in _MIME_TO_EXT:
        return _MIME_TO_EXT[content_type]

    # Fallback: extension-based
    if ext in _ALLOWED_EXTENSIONS:
        return ext

    raise HTTPException(
        status_code=400,
        detail="Format file tidak didukung. Kirim dokumen (DOC, DOCX, XLS, XLSX, PPT, PPTX, ODT, RTF, TXT, HTML, CSV, dll.)",
    )


@router.post("/convert")
async def convert_to_pdf(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    job_id = str(uuid.uuid4())[:8]
    safe_ext = _validate_document(file.filename or "unknown", file.content_type, 0)
    input_path = Path(f"/tmp/cpdf_{job_id}_in{safe_ext}")
    output_path = Path(f"/tmp/cpdf_{job_id}_in.pdf")  # LibreOffice output naming
    # Profil UserInstallation UNIK per job: profil default bersama bikin konflik
    # lock antar request paralel ("another instance of LibreOffice is running").
    lo_profile = Path(f"/tmp/cpdf_{job_id}_lo")
    start_time = time.monotonic()
    input_size = 0

    try:
        input_size = await save_upload(file, input_path, settings.max_file_size_mb * 1024 * 1024)

        if input_size == 0:
            raise HTTPException(status_code=400, detail="File kosong")

        if await request.is_disconnected():
            await _audit(db, request, user, file, input_size, 0, "CANCELLED_BY_CLIENT")
            _cleanup(input_path, output_path, lo_profile)
            return StreamingResponse(iter([]), status_code=499)

        _seed_lo_profile(lo_profile)
        cmd = _build_convert_cmd(lo_profile, input_path)

        # Sesi baru → seluruh pohon proses (wrapper soffice + soffice.bin) bisa dibunuh sekaligus.
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
            preexec_fn=_child_limits,
        )

        try:
            # communicate() menguras pipe; wait() bisa deadlock bila keluaran > buffer pipe.
            _, stderr_bytes = await asyncio.wait_for(
                process.communicate(), timeout=settings.request_timeout_seconds - 10
            )
        except asyncio.TimeoutError:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            await process.wait()
            raise HTTPException(status_code=504, detail="Proses timeout. Coba file lebih kecil")
        finally:
            # Anak yang tersisa setelah wrapper keluar tidak boleh yatim.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass

        if process.returncode != 0:
            stderr = stderr_bytes.decode("utf-8", errors="replace")[:500]
            raise HTTPException(status_code=422, detail=f"Dokumen tidak bisa dikonversi: {stderr}")

        if not output_path.exists() or output_path.stat().st_size == 0:
            raise HTTPException(status_code=422, detail="Konversi gagal — file output kosong")

        output_data = output_path.read_bytes()
        output_size = len(output_data)
        processing_ms = int((time.monotonic() - start_time) * 1000)

        await _audit(db, request, user, file, input_size, output_size, "SUCCESS", processing_ms)

        logger.info(
            f"Convert {job_id}: {file.filename} ({input_size} bytes) → PDF ({output_size} bytes), {processing_ms}ms"
        )

        stem = Path(file.filename or "document").stem
        output_filename = f"{stem}.pdf"

        return StreamingResponse(
            iter([output_data]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": attachment_filename(output_filename),
                "X-Original-Size": str(input_size),
                "X-Converted-Size": str(output_size),
            },
        )

    except HTTPException as e:
        await _audit(db, request, user, file, input_size, 0, "FAILED", error_msg=str(e.detail)[:500])
        raise
    except Exception as e:
        logger.error(f"Convert error job={job_id}: {e}")
        await _audit(db, request, user, file, input_size, 0, "FAILED", error_msg=str(e)[:500])
        raise HTTPException(status_code=500, detail="Gagal memproses file")
    finally:
        _cleanup(input_path, output_path, lo_profile)


async def _audit(db, request, user, file, input_size, output_size, status, processing_ms=0, error_msg=None):
    await log_audit(
        db=db,
        request=request,
        user_id=str(user.id),
        user_email=user.email,
        action="CONVERT",
        source_files=[file.filename or "unknown"],
        result_file=f"{Path(file.filename or 'document').stem}.pdf" if status == "SUCCESS" else None,
        file_sizes=[input_size],
        result_size=output_size if status == "SUCCESS" else None,
        processing_ms=processing_ms,
        status=status,
        error_message=error_msg,
    )


def _cleanup(*paths: Path):
    for p in paths:
        try:
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)
            else:
                p.unlink(missing_ok=True)
        except OSError:
            pass
