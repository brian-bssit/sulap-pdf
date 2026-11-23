import asyncio
import time
import uuid
import logging
from pathlib import Path

from fastapi import APIRouter, Request, Depends, Form, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from config import settings
from db.database import get_db
from auth.dependencies import get_current_user
from audit import log_audit
from pdf.compress_images import optimize_images
from pdf.dl_headers import attachment_filename
from pdf.errors import raise_if_encrypted
from pdf.upload import save_upload

logger = logging.getLogger("cloudpdf")

router = APIRouter()

# low = LOSSLESS (qpdf saja). balanced/high (UI: Balanced/Extreme) = LOSSY: gambar diperkecil ke 150/100 DPI
# + JPEG q75/q60 (pdf/compress_images.py), lalu qpdf. Default bila klien tak mengirim `level`: low.
# Tanpa --linearize: itu optimasi tampilan web, bukan pengecil ukuran.
_LEVEL_ARGS = {
    "low": ["--recompress-flate", "--compression-level=3"],
    "balanced": ["--recompress-flate", "--compression-level=6", "--object-streams=generate"],
    "high": ["--recompress-flate", "--compression-level=9", "--object-streams=generate"],
}

PDF_MAGIC = b"%PDF"


def _validate_pdf(path_str: str, max_size_mb: int) -> int:
    path = Path(path_str)
    size = path.stat().st_size
    if size > max_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File terlalu besar. Maksimal {max_size_mb} MB")
    with open(path_str, "rb") as f:
        if f.read(4) != PDF_MAGIC:
            raise HTTPException(status_code=400, detail="Format file tidak didukung. Hanya PDF")
    return size


@router.post("/compress")
async def compress_pdf(
    request: Request,
    file: UploadFile = File(...),
    level: str = Form("low"),
    grayscale: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    if level not in _LEVEL_ARGS:
        raise HTTPException(status_code=400, detail="level harus low, balanced, atau high")

    job_id = str(uuid.uuid4())[:8]
    input_path = Path(f"/tmp/cpdf_{job_id}_input.pdf")
    output_path = Path(f"/tmp/cpdf_{job_id}_output.pdf")
    opt_path = Path(f"/tmp/cpdf_{job_id}_opt.pdf")
    lossy = level != "low"
    stats = None
    start_time = time.monotonic()
    input_size = 0

    try:
        await save_upload(file, input_path, settings.max_file_size_mb * 1024 * 1024)

        input_size = _validate_pdf(str(input_path), settings.max_file_size_mb)
        await raise_if_encrypted(input_path)

        if await request.is_disconnected():
            await _audit(db, request, user, file, input_size, 0, "CANCELLED_BY_CLIENT", lossy=lossy)
            _cleanup(input_path, output_path, opt_path)
            return StreamingResponse(iter([]), status_code=499)

        qpdf_src = input_path
        if lossy:
            deadline = time.monotonic() + settings.request_timeout_seconds - 20
            try:
                stats = await run_in_threadpool(optimize_images, input_path, opt_path, level, grayscale, deadline)
            except Exception:
                raise HTTPException(status_code=422, detail="PDF tidak bisa diproses. File mungkin rusak.")
            qpdf_src = opt_path

        cmd = ["qpdf", *_LEVEL_ARGS[level], str(qpdf_src), str(output_path)]

        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )

        try:
            await asyncio.wait_for(process.wait(), timeout=settings.request_timeout_seconds - 10)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            raise HTTPException(status_code=504, detail="Proses timeout. Coba file lebih kecil")

        # qpdf exit codes: 0=OK, 1/2=error, 3=OK with warnings
        if process.returncode not in (0, 3):
            stderr = (await process.stderr.read()).decode("utf-8", errors="replace")[:500] if process.stderr else ""
            # Detail teknis (path /tmp, versi qpdf) hanya ke log — jangan ke user.
            logger.warning(f"qpdf gagal job={job_id} rc={process.returncode}: {stderr}")
            raise HTTPException(status_code=422, detail="PDF tidak bisa diproses. File mungkin rusak.")

        output_data = output_path.read_bytes()
        output_size = len(output_data)
        # Lossless tak selalu mengecilkan (PDF kecil/sudah optimal bisa membesar karena overhead
        # linearize/xref). Jangan kembalikan hasil yang lebih besar: pakai berkas asli.
        unchanged = output_size >= input_size
        if unchanged:
            output_data = input_path.read_bytes()
            output_size = input_size
        processing_ms = int((time.monotonic() - start_time) * 1000)

        await _audit(db, request, user, file, input_size, output_size, "SUCCESS", processing_ms, lossy=lossy)

        pct = round((1 - output_size / input_size) * 100) if input_size else 0
        logger.info(f"Compress {job_id}: {input_size}→{output_size} ({pct}%), {processing_ms}ms")

        stem = Path(file.filename or "document").stem
        output_filename = f"compressed_{stem}.pdf"
        return StreamingResponse(
            iter([output_data]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": attachment_filename(output_filename),
                "X-Original-Size": str(input_size),
                "X-Compressed-Size": str(output_size),
                "X-Compression": "unchanged" if unchanged else "reduced",
                **({"X-Images-Total": str(stats.total), "X-Images-Optimized": str(stats.changed)} if stats else {}),
            },
        )

    except HTTPException as e:
        await _audit(db, request, user, file, input_size, 0, "FAILED", error_msg=str(e.detail)[:500], lossy=lossy)
        raise
    except Exception as e:
        logger.error(f"Compress error job={job_id}: {e}")
        await _audit(db, request, user, file, input_size, 0, "FAILED", error_msg=str(e)[:500], lossy=lossy)
        raise HTTPException(status_code=500, detail="Gagal memproses file")
    finally:
        _cleanup(input_path, output_path, opt_path)


async def _audit(db, request, user, file, input_size, output_size, status, processing_ms=0, error_msg=None, lossy=False):
    await log_audit(
        db=db, request=request,
        user_id=str(user.id), user_email=user.email,
        action="COMPRESS_LOSSY" if lossy else "COMPRESS",
        source_files=[file.filename or "unknown"],
        result_file=f"compressed_{Path(file.filename or 'document').stem}.pdf" if status == "SUCCESS" else None,
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
