import json
import logging
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from pypdf import PdfReader, PdfWriter
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from config import settings
from db.database import get_db
from auth.dependencies import get_current_user
from audit import log_audit
from pdf.dl_headers import attachment_filename

logger = logging.getLogger("cloudpdf")

router = APIRouter()
PDF_MAGIC = b"%PDF"


@router.post("/remove-pages")
async def remove_pages(
    request: Request,
    file: UploadFile = File(...),
    pages_to_remove: str = Form("[]"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Hapus halaman tertentu dari PDF. pages_to_remove = JSON array 0-based."""
    job_id = str(uuid.uuid4())[:8]
    input_path = Path(f"/tmp/cpdf_{job_id}_input.pdf")
    output_path = Path(f"/tmp/cpdf_{job_id}_output.pdf")
    start_time = time.monotonic()
    input_size = 0
    stem = Path(file.filename or "document").stem

    try:
        try:
            remove = json.loads(pages_to_remove)
        except (json.JSONDecodeError, TypeError):
            raise HTTPException(status_code=400, detail="pages_to_remove harus array integer")
        if not isinstance(remove, list) or not all(isinstance(i, int) and not isinstance(i, bool) for i in remove):
            raise HTTPException(status_code=400, detail="pages_to_remove harus array integer")

        content = await file.read()
        input_path.write_bytes(content)
        del content

        input_size = input_path.stat().st_size
        if input_size > settings.max_file_size_mb * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"File terlalu besar. Maks {settings.max_file_size_mb}MB")

        with open(input_path, "rb") as f:
            if f.read(4) != PDF_MAGIC:
                raise HTTPException(status_code=400, detail="Format file tidak didukung")

        if await request.is_disconnected():
            await _audit_fast(db, request, user, file, input_size, 0, "CANCELLED_BY_CLIENT")
            _cleanup(input_path, output_path)
            return StreamingResponse(iter([]), status_code=499)

        try:
            total_pages, pages_after = await run_in_threadpool(_process, input_path, output_path, remove)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        output_data = output_path.read_bytes()
        output_size = len(output_data)
        processing_ms = int((time.monotonic() - start_time) * 1000)

        await _audit_fast(db, request, user, file, input_size, output_size, "SUCCESS", processing_ms)

        logger.info(f"Remove-pages {job_id}: {total_pages}p→{pages_after}p, {processing_ms}ms")

        return StreamingResponse(
            iter([output_data]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": attachment_filename(f"trimmed_{stem}.pdf"),
                "X-Pages-Before": str(total_pages),
                "X-Pages-After": str(pages_after),
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Remove-pages error job={job_id}: {e}")
        await _audit_fast(db, request, user, file, input_size, 0, "FAILED", error_msg=str(e)[:500])
        raise HTTPException(status_code=500, detail="Gagal menghapus halaman")
    finally:
        _cleanup(input_path, output_path)


def _process(input_path: Path, output_path: Path, remove: list[int]) -> tuple[int, int]:
    reader = PdfReader(str(input_path))
    total = len(reader.pages)
    if total > settings.max_pages_rearrange:
        raise HTTPException(status_code=400, detail=f"Maksimal {settings.max_pages_rearrange} halaman")

    remove_set = set(remove)
    if any(i < 0 or i >= total for i in remove_set):
        raise ValueError("Indeks halaman di luar jangkauan")

    keep_indices = [i for i in range(total) if i not in remove_set]
    if not keep_indices:
        raise HTTPException(status_code=400, detail="Setidaknya 1 halaman harus tersisa")

    writer = PdfWriter()
    for i in keep_indices:
        writer.add_page(reader.pages[i])

    writer.write(str(output_path))
    reader.stream.close() if hasattr(reader, "stream") and reader.stream else None
    return total, len(keep_indices)


async def _audit_fast(db, request, user, file, input_size, output_size, status, processing_ms=0, error_msg=None):
    await log_audit(
        db=db, request=request,
        user_id=str(user.id), user_email=user.email,
        action="REMOVE_PAGES",
        source_files=[file.filename or "unknown"],
        result_file=f"trimmed_{Path(file.filename or 'document').stem}.pdf" if status == "SUCCESS" else None,
        file_sizes=[input_size],
        result_size=output_size if status == "SUCCESS" else None,
        processing_ms=processing_ms,
        status=status,
        error_message=error_msg,
    )


def _cleanup(*paths: Path):
    for p in paths:
        try:
            p.unlink(missing_ok=True)
        except OSError:
            pass
