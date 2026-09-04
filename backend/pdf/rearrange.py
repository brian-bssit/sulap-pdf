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
MAX_OPS = 500
_ALLOWED_ACTIONS = {"reorder", "rotate", "delete", "move"}


class OpsError(Exception):
    """Operasi valid secara JSON tapi tak masuk akal (idx di luar, dsb) → 400."""


def _validate_ops(operations: str) -> list[dict]:
    try:
        ops = json.loads(operations)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=400, detail="Format operasi tidak valid")
    if not isinstance(ops, list):
        raise HTTPException(status_code=400, detail="Operasi harus berupa array")
    if len(ops) > MAX_OPS:
        raise HTTPException(status_code=400, detail=f"Maksimal {MAX_OPS} operasi per request")

    validated = []
    for op in ops:
        if not isinstance(op, dict):
            raise HTTPException(status_code=400, detail="Setiap operasi harus berupa objek")
        action = op.get("action")
        if action not in _ALLOWED_ACTIONS:
            raise HTTPException(status_code=400, detail=f"Aksi tidak dikenal: {action}")
        if action == "reorder":
            order = op.get("order")
            if not isinstance(order, list) or not all(
                isinstance(i, int) and not isinstance(i, bool) for i in order
            ):
                raise HTTPException(status_code=400, detail="reorder.order harus array integer")
        else:
            page = op.get("page", -1)
            if not isinstance(page, int) or isinstance(page, bool):
                raise HTTPException(status_code=400, detail=f"{action}.page harus integer")
            if action == "rotate":
                angle = op.get("angle", 90)
                if not isinstance(angle, int) or isinstance(angle, bool) or angle % 90 != 0:
                    raise HTTPException(status_code=400, detail="rotate.angle harus kelipatan 90")
            if action == "move":
                to = op.get("to")
                if not isinstance(to, int) or isinstance(to, bool):
                    raise HTTPException(status_code=400, detail="move.to harus integer")
        validated.append(op)
    return validated


def _process(input_path: Path, output_path: Path, ops: list[dict]) -> tuple[int, int]:
    """Jalan di threadpool (pypdf sinkron). Return (total_pages, pages_after)."""
    reader = PdfReader(str(input_path))
    total_pages = len(reader.pages)
    if total_pages > settings.max_pages_rearrange:
        raise HTTPException(status_code=400, detail=f"Maksimal {settings.max_pages_rearrange} halaman")

    pages = [{"index": i, "rotation": 0} for i in range(total_pages)]

    for op in ops:
        action = op["action"]
        if action == "reorder":
            order = op["order"]
            if any(i < 0 or i >= len(pages) for i in order):
                raise OpsError("reorder.order memuat index di luar jangkauan")
            if set(order) != set(range(len(pages))):
                raise OpsError("reorder.order harus permutasi semua halaman")
            pages = [pages[i] for i in order]

        elif action == "rotate":
            idx = op["page"]
            if not (0 <= idx < len(pages)):
                raise OpsError("rotate.page di luar jangkauan")
            pages[idx]["rotation"] = (pages[idx]["rotation"] + int(op.get("angle", 90))) % 360

        elif action == "delete":
            idx = op["page"]
            if not (0 <= idx < len(pages)):
                raise OpsError("delete.page di luar jangkauan")
            pages.pop(idx)

        elif action == "move":
            idx = op["page"]
            to = op["to"]
            if not (0 <= idx < len(pages) and 0 <= to < len(pages)):
                raise OpsError("move.page/to di luar jangkauan")
            item = pages.pop(idx)
            pages.insert(to, item)

    if not pages:
        raise HTTPException(status_code=400, detail="Tidak ada halaman tersisa")

    writer = PdfWriter()
    for page_info in pages:
        page = reader.pages[page_info["index"]]
        if page_info["rotation"]:
            page.rotate(page_info["rotation"])
        writer.add_page(page)

    writer.write(str(output_path))
    reader.stream.close() if hasattr(reader, "stream") and reader.stream else None
    return total_pages, len(pages)


@router.post("/rearrange")
async def rearrange_pdf(
    request: Request,
    file: UploadFile = File(...),
    operations: str = Form("[]"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Atur ulang halaman PDF: reorder, rotate, delete, move."""
    job_id = str(uuid.uuid4())[:8]
    input_path = Path(f"/tmp/cpdf_{job_id}_input.pdf")
    output_path = Path(f"/tmp/cpdf_{job_id}_output.pdf")
    start_time = time.monotonic()
    input_size = 0
    stem = Path(file.filename or "document").stem

    try:
        ops = _validate_ops(operations)

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
            total_pages, pages_after = await run_in_threadpool(_process, input_path, output_path, ops)
        except OpsError as e:
            raise HTTPException(status_code=400, detail=str(e))

        output_data = output_path.read_bytes()
        output_size = len(output_data)
        processing_ms = int((time.monotonic() - start_time) * 1000)

        await _audit_fast(db, request, user, file, input_size, output_size, "SUCCESS", processing_ms)

        logger.info(f"Rearrange {job_id}: {total_pages}p→{pages_after}p, {processing_ms}ms")

        return StreamingResponse(
            iter([output_data]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": attachment_filename(f"rearranged_{stem}.pdf"),
                "X-Pages-Before": str(total_pages),
                "X-Pages-After": str(pages_after),
            },
        )

    except HTTPException as e:
        # 4xx pun tercatat — kesalahan klien (ops invalid, format salah) terlihat di audit.
        await _audit_fast(db, request, user, file, input_size, 0, "FAILED", error_msg=str(e.detail)[:500])
        raise
    except Exception as e:
        logger.error(f"Rearrange error job={job_id}: {e}")
        await _audit_fast(db, request, user, file, input_size, 0, "FAILED", error_msg=str(e)[:500])
        raise HTTPException(status_code=500, detail="Gagal mengatur ulang halaman")
    finally:
        _cleanup(input_path, output_path)


async def _audit_fast(db, request, user, file, input_size, output_size, status, processing_ms=0, error_msg=None):
    await log_audit(
        db=db, request=request,
        user_id=str(user.id), user_email=user.email,
        action="REARRANGE",
        source_files=[file.filename or "unknown"],
        result_file=f"rearranged_{Path(file.filename or 'document').stem}.pdf" if status == "SUCCESS" else None,
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
