"""Kerangka bersama endpoint PDF baru (PDF Tools v2): satu direktori kerja per job,
upload streaming, audit, timeout, respons, dan cleanup. Endpoint lama tidak memakainya."""

import asyncio
import logging
import shutil
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable

from fastapi import HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from audit import log_audit
from config import settings
from pdf.dl_headers import attachment_filename
from pdf.errors import raise_if_encrypted
from pdf.upload import save_upload

logger = logging.getLogger("cloudpdf")

PDF_MAGIC = b"%PDF"


@dataclass
class Job:
    id: str
    dir: Path  # /tmp/cpdf_<id>_ — prefix cpdf_ tetap dipantau sweeper


Work = Callable[[Job, list[Path]], Awaitable[Path | bytes]]


async def run_job(
    request: Request,
    db,
    user,
    action: str,
    files: list[UploadFile],
    work: Work,
    *,
    filename_out: str,
    media_type: str = "application/pdf",
    headers_fn: Callable[[int, int], dict[str, str]] | None = None,
    require_pdf: bool = True,
    check_encrypted: bool = True,
) -> StreamingResponse:
    """Simpan `files` ke direktori job, jalankan `work(job, input_paths)` (harus mengembalikan
    Path atau bytes hasil), audit, lalu kembalikan sebagai unduhan. Direktori job selalu dihapus."""
    job_id = uuid.uuid4().hex[:8]
    job = Job(id=job_id, dir=Path(f"/tmp/cpdf_{job_id}_"))
    job.dir.mkdir()
    start = time.monotonic()
    names = [f.filename or "unknown" for f in files]
    sizes: list[int] = []

    async def audit(status: str, out_size: int = 0, error: str | None = None):
        await log_audit(
            db=db, request=request, user_id=str(user.id), user_email=user.email, action=action,
            source_files=names, result_file=filename_out if status == "SUCCESS" else None,
            file_sizes=sizes, result_size=out_size if status == "SUCCESS" else None,
            processing_ms=int((time.monotonic() - start) * 1000), status=status, error_message=error,
        )

    try:
        limit = settings.max_file_size_mb * 1024 * 1024
        paths: list[Path] = []
        for i, f in enumerate(files):
            p = job.dir / f"in{i}"
            sizes.append(await save_upload(f, p, limit - sum(sizes), detail=f"Total file > {settings.max_file_size_mb}MB"))
            paths.append(p)
            if sizes[-1] == 0:
                raise HTTPException(status_code=400, detail="File kosong")
            if require_pdf:
                with open(p, "rb") as fh:
                    if fh.read(4) != PDF_MAGIC:
                        raise HTTPException(status_code=400, detail=f"Format tidak didukung: {names[i]}. Hanya PDF")
                if check_encrypted:
                    await raise_if_encrypted(p)

        if await request.is_disconnected():
            await audit("CANCELLED_BY_CLIENT")
            return StreamingResponse(iter([]), status_code=499)

        try:
            result = await asyncio.wait_for(work(job, paths), timeout=settings.request_timeout_seconds - 10)
        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="Proses timeout. Coba file lebih kecil")

        data = result if isinstance(result, bytes) else result.read_bytes()
        await audit("SUCCESS", len(data))
        headers = {"Content-Disposition": attachment_filename(filename_out)}
        if headers_fn:
            headers.update(headers_fn(sum(sizes), len(data)))
        return StreamingResponse(iter([data]), media_type=media_type, headers=headers)

    except HTTPException as e:
        await audit("FAILED", error=str(e.detail)[:500])
        raise
    except Exception as e:
        logger.error(f"{action} error job={job_id}: {e}")
        await audit("FAILED", error="internal error")
        raise HTTPException(status_code=500, detail="Gagal memproses file")
    finally:
        shutil.rmtree(job.dir, ignore_errors=True)
