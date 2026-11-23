from pathlib import Path

import pikepdf
from fastapi import HTTPException
from fastapi.concurrency import run_in_threadpool
from pypdf import PdfReader


def _check(path: str) -> None:
    try:
        pikepdf.open(path).close()
    except pikepdf.PasswordError:
        raise HTTPException(
            status_code=422,
            detail="PDF terkunci password. Buka kuncinya dulu dengan Unlock PDF.",
        )
    except Exception:
        # Korup/format lain → biar tool masing-masing yang melapor.
        pass


async def raise_if_encrypted(path: Path) -> None:
    """422 jelas untuk PDF yang butuh password. PDF dengan user-password kosong
    (hanya pembatasan izin) tetap lolos karena pikepdf membukanya."""
    await run_in_threadpool(_check, str(path))


def open_reader(path: Path) -> PdfReader:
    """PdfReader yang memaksa parsing awal; PDF rusak → 422 (kesalahan input), bukan 500."""
    try:
        reader = PdfReader(str(path))
        len(reader.pages)
        return reader
    except Exception:
        raise HTTPException(status_code=422, detail="PDF rusak atau tidak bisa dibaca")
