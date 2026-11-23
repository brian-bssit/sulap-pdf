from pathlib import Path

from fastapi import HTTPException, UploadFile

_CHUNK = 1024 * 1024


async def save_upload(
    file: UploadFile, dest: Path, max_bytes: int, detail: str | None = None
) -> int:
    """Stream upload ke `dest` per 1 MiB; tolak 413 begitu melewati `max_bytes`.
    Tak pernah menahan seluruh file di RAM. File parsial dibiarkan — pemanggil
    wajib menghapus `dest` di `finally` (semua endpoint sudah begitu)."""
    size = 0
    with open(dest, "wb") as out:
        while chunk := await file.read(_CHUNK):
            size += len(chunk)
            if size > max_bytes:
                raise HTTPException(
                    status_code=413,
                    detail=detail or f"File terlalu besar. Maksimal {max_bytes // (1024 * 1024)} MB",
                )
            out.write(chunk)
    return size
