"""Hapus metadata & muatan aktif: /Info, XMP, lampiran, JavaScript, OpenAction. Konten halaman tak berubah."""

from pathlib import Path

import pikepdf
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from auth.dependencies import get_current_user
from db.database import get_db
from pdf.job import run_job
from pdf.split import _safe_stem

router = APIRouter()


def _scrub(src: Path, dst: Path, removed: list[str]) -> Path:
    try:
        pdf = pikepdf.open(str(src))
    except Exception:
        raise HTTPException(status_code=422, detail="PDF rusak atau tidak bisa dibaca")
    with pdf:
        if len(pdf.docinfo):
            removed.append("Info")
        for k in list(pdf.docinfo.keys()):
            del pdf.docinfo[k]
        root = pdf.Root
        for key, label in (("/Metadata", "XMP"), ("/OpenAction", "OpenAction"), ("/AA", "AA")):
            if key in root:
                del root[key]
                removed.append(label)
        names = root.get("/Names")
        if isinstance(names, pikepdf.Dictionary):
            for key, label in (("/EmbeddedFiles", "EmbeddedFiles"), ("/JavaScript", "JavaScript")):
                if key in names:
                    del names[key]
                    removed.append(label)
            if not names:
                del root["/Names"]
        pdf.save(str(dst))
    return dst


@router.post("/scrub-metadata")
async def scrub_metadata(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    removed: list[str] = []

    async def work(job, paths):
        return await run_in_threadpool(_scrub, paths[0], job.dir / "out.pdf", removed)

    return await run_job(
        request, db, user, "SCRUB_METADATA", [file], work,
        filename_out=f"bersih_{_safe_stem(file.filename)}.pdf",
        headers_fn=lambda i, o: {"X-Scrubbed": ",".join(removed)},
    )
