import json
import logging
import re
import time
import uuid
from datetime import datetime
from pathlib import Path

import pikepdf
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from config import settings
from db.database import get_db
from auth.dependencies import get_current_user
from audit import log_audit
from pdf.dl_headers import attachment_filename
from pdf.font_data import EMBEDDED_FONTS

logger = logging.getLogger("cloudpdf")

router = APIRouter()

PDF_MAGIC = b"%PDF"

# Base-14 PDF standard fonts (PDF Ref 1.7 §5.5.1) — no embedding required.
BASE14_FONTS = {
    "Helvetica": "Helvetica",
    "Helvetica-Bold": "Helvetica-Bold",
    "Helvetica-Oblique": "Helvetica-Oblique",
    "Times-Roman": "Times-Roman",
    "Times-Bold": "Times-Bold",
    "Times-Italic": "Times-Italic",
    "Courier": "Courier",
    "Courier-Bold": "Courier-Bold",
}

# Embedded open-license fonts (pdf/font_data.py, dev-generated). Key = display
# name (nilai option UI + nilai op["font"] di frontend).
ALL_FONTS = set(BASE14_FONTS) | set(EMBEDDED_FONTS)

# ttf bytes dibaca sekali per proses (file statis, di-commit). Runtime tak butuh fonttools.
_FONT_TTF: dict[str, bytes] = {}
_FONT_DIR = Path(__file__).resolve().parent / "fonts"

MAX_OVERLAYS = 50
MAX_TEXT_LEN = 2000
MAX_FONT_SIZE = 72
HEX_COLOR_RE = re.compile(r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$")
ALLOWED_TYPES = ("text", "rectangle", "stamp")

# Ops types that place the identity+timestamp label server-side (Req 6).
_SIGNED_TYPES = ("stamp",)


def _hex_color(value: str) -> tuple[float, float, float]:
    """'#RRGGBB' | '#RGB' -> (r, g, b) floats in 0..1."""
    h = value.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    n = int(h, 16)
    return (n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255


def _winansi_hex(text: str) -> str:
    """Hex PDF string — sidesteps literal-string escaping of ( ) \\ entirely.

    Encode cp1252 (≈ WinAnsi), bukan latin-1: dua-duanya identik 0x00-0x7F & 0xA0-0xFF,
    tapi 0x80-0x9F latin-1 = kontrol tak tercetak → tanda kutip melengkung / em-dash / €
    berubah jadi '?'. Dengan cp1252 karakter itu masuk encoding font WinAnsi 32..255."""
    return text.encode("cp1252", errors="replace").hex().upper()


def _ensure_resources(page) -> pikepdf.Dictionary:
    res = page.obj.get("/Resources")
    if res is None:
        res = pikepdf.Dictionary()
        page.obj["/Resources"] = res
    return res


def _ensure_font(res: pikepdf.Dictionary, base_font: str) -> str:
    fonts = res.get("/Font")
    if fonts is None:
        fonts = pikepdf.Dictionary()
        res["/Font"] = fonts
    for slot, font_obj in fonts.items():
        # Reuse ONLY a properly Name-typed font. A legacy buggy dict (from before
        # the Name fix) stored Subtype/BaseFont as literal Strings `(Type1)` /
        # `(Helvetica)`; reusing it would keep the font invisible on edit-of-edit.
        sub = font_obj.get("/Subtype")
        if (
            isinstance(sub, pikepdf.Name)
            and sub == "/Type1"
            and str(font_obj.get("/BaseFont")) == "/" + base_font
        ):
            return str(slot)
    slot = f"/F{len(fonts) + 1}"
    # Values must be pikepdf.Name, not str — pikepdf serializes str as literal
    # string `(Type1)`, which poppler/pdfium reject → text silently invisible.
    fonts[slot] = pikepdf.Dictionary(
        Type=pikepdf.Name("/Font"),
        Subtype=pikepdf.Name("/Type1"),
        BaseFont=pikepdf.Name("/" + base_font),
        Encoding=pikepdf.Name("/WinAnsiEncoding"),
    )
    return slot


def _load_ttf(name: str) -> bytes:
    """Bytes ttf utk embedded font (cached per proses). Aset di-commit — jarang berubah."""
    data = _FONT_TTF.get(name)
    if data is None:
        fname = EMBEDDED_FONTS[name]["file"]
        path = _FONT_DIR / fname
        if not path.exists():
            raise RuntimeError(f"aset font embedded hilang: {fname}")
        data = path.read_bytes()
        _FONT_TTF[name] = data
    return data


def _ensure_embedded_font(
    pdf: pikepdf.Pdf, res: pikepdf.Dictionary, name: str, fd_cache: dict[str, object]
) -> str:
    """Embed open-license font utk halaman ini. FontDescriptor+FontFile2 dibuat
    SEKALI per dokumen (indirect, dibagi antar halaman) — cache fd_cache[name].
    TrueType simple font: /Subtype /TrueType, WinAnsi 32..255, Widths em 1000."""
    fonts = res.get("/Font")
    if fonts is None:
        fonts = pikepdf.Dictionary()
        res["/Font"] = fonts

    meta = EMBEDDED_FONTS[name]
    ps = "/" + meta["ps"]
    for slot, font_obj in fonts.items():
        # Reuse dgn guard sama spt Base-14: wajib Name-typed utk dedup yang aman.
        if (
            isinstance(font_obj.get("/Subtype"), pikepdf.Name)
            and font_obj["/Subtype"] == "/TrueType"
            and str(font_obj.get("/BaseFont")) == ps
        ):
            return str(slot)

    fd_ref = fd_cache.get(name)
    if fd_ref is None:
        try:
            ttf = _load_ttf(name)
        except RuntimeError as e:
            logger.error(f"Embed font fail: {e}")
            raise HTTPException(status_code=500, detail="Font tidak tersedia")
        ff2 = pdf.make_indirect(pikepdf.Stream(pdf, ttf))
        fd_ref = pdf.make_indirect(
            pikepdf.Dictionary(
                FontName=pikepdf.Name(ps),
                Flags=meta["flags"],
                FontBBox=pikepdf.Array(meta["bbox"]),
                ItalicAngle=meta["italic"],
                Ascent=meta["ascent"],
                Descent=meta["descent"],
                CapHeight=meta["capheight"],
                StemV=meta["stemv"],
                FontFile2=ff2,
            )
        )
        fd_cache[name] = fd_ref

    slot = f"/F{len(fonts) + 1}"
    fonts[slot] = pikepdf.Dictionary(
        Type=pikepdf.Name("/Font"),
        Subtype=pikepdf.Name("/TrueType"),
        BaseFont=pikepdf.Name(ps),
        FirstChar=32,
        LastChar=255,
        Widths=pikepdf.Array(meta["widths"]),
        Encoding=pikepdf.Name("/WinAnsiEncoding"),
        FontDescriptor=fd_ref,
    )
    return slot


def _ensure_extgstate(res: pikepdf.Dictionary, alpha: float) -> str:
    gstates = res.get("/ExtGState")
    if gstates is None:
        gstates = pikepdf.Dictionary()
        res["/ExtGState"] = gstates
    slot = f"/GS{len(gstates) + 1}"
    gstates[slot] = pikepdf.Dictionary(Type=pikepdf.Name("/ExtGState"), ca=alpha, CA=alpha)
    return slot


def scrub_catalog(pdf: pikepdf.Pdf) -> None:
    """Catalog-level scrub only (documented limitation — not recursive)."""
    root = pdf.Root
    for key in ("/OpenAction", "/AA"):
        if key in root:
            del root[key]
    names = root.get("/Names")
    if isinstance(names, pikepdf.Dictionary):
        for key in ("/JavaScript", "/EmbeddedFiles"):
            if key in names:
                del names[key]
        if not names:
            del root["/Names"]


def _validate_bounds(pdf: pikepdf.Pdf, ops: list[dict]) -> None:
    """Anchor-point clamp only: llx<=x<=urx, lly<=y<=ury (Req 2, no font metrics)."""
    for op in ops:
        box = pdf.pages[op["page"]].mediabox
        llx, lly = float(box[0]), float(box[1])
        urx, ury = float(box[2]), float(box[3])
        x, y = op["x"], op["y"]
        if not (llx <= x <= urx and lly <= y <= ury):
            raise HTTPException(status_code=400, detail=f"Koordinat ({x},{y}) di luar bounds halaman")


def _apply_overlay(pdf: pikepdf.Pdf, ops: list[dict], author_label: str) -> int:
    """Append content stream per page. Returns number of overlays applied."""
    from collections import defaultdict

    by_page: dict[int, list[dict]] = defaultdict(list)
    for op in ops:
        by_page[op["page"]].append(op)

    fd_cache: dict[str, object] = {}  # per dokumen: nama font -> FontDescriptor indirect
    count = 0
    for page_no, page_ops in by_page.items():
        page = pdf.pages[page_no]
        res = _ensure_resources(page)
        segs: list[str] = []

        for op in page_ops:
            otype = op["type"]

            if otype in ("text", "stamp"):
                text = op["text"]
                if otype in _SIGNED_TYPES:
                    text = f"{text} · {author_label}"
                font_name = BASE14_FONTS["Helvetica-Bold"] if otype == "stamp" else op["font"]
                if font_name in EMBEDDED_FONTS:
                    slot = _ensure_embedded_font(pdf, res, font_name, fd_cache)
                else:
                    slot = _ensure_font(res, font_name)
                size = op["font_size"]
                x, y = op["x"], op["y"]
                r, g, b = _hex_color(op["color"])
                segs.append(f"{r} {g} {b} rg BT {slot} {size} Tf 1 0 0 1 {x} {y} Tm <{_winansi_hex(text)}> Tj ET")
                count += 1

            elif otype == "rectangle":
                x, y, w, h = op["x"], op["y"], op["width"], op["height"]
                r, g, b = _hex_color(op["color"])
                alpha = op.get("opacity", 1.0)
                gs = _ensure_extgstate(res, alpha)
                segs.append(f"q {gs} gs {r} {g} {b} rg {x} {y} {w} {h} re f Q")
                count += 1

        if not segs:
            continue

        # Flatten old content into one stream, then append ours (equivalent per spec).
        old = page.obj.get("/Contents")
        old_data = b""
        if old is not None:
            streams = old if isinstance(old, pikepdf.Array) else [old]
            for st in streams:
                data = st.read_bytes()
                old_data += data if data is not None else b""
        new_data = old_data + b"\n" + "\n".join(segs).encode("latin-1") + b"\n"
        page.obj["/Contents"] = pikepdf.Stream(pdf, new_data)

    return count


def _validate_ops(raw: str, total_pages: int) -> list[dict]:
    try:
        ops = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=400, detail="Format operasi tidak valid")

    if not isinstance(ops, list) or not ops:
        raise HTTPException(status_code=400, detail="Operasi harus berupa array non-kosong")
    if len(ops) > MAX_OVERLAYS:
        raise HTTPException(status_code=400, detail=f"Maksimal {MAX_OVERLAYS} operasi per request")

    validated: list[dict] = []
    for op in ops:
        if not isinstance(op, dict):
            raise HTTPException(status_code=400, detail="Setiap operasi harus berupa objek JSON")

        otype = op.get("type")
        if otype not in ALLOWED_TYPES:
            raise HTTPException(status_code=400, detail=f"Tipe operasi tidak didukung: {otype}")

        page = op.get("page")
        if not isinstance(page, int) or isinstance(page, bool):
            raise HTTPException(status_code=400, detail="page harus integer (1-based)")
        idx = page - 1
        if not (0 <= idx < total_pages):
            raise HTTPException(status_code=400, detail=f"Halaman {page} di luar jangkauan (1-{total_pages})")

        x = op.get("x")
        y = op.get("y")
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (x, y)):
            raise HTTPException(status_code=400, detail="Koordinat x/y harus numerik")

        color = op.get("color", "#FF0000")
        if not isinstance(color, str) or not HEX_COLOR_RE.match(color):
            raise HTTPException(status_code=400, detail=f"Warna tidak valid: {color}. Gunakan hex #RGB / #RRGGBB")

        if otype in ("text", "stamp"):
            text = op.get("text")
            if not isinstance(text, str) or not text.strip():
                raise HTTPException(status_code=400, detail="Teks tidak boleh kosong")
            if len(text) > MAX_TEXT_LEN:
                raise HTTPException(status_code=400, detail=f"Teks maksimal {MAX_TEXT_LEN} karakter")
            if otype == "text":
                font = op.get("font", "Helvetica")
                if font not in ALL_FONTS:
                    raise HTTPException(status_code=400, detail=f"Font tidak didukung: {font}")
            size = op.get("font_size", 24)
            if not isinstance(size, (int, float)) or isinstance(size, bool) or not (1 <= size <= MAX_FONT_SIZE):
                raise HTTPException(status_code=400, detail=f"font_size harus 1-{MAX_FONT_SIZE}")

        if otype == "rectangle":
            w = op.get("width")
            h = op.get("height")
            if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0 for v in (w, h)):
                raise HTTPException(status_code=400, detail="Rectangle width/height harus > 0")
            alpha = op.get("opacity", 1.0)
            if not isinstance(alpha, (int, float)) or isinstance(alpha, bool) or not (0 <= alpha <= 1):
                raise HTTPException(status_code=400, detail="opacity harus 0-1")

        item = dict(op)
        item["page"] = idx
        item["color"] = color
        validated.append(item)

    return validated


def _run_pdf_job(
    input_path: Path, output_path: Path, raw_operations: str, max_pages: int, author_label: str
) -> int:
    """Open→validate→apply→save, satu blok sinkron (dijalankan di threadpool)."""
    try:
        pdf = pikepdf.open(str(input_path))
    except Exception:
        raise HTTPException(status_code=422, detail="PDF tidak bisa dibaca / file korup")

    try:
        total_pages = len(pdf.pages)
        if total_pages > max_pages:
            raise HTTPException(status_code=400, detail=f"Maksimal {max_pages} halaman")

        ops = _validate_ops(raw_operations, total_pages)
        _validate_bounds(pdf, ops)

        count = _apply_overlay(pdf, ops, author_label)

        scrub_catalog(pdf)
        pdf.save(str(output_path))
        return count
    finally:
        pdf.close()


@router.post("/edit-overlay")
async def edit_overlay(
    request: Request,
    file: UploadFile = File(...),
    operations: str = Form("[]"),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    job_id = str(uuid.uuid4())[:8]
    input_path = Path(f"/tmp/cpdf_{job_id}_edit_input.pdf")
    output_path = Path(f"/tmp/cpdf_{job_id}_edit_output.pdf")
    start_time = time.monotonic()
    input_size = 0
    overlay_count = 0

    try:
        if not (file.filename or "").lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Hanya file PDF yang didukung")

        content = await file.read()
        input_size = len(content)

        if input_size > settings.max_file_size_mb * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"File terlalu besar. Maksimal {settings.max_file_size_mb} MB")
        if input_size == 0 or content[:4] != PDF_MAGIC:
            raise HTTPException(status_code=400, detail="Format file tidak didukung. Hanya PDF")

        input_path.write_bytes(content)
        del content

        if await request.is_disconnected():
            await _audit(db, request, user, file, input_size, 0, 0, "CANCELLED_BY_CLIENT")
            return StreamingResponse(iter([]), status_code=499)

        author_label = f"{user.display_name} · {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}"
        # pikepdf open/save sinkron & berat → threadpool biar event loop tak tersumbat.
        overlay_count = await run_in_threadpool(
            _run_pdf_job, input_path, output_path, operations, settings.max_pages_edit, author_label
        )

        output_data = output_path.read_bytes()
        output_size = len(output_data)
        processing_ms = int((time.monotonic() - start_time) * 1000)

        await _audit(db, request, user, file, input_size, output_size, overlay_count, "SUCCESS", processing_ms)

        logger.info(f"Edit-overlay {job_id}: {input_size}→{output_size} bytes, {overlay_count} overlays, {processing_ms}ms")

        stem = Path(file.filename).stem
        return StreamingResponse(
            iter([output_data]),
            media_type="application/pdf",
            headers={
                "Content-Disposition": attachment_filename(f"{stem}_edited.pdf"),
                "X-Original-Size": str(input_size),
                "X-Edited-Size": str(output_size),
                "X-Overlay-Count": str(overlay_count),
            },
        )

    except HTTPException as e:
        await _audit(db, request, user, file, input_size, 0, 0, "FAILED", error_msg=str(e.detail)[:500])
        raise
    except Exception as e:
        logger.error(f"Edit-overlay error job={job_id}: {e}")
        await _audit(db, request, user, file, input_size, 0, 0, "FAILED", error_msg=str(e)[:500])
        raise HTTPException(status_code=500, detail="Gagal memproses file")
    finally:
        _cleanup(input_path, output_path)


async def _audit(db, request, user, file, input_size, output_size, overlay_count, status, processing_ms=0, error_msg=None):
    await log_audit(
        db=db,
        request=request,
        user_id=str(user.id),
        user_email=user.email,
        action="EDIT_OVERLAY",
        source_files=[file.filename or "unknown"],
        result_file=f"{Path(file.filename or 'document').stem}_edited.pdf" if status == "SUCCESS" else None,
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
