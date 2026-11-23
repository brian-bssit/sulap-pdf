"""Gambar (JPG/PNG) → PDF via Pillow. Urutan = urutan upload. Batas piksel mencegah decompression bomb."""

import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from auth.dependencies import get_current_user
from db.database import get_db
from pdf.job import run_job

router = APIRouter()

MAX_IMAGES = 20
MAX_PIXELS_EACH = 40_000_000
MAX_PIXELS_TOTAL = 100_000_000
DPI = 150
A4_PX = (round(8.27 * DPI), round(11.69 * DPI))  # 1240 × 1754 → 595 × 842 pt
FORMATS = {"JPEG", "PNG"}


def _load(path: Path, name: str) -> Image.Image:
    try:
        with Image.open(path) as probe:
            if probe.format not in FORMATS:
                raise HTTPException(status_code=400, detail=f"Format gambar tidak didukung: {name}. Gunakan JPG atau PNG")
            w, h = probe.size
            if w * h > MAX_PIXELS_EACH:
                raise HTTPException(status_code=400, detail=f"Gambar terlalu besar (piksel): {name}")
        img = Image.open(path)
        img.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError):
        raise HTTPException(status_code=400, detail=f"Gambar rusak atau tidak bisa dibaca: {name}")
    img = ImageOps.exif_transpose(img)  # hormati orientasi EXIF (foto dari ponsel)
    if img.mode in ("RGBA", "LA", "P"):
        rgba = img.convert("RGBA")
        bg = Image.new("RGB", rgba.size, "white")
        bg.paste(rgba, mask=rgba.getchannel("A"))
        return bg
    return img.convert("RGB")


def _fit_a4(img: Image.Image) -> Image.Image:
    """Letakkan gambar di tengah halaman A4 (portrait/landscape mengikuti gambar), margin 20 px."""
    w, h = A4_PX if img.height >= img.width else A4_PX[::-1]
    page = Image.new("RGB", (w, h), "white")
    box = (w - 40, h - 40)
    scale = min(box[0] / img.width, box[1] / img.height, 1.0)  # tidak diperbesar melebihi aslinya
    size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
    resized = img.resize(size, Image.LANCZOS) if scale < 1 else img
    page.paste(resized, ((w - size[0]) // 2, (h - size[1]) // 2))
    return page


def _build(paths: list[Path], names: list[str], dst: Path, page_size: str) -> Path:
    imgs: list[Image.Image] = []
    total = 0
    for p, n in zip(paths, names):
        img = _load(p, n)
        total += img.width * img.height
        if total > MAX_PIXELS_TOTAL:
            raise HTTPException(status_code=400, detail="Total ukuran gambar (piksel) terlalu besar")
        imgs.append(_fit_a4(img) if page_size == "a4" else img)
    imgs[0].save(dst, "PDF", save_all=True, append_images=imgs[1:], resolution=DPI)
    return dst


@router.post("/images-to-pdf")
async def images_to_pdf(
    request: Request,
    files: list[UploadFile] = File(...),
    page_size: str = Form("a4"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    if not 1 <= len(files) <= MAX_IMAGES:
        raise HTTPException(status_code=400, detail=f"Kirim 1–{MAX_IMAGES} gambar")
    if page_size not in ("a4", "fit"):
        raise HTTPException(status_code=400, detail="page_size harus a4 atau fit")
    names = [re.sub(r"[^\w.\- ]", "_", f.filename or "gambar") for f in files]

    async def work(job, paths):
        return await run_in_threadpool(_build, paths, names, job.dir / "out.pdf", page_size)

    return await run_job(request, db, user, "IMG_TO_PDF", files, work,
                         filename_out="gambar.pdf", require_pdf=False)
