#!/usr/bin/env python3
"""Pembangkit fixture PDF untuk test (tanpa berkas biner di git).

Pakai sebagai modul (`from tools.make_fixtures import pdf_normal`) atau CLI:
    python tools/make_fixtures.py OUTDIR   # tulis normal/corrupt/encrypted/many/scan .pdf
"""
from __future__ import annotations

import io
import sys
from pathlib import Path

import pikepdf
from pikepdf import Dictionary, Name, Stream

_FONT = Dictionary(Type=Name.Font, Subtype=Name.Type1, BaseFont=Name.Helvetica)


def _save(pdf: pikepdf.Pdf, **kw) -> bytes:
    buf = io.BytesIO()
    pdf.save(buf, **kw)
    return buf.getvalue()


def pdf_normal(pages: int = 1, label: str = "Halaman") -> bytes:
    """PDF teks: tiap halaman memuat "<label> N" (bisa diekstrak → verifikasi urutan)."""
    pdf = pikepdf.new()
    for n in range(1, pages + 1):
        page = pdf.add_blank_page(page_size=(595, 842))
        page.Resources = Dictionary(Font=Dictionary(F1=_FONT))
        page.Contents = Stream(pdf, f"BT /F1 24 Tf 72 700 Td ({label} {n}) Tj ET".encode())
    return _save(pdf)


def pdf_many(pages: int = 200) -> bytes:
    return pdf_normal(pages)


def pdf_corrupt() -> bytes:
    """Header %PDF valid tapi isi rusak — lolos cek magic, gagal saat parsing."""
    return b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 99 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n" + b"\x00garbage" * 20


def pdf_encrypted(user_password: str = "rahasia") -> bytes:
    pdf = pikepdf.open(io.BytesIO(pdf_normal()))
    return _save(pdf, encryption=pikepdf.Encryption(user=user_password, owner="owner-pw"))


def pdf_scan(pages: int = 2) -> bytes:
    """PDF 'hasil scan': hanya gambar, tanpa lapisan teks."""
    pdf = pikepdf.new()
    for _ in range(pages):
        page = pdf.add_blank_page(page_size=(595, 842))
        img = Stream(pdf, bytes(range(256)) * 16)
        img.Type, img.Subtype = Name.XObject, Name.Image
        img.Width = img.Height = 64
        img.ColorSpace, img.BitsPerComponent = Name.DeviceGray, 8
        page.Resources = Dictionary(XObject=Dictionary(Im0=img))
        page.Contents = Stream(pdf, b"q 595 0 0 842 0 0 cm /Im0 Do Q")
    return _save(pdf)


def main(outdir: str) -> None:
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    for name, data in {
        "normal": pdf_normal(3), "corrupt": pdf_corrupt(), "encrypted": pdf_encrypted(),
        "many": pdf_many(), "scan": pdf_scan(),
    }.items():
        (out / f"{name}.pdf").write_bytes(data)
        print(f"{name}.pdf  {len(data)} bytes")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "fixtures")
