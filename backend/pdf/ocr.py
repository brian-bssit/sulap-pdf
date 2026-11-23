"""OCR: halaman tanpa teks dirender (pypdfium2, 200 dpi) → tesseract CLI → PDF dengan lapisan teks, lalu digabung
dengan halaman asli yang sudah bertext. Tanpa Ghostscript/ocrmypdf (risiko AGPL). Satu halaman pada satu waktu."""

import asyncio
import logging
import os
import shutil
import signal
from pathlib import Path

import pypdfium2 as pdfium
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pypdf import PdfReader, PdfWriter
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from auth.dependencies import get_current_user
from db.database import get_db
from pdf.convert import _child_limits
from pdf.errors import open_reader
from pdf.job import Job, run_job
from pdf.split import _safe_stem

logger = logging.getLogger("cloudpdf")
router = APIRouter()

MAX_PAGES = 50
DPI = 200
LANGS = ("ind", "eng", "ind+eng")


def _has_text(page) -> bool:
    try:
        return bool((page.extract_text() or "").strip())
    except Exception:
        return False


def _render(src: Path, index: int, dst: Path) -> None:
    doc = pdfium.PdfDocument(str(src))
    try:
        page = doc[index]
        try:
            page.render(scale=DPI / 72).to_pil().convert("RGB").save(dst, "PNG", dpi=(DPI, DPI))
        finally:
            page.close()
    finally:
        doc.close()


async def _tesseract(png: Path, out_base: Path, lang: str) -> None:
    # cwd = direktori job + nama relatif: Leptonica di macOS memetakan ulang path berawalan /tmp
    # sehingga berkas "tidak ditemukan"; nama relatif aman di semua OS.
    proc = await asyncio.create_subprocess_exec(
        "tesseract", png.name, out_base.name, "-l", lang, "pdf",
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.PIPE, cwd=str(png.parent),
        start_new_session=True, preexec_fn=_child_limits, env={**os.environ, "OMP_THREAD_LIMIT": "1"},
    )
    try:
        _, err = await proc.communicate()
    finally:
        try:
            os.killpg(proc.pid, signal.SIGKILL)  # timeout / pembatalan / anak yatim
        except (ProcessLookupError, PermissionError):
            pass
    if proc.returncode != 0 or not out_base.with_suffix(".pdf").exists():
        logger.warning(f"tesseract gagal rc={proc.returncode}: {err.decode('utf-8', 'replace')[:300]}")
        raise HTTPException(status_code=422, detail="OCR gagal memproses halaman. File mungkin rusak.")


def _ocr_page_numbers(src: Path) -> list[int]:
    reader = open_reader(src)
    total = len(reader.pages)
    if total == 0:
        raise HTTPException(status_code=422, detail="PDF rusak atau tidak memiliki halaman")
    if total > MAX_PAGES:
        raise HTTPException(status_code=413, detail=f"OCR maksimal {MAX_PAGES} halaman. Pisahkan dulu dengan Pisah Halaman.")
    return [i for i, p in enumerate(reader.pages) if not _has_text(p)]


async def _ocr(job: Job, paths: list[Path], lang: str, counted: list[int]) -> Path:
    if not shutil.which("tesseract"):
        logger.error("tesseract tidak ada di image")
        raise HTTPException(status_code=503, detail="Layanan OCR tidak tersedia")
    src = paths[0]
    todo = await run_in_threadpool(_ocr_page_numbers, src)
    counted.append(len(todo))
    if not todo:
        return src  # semua halaman sudah punya teks: kembalikan apa adanya

    ocr_pdfs: dict[int, Path] = {}
    for i in todo:
        png, base = job.dir / f"p{i}.png", job.dir / f"o{i}"
        await run_in_threadpool(_render, src, i, png)
        await _tesseract(png, base, lang)
        png.unlink(missing_ok=True)  # hemat disk /tmp
        ocr_pdfs[i] = base.with_suffix(".pdf")

    def merge() -> Path:
        reader = PdfReader(str(src))
        writer = PdfWriter()
        for i, page in enumerate(reader.pages):
            writer.add_page(PdfReader(str(ocr_pdfs[i])).pages[0] if i in ocr_pdfs else page)
        out = job.dir / "out.pdf"
        writer.write(str(out))
        return out

    return await run_in_threadpool(merge)


@router.post("/ocr")
async def ocr_pdf(
    request: Request,
    file: UploadFile = File(...),
    lang: str = Form("ind+eng"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    if lang not in LANGS:
        raise HTTPException(status_code=400, detail="Bahasa harus ind, eng, atau ind+eng")
    counted: list[int] = []

    async def work(job, paths):
        return await _ocr(job, paths, lang, counted)

    return await run_job(
        request, db, user, "OCR", [file], work,
        filename_out=f"ocr_{_safe_stem(file.filename)}.pdf",
        headers_fn=lambda i, o: {"X-Pages-OCR": str(counted[0] if counted else 0)},
    )
