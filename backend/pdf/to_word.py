"""PDF → DOCX (best-effort) lewat LibreOffice (filter writer_pdf_import). Hardening sama dengan convert.py:
profil per-job, makro mati, batas CPU/ukuran, seluruh pohon proses dibunuh saat timeout."""

import asyncio
import logging
import os
import re
import signal
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from auth.dependencies import get_current_user
from config import settings
from db.database import get_db
from pdf.errors import open_reader
from pdf.convert import _LIBREOFFICE_BIN, _child_limits, _seed_lo_profile
from pdf.job import Job, run_job

logger = logging.getLogger("cloudpdf")
router = APIRouter()

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _build_cmd(profile: Path, src: Path) -> list[str]:
    """Satu token `-env:X=Y` (lihat catatan regresi di convert._build_convert_cmd)."""
    return [
        _LIBREOFFICE_BIN, "--headless", "--norestore",
        f"-env:UserInstallation=file://{profile}",
        "--infilter=writer_pdf_import",
        "--convert-to", "docx:MS Word 2007 XML",
        "--outdir", str(src.parent), str(src),
    ]


async def _to_docx(job: Job, paths: list[Path]) -> Path:
    # LibreOffice menerima PDF rusak dan tetap menghasilkan DOCX kosong/sampah → validasi dulu (422).
    reader = await run_in_threadpool(open_reader, paths[0])
    if len(reader.pages) == 0:
        raise HTTPException(status_code=422, detail="PDF rusak atau tidak memiliki halaman")
    src = job.dir / "input.pdf"
    paths[0].rename(src)
    profile = job.dir / "lo"
    _seed_lo_profile(profile)
    proc = await asyncio.create_subprocess_exec(
        *_build_cmd(profile, src), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        start_new_session=True, preexec_fn=_child_limits,
    )
    try:
        _, err = await proc.communicate()
    finally:
        try:
            os.killpg(proc.pid, signal.SIGKILL)  # anak yatim / timeout / pembatalan
        except (ProcessLookupError, PermissionError):
            pass
    out = job.dir / "input.docx"
    if proc.returncode != 0 or not out.exists() or out.stat().st_size == 0:
        logger.warning(f"pdf→docx gagal job={job.id} rc={proc.returncode}: {err.decode('utf-8', 'replace')[:500]}")
        raise HTTPException(status_code=422, detail="PDF tidak bisa dikonversi ke Word. File mungkin rusak.")
    return out


@router.post("/to-word")
async def pdf_to_word(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    stem = re.sub(r"[^\w.\- ]", "_", Path(file.filename or "document").stem) or "document"
    return await run_job(request, db, user, "PDF_TO_WORD", [file], _to_docx,
                         filename_out=f"{stem}.docx", media_type=DOCX_MIME)
