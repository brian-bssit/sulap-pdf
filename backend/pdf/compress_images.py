"""Kompresi gambar (LOSSY) untuk level balanced/high: perkecil gambar yang resolusinya melebihi target DPI
dan simpan ulang sebagai JPEG. pikepdf (MPL) + Pillow (HPND); tanpa Ghostscript/MuPDF (AGPL).

Dilewati (tetap utuh): gambar 1-bit/mask (scan hitam-putih, JBIG2/CCITT), CMYK, array /Decode, /Mask,
gambar yang tidak bisa di-decode, gambar tanpa penempatan terbaca di halaman, dan gambar yang hasilnya
tidak lebih kecil. SMask (transparansi) dibiarkan apa adanya."""

import io
import math
import time
from dataclasses import dataclass
from pathlib import Path

import pikepdf
from PIL import Image

# level → (DPI target, kualitas JPEG)
PROFILES = {"balanced": (150, 75), "high": (100, 60)}
MAX_PIXELS = 50_000_000  # batas per gambar sebelum decode (anti decompression bomb / memori)
MIN_GAIN = 0.9           # ganti hanya bila hasil < 90% ukuran asli
RESIZE_BELOW = 0.95      # perkecil hanya bila skala < 0.95
_MAX_DEPTH = 3           # kedalaman Form XObject yang ditelusuri

Matrix = tuple[float, float, float, float, float, float]
_IDENT: Matrix = (1, 0, 0, 1, 0, 0)


@dataclass
class Stats:
    total: int = 0      # gambar yang ditemukan terpasang di halaman
    changed: int = 0    # gambar yang diganti


def _mul(m: Matrix, n: Matrix) -> Matrix:
    """Hasil m lalu n (konvensi PDF: baris-vektor)."""
    a, b, c, d, e, f = m
    A, B, C, D, E, F = n
    return (a * A + b * C, a * B + b * D, c * A + d * C, c * B + d * D, e * A + f * C + E, e * B + f * D + F)


def _collect(stream_obj, resources, ctm: Matrix, found: dict, depth: int) -> None:
    """Catat ukuran terbesar (inci) tempat tiap gambar dipasang, menelusuri Form XObject."""
    try:
        ops = pikepdf.parse_content_stream(stream_obj)
    except Exception:
        return
    xobjs = resources.get("/XObject") if resources is not None else None
    stack: list[Matrix] = []
    for operands, op in ops:
        name = str(op)
        if name == "q":
            stack.append(ctm)
        elif name == "Q":
            ctm = stack.pop() if stack else ctm
        elif name == "cm" and len(operands) == 6:
            ctm = _mul(tuple(float(x) for x in operands), ctm)  # type: ignore[arg-type]
        elif name == "Do" and xobjs is not None and operands:
            xo = xobjs.get(str(operands[0]))
            if xo is None:
                continue
            sub = xo.get("/Subtype")
            if sub == "/Image":
                w_in = math.hypot(ctm[0], ctm[1]) / 72
                h_in = math.hypot(ctm[2], ctm[3]) / 72
                key = xo.objgen
                pw, ph = found.get(key, (0.0, 0.0))[:2]
                found[key] = (max(pw, w_in), max(ph, h_in), xo)
            elif sub == "/Form" and depth < _MAX_DEPTH:
                m = xo.get("/Matrix")
                fm: Matrix = tuple(float(x) for x in m) if m is not None and len(m) == 6 else _IDENT  # type: ignore[assignment]
                _collect(xo, xo.get("/Resources", resources), _mul(fm, ctm), found, depth + 1)


def _skip(xo) -> bool:
    if xo.get("/ImageMask") or "/Mask" in xo or "/Decode" in xo:
        return True
    if int(xo.get("/BitsPerComponent", 8)) == 1:
        return True
    return int(xo.Width) * int(xo.Height) > MAX_PIXELS


def _is_dct(xo) -> bool:
    f = xo.get("/Filter")
    if f is None:
        return False
    names = [str(x) for x in f] if isinstance(f, pikepdf.Array) else [str(f)]
    return names[-1] == "/DCTDecode"


def _icc_channels(xo) -> int | None:
    cs = xo.get("/ColorSpace")
    if isinstance(cs, pikepdf.Array) and len(cs) == 2 and str(cs[0]) == "/ICCBased":
        return int(cs[1].get("/N", 0))
    return None


def _rewrite(xo, w_in: float, h_in: float, dpi: int, quality: int, grayscale: bool) -> bool:
    """Perkecil/encode ulang satu gambar. True bila diganti."""
    from pikepdf import PdfImage

    pil = PdfImage(xo).as_pil_image()
    if pil.mode not in ("RGB", "L", "P"):
        return False
    w, h = pil.size
    scale = min(1.0, max(math.ceil(w_in * dpi) / w, math.ceil(h_in * dpi) / h)) if w_in and h_in else 1.0
    resize = scale < RESIZE_BELOW
    to_gray = grayscale and pil.mode != "L"
    if not (resize or to_gray or not _is_dct(xo)):
        return False  # sudah JPEG pada resolusi sesuai: jangan degradasi ulang
    icc = _icc_channels(xo)
    pil = pil.convert("L" if (grayscale or pil.mode == "L") else "RGB")
    if resize:
        pil = pil.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    buf = io.BytesIO()
    pil.save(buf, "JPEG", quality=quality, optimize=True)
    data = buf.getvalue()
    old = len(xo.read_raw_bytes())
    if len(data) >= old * MIN_GAIN:
        return False
    channels = 1 if pil.mode == "L" else 3
    xo.write(data, filter=pikepdf.Name.DCTDecode)
    if "/DecodeParms" in xo:
        del xo["/DecodeParms"]
    xo.Width, xo.Height, xo.BitsPerComponent = pil.width, pil.height, 8
    if icc != channels:  # profil ICC dipertahankan bila jumlah kanal sama
        xo.ColorSpace = pikepdf.Name.DeviceGray if channels == 1 else pikepdf.Name.DeviceRGB
    return True


def optimize_images(src: Path, dst: Path, level: str, grayscale: bool, deadline: float) -> Stats:
    """Tulis hasil ke `dst`. `deadline` = time.monotonic() batas; sisa gambar dilewati bila terlampaui."""
    dpi, quality = PROFILES[level]
    stats = Stats()
    pdf = pikepdf.open(str(src))
    try:
        found: dict = {}
        for page in pdf.pages:
            _collect(page, page.obj.get("/Resources"), _IDENT, found, 0)
        stats.total = len(found)
        for w_in, h_in, xo in found.values():
            if time.monotonic() > deadline:
                break
            if _skip(xo):
                continue
            try:
                if _rewrite(xo, w_in, h_in, dpi, quality, grayscale):
                    stats.changed += 1
            except Exception:
                continue  # format tak didukung (JBIG2, JPX, dll.): biarkan utuh
        pdf.save(str(dst))
    finally:
        pdf.close()
    return stats
