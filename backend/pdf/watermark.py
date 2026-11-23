"""Watermark teks & nomor halaman. Memakai mesin overlay `edit_overlay._apply_overlay` (font base-14)."""

import math
from pathlib import Path

import pikepdf
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from auth.dependencies import get_current_user
from db.database import get_db
from pdf.edit_overlay import HEX_COLOR_RE, _apply_overlay
from pdf.job import run_job
from pdf.ranges import parse_ranges
from pdf.split import MAX_PAGES, _safe_stem

router = APIRouter()

_HELV = {**{str(d): 0.556 for d in range(10)}, " ": 0.278, "/": 0.278}  # lebar Helvetica per em
POSITIONS = ("bottom-center", "bottom-right", "bottom-left", "top-center", "top-right", "top-left")
MARGIN = 28


def _width(text: str, size: float, bold: bool = False) -> float:
    return sum(_HELV.get(c, 0.6 if bold else 0.55) for c in text) * size


def _open(src: Path) -> pikepdf.Pdf:
    try:
        pdf = pikepdf.open(str(src))
    except Exception:
        raise HTTPException(status_code=422, detail="PDF rusak atau tidak bisa dibaca")
    if len(pdf.pages) == 0:
        raise HTTPException(status_code=422, detail="PDF rusak atau tidak memiliki halaman")
    if len(pdf.pages) > MAX_PAGES:
        raise HTTPException(status_code=400, detail=f"Maksimal {MAX_PAGES} halaman")
    return pdf


def _box(page) -> tuple[float, float, float, float]:
    b = page.mediabox
    return float(b[0]), float(b[1]), float(b[2]), float(b[3])


def _watermark(src, dst, text, position, opacity, color, size, pages) -> Path:
    with _open(src) as pdf:
        idx = parse_ranges(pages, len(pdf.pages)) if pages.strip() else range(len(pdf.pages))
        theta = 45 if position == "diagonal" else 0
        c, s = math.cos(math.radians(theta)), math.sin(math.radians(theta))
        w = _width(text, size, bold=True)
        ops = []
        for i in idx:
            llx, lly, urx, ury = _box(pdf.pages[i])
            cx, cy = (llx + urx) / 2, (lly + ury) / 2
            # Pusatkan: geser dari titik tengah sejauh setengah lebar teks + setengah tinggi huruf.
            x = cx - c * w / 2 + s * size * 0.35
            y = cy - s * w / 2 - c * size * 0.35
            ops.append({"page": i, "type": "text", "text": text, "font": "Helvetica-Bold", "font_size": size,
                        "x": round(x, 2), "y": round(y, 2), "color": color, "rotate": theta, "opacity": opacity})
        _apply_overlay(pdf, ops, "")
        pdf.save(str(dst))
    return dst


def _page_numbers(src, dst, position, fmt, start_at, size) -> Path:
    with _open(src) as pdf:
        total = len(pdf.pages)
        last = start_at + total - 1
        ops = []
        for i in range(total):
            n = start_at + i
            label = f"{n} / {last}" if fmt == "n_of_total" else str(n)
            llx, lly, urx, ury = _box(pdf.pages[i])
            w = _width(label, size)
            v, h = position.split("-")
            x = {"left": llx + MARGIN, "right": urx - MARGIN - w, "center": (llx + urx) / 2 - w / 2}[h]
            y = lly + MARGIN if v == "bottom" else ury - MARGIN - size
            ops.append({"page": i, "type": "text", "text": label, "font": "Helvetica", "font_size": size,
                        "x": round(x, 2), "y": round(y, 2), "color": "#333333"})
        _apply_overlay(pdf, ops, "")
        pdf.save(str(dst))
    return dst


@router.post("/watermark")
async def watermark_pdf(
    request: Request,
    file: UploadFile = File(...),
    text: str = Form(...),
    position: str = Form("diagonal"),
    opacity: float = Form(0.2),
    color: str = Form("#888888"),
    font_size: int = Form(48),
    pages: str = Form(""),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    text = text.strip()
    if not 1 <= len(text) <= 100:
        raise HTTPException(status_code=400, detail="Teks watermark 1–100 karakter")
    if position not in ("diagonal", "center"):
        raise HTTPException(status_code=400, detail="posisi harus diagonal atau center")
    if not 0.05 <= opacity <= 1:
        raise HTTPException(status_code=400, detail="Opacity 0,05–1")
    if not HEX_COLOR_RE.match(color):
        raise HTTPException(status_code=400, detail="Warna harus #RRGGBB")
    if not 12 <= font_size <= 200:
        raise HTTPException(status_code=400, detail="Ukuran huruf 12–200")

    async def work(job, paths):
        return await run_in_threadpool(_watermark, paths[0], job.dir / "out.pdf", text, position, opacity, color, font_size, pages)

    return await run_job(request, db, user, "WATERMARK", [file], work,
                         filename_out=f"watermark_{_safe_stem(file.filename)}.pdf")


@router.post("/page-numbers")
async def page_numbers_pdf(
    request: Request,
    file: UploadFile = File(...),
    position: str = Form("bottom-center"),
    format: str = Form("n"),
    start_at: int = Form(1),
    font_size: int = Form(10),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    if position not in POSITIONS:
        raise HTTPException(status_code=400, detail="Posisi tidak dikenal")
    if format not in ("n", "n_of_total"):
        raise HTTPException(status_code=400, detail="format harus n atau n_of_total")
    if not 1 <= start_at <= 9999:
        raise HTTPException(status_code=400, detail="Mulai dari 1–9999")
    if not 8 <= font_size <= 24:
        raise HTTPException(status_code=400, detail="Ukuran huruf 8–24")

    async def work(job, paths):
        return await run_in_threadpool(_page_numbers, paths[0], job.dir / "out.pdf", position, format, start_at, font_size)

    return await run_job(request, db, user, "PAGE_NUMBERS", [file], work,
                         filename_out=f"nomor_{_safe_stem(file.filename)}.pdf")
