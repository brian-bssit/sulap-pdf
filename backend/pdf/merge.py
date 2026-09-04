import logging
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Request, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from pypdf import PdfWriter, PdfReader

from config import settings
from db.database import get_db
from auth.dependencies import get_current_user
from audit import log_audit

logger = logging.getLogger("cloudpdf")

router = APIRouter()

PDF_MAGIC = b"%PDF"


async def _read_and_validate(file: UploadFile, max_size_mb: int) -> tuple[bytes, str, int]:
    """Read file content, validate PDF header, return (content, filename, size)."""
    content = await file.read()
    if len(content) < 4 or content[:4] != PDF_MAGIC:
        raise HTTPException(status_code=400, detail=f"Format tidak didukung: {file.filename}")
    if len(content) > max_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File terlalu besar ({file.filename}). Maks {max_size_mb}MB")
    return content, (file.filename or "unknown"), len(content)


def _merge_on_disk(tmp_paths: list[Path], output_path: Path) -> None:
    """Parse+copy pypdf sinkron — dipanggil via threadpool biar event loop lega."""
    writer = PdfWriter()
    for tmp_path in tmp_paths:
        reader = PdfReader(str(tmp_path))
        for page in reader.pages:
            writer.add_page(page)
    writer.write(str(output_path))


@router.post("/merge")
async def merge_pdfs(
    request: Request,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Gabungkan multiple PDF via pypdf. Long-running."""
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Minimal 2 file untuk digabungkan")
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maksimal 10 file")

    job_id = str(uuid.uuid4())[:8]
    start_time = time.monotonic()
    tmp_files: list[Path] = []
    source_names: list[str] = []
    source_sizes: list[int] = []
    total_input = 0

    try:
        # Read all files to memory (30MB total limit across files)
        file_data: list[bytes] = []
        for upload_file in files:
            if await request.is_disconnected():
                await _audit(db, request, user, source_names, source_sizes, 0, "CANCELLED_BY_CLIENT")
                return StreamingResponse(iter([]), status_code=499)

            content, name, size = await _read_and_validate(upload_file, settings.max_file_size_mb)
            file_data.append(content)
            source_names.append(name)
            source_sizes.append(size)
            total_input += size

        if total_input > settings.max_file_size_mb * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"Total file > {settings.max_file_size_mb}MB")

        # Tulis semua file ke disk (read loop async), lalu parse+copy pypdf di
        # threadpool — writer/reader tak menyentuh event loop.
        tmp_paths: list[Path] = []
        for i, data in enumerate(file_data):
            tmp_path = Path(f"/tmp/cpdf_{job_id}_p{i}.pdf")
            tmp_path.write_bytes(data)
            tmp_files.append(tmp_path)
            tmp_paths.append(tmp_path)

        output_path = Path(f"/tmp/cpdf_{job_id}_merged.pdf")
        tmp_files.append(output_path)
        await run_in_threadpool(_merge_on_disk, tmp_paths, output_path)
        output_data = output_path.read_bytes()
        output_size = len(output_data)
        processing_ms = int((time.monotonic() - start_time) * 1000)

        await _audit(db, request, user, source_names, source_sizes, output_size, "SUCCESS", processing_ms)

        logger.info(f"Merge {job_id}: {len(files)} files, {total_input}→{output_size} bytes, {processing_ms}ms")

        return StreamingResponse(
            iter([output_data]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": 'attachment; filename="merged.pdf"',
                "X-Input-Files": str(len(files)),
                "X-Output-Size": str(output_size),
            },
        )

    except HTTPException as e:
        await _audit(db, request, user, source_names, source_sizes, 0, "FAILED", error_msg=str(e.detail)[:500])
        raise
    except Exception as e:
        logger.error(f"Merge error job={job_id}: {e}")
        await _audit(db, request, user, source_names, source_sizes, 0, "FAILED", error_msg=str(e)[:500])
        raise HTTPException(status_code=500, detail="Gagal menggabungkan file")
    finally:
        for p in tmp_files:
            try:
                p.unlink(missing_ok=True)
            except OSError:
                pass


async def _audit(
    db, request, user, source_names: list[str], sizes: list[int],
    output_size: int, status: str, processing_ms: int = 0, error_msg: str | None = None,
):
    await log_audit(
        db=db, request=request,
        user_id=str(user.id), user_email=user.email,
        action="MERGE",
        source_files=source_names,
        result_file="merged.pdf" if status == "SUCCESS" else None,
        file_sizes=sizes,
        result_size=output_size if status == "SUCCESS" else None,
        processing_ms=processing_ms,
        status=status,
        error_message=error_msg,
    )
