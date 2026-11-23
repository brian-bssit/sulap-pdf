"""Split / extract halaman: rentang → 1 PDF, atau per N halaman → ZIP."""

import io
import re
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pypdf import PdfWriter
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from auth.dependencies import get_current_user
from db.database import get_db
from pdf.errors import open_reader
from pdf.job import Job, run_job
from pdf.ranges import parse_ranges

router = APIRouter()
MAX_PAGES = 200


def _safe_stem(name: str | None) -> str:
    return re.sub(r"[^\w.\- ]", "_", Path(name or "document").stem) or "document"


def _split(src: Path, job: Job, mode: str, ranges: str, every_n: int, stem: str) -> Path:
    reader = open_reader(src)
    total = len(reader.pages)
    if total == 0:
        raise HTTPException(status_code=422, detail="PDF rusak atau tidak memiliki halaman")
    if total > MAX_PAGES:
        raise HTTPException(status_code=400, detail=f"Maksimal {MAX_PAGES} halaman")

    if mode == "ranges":
        writer = PdfWriter()
        for i in parse_ranges(ranges, total):
            writer.add_page(reader.pages[i])
        out = job.dir / "out.pdf"
        writer.write(str(out))
        return out

    out = job.dir / "out.zip"
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as zf:
        for part, start in enumerate(range(0, total, every_n), 1):
            writer = PdfWriter()
            for i in range(start, min(start + every_n, total)):
                writer.add_page(reader.pages[i])
            buf = io.BytesIO()
            writer.write(buf)
            zf.writestr(f"{stem}_bagian{part:02d}.pdf", buf.getvalue())
    return out


@router.post("/split")
async def split_pdf(
    request: Request,
    file: UploadFile = File(...),
    mode: str = Form("ranges"),
    ranges: str = Form(""),
    every_n: int = Form(0),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    if mode not in ("ranges", "every_n"):
        raise HTTPException(status_code=400, detail="mode harus ranges atau every_n")
    if mode == "every_n" and not 1 <= every_n <= MAX_PAGES:
        raise HTTPException(status_code=400, detail=f"Jumlah halaman per bagian harus 1–{MAX_PAGES}")
    stem = _safe_stem(file.filename)

    async def work(job, paths):
        return await run_in_threadpool(_split, paths[0], job, mode, ranges, every_n, stem)

    zipped = mode == "every_n"
    return await run_job(
        request, db, user, "SPLIT", [file], work,
        filename_out=f"{stem}_bagian.zip" if zipped else f"{stem}_ekstrak.pdf",
        media_type="application/zip" if zipped else "application/pdf",
    )
