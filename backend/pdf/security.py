"""Unlock (buka password yang diketahui user) dan Protect (AES-256). Password hanya field form:
tidak pernah masuk log, audit, atau URL."""

import secrets
from pathlib import Path

import pikepdf
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from auth.dependencies import get_current_user
from db.database import get_db
from pdf.job import run_job
from pdf.split import _safe_stem

router = APIRouter()
MIN_PASSWORD, MAX_PASSWORD = 8, 128


def _unlock(src: Path, dst: Path, password: str) -> Path:
    try:
        pdf = pikepdf.open(str(src), password=password)
    except pikepdf.PasswordError:
        raise HTTPException(status_code=422, detail="Password salah")
    except Exception:
        raise HTTPException(status_code=422, detail="PDF rusak atau tidak bisa dibaca")
    with pdf:
        pdf.save(str(dst))
    return dst


def _protect(src: Path, dst: Path, password: str, allow_print: bool, allow_copy: bool) -> Path:
    try:
        pdf = pikepdf.open(str(src))
    except Exception:
        raise HTTPException(status_code=422, detail="PDF rusak atau tidak bisa dibaca")
    with pdf:
        # Owner password acak & dibuang: pemegang user-password tidak bisa melonggarkan izin.
        pdf.save(str(dst), encryption=pikepdf.Encryption(
            user=password, owner=secrets.token_urlsafe(24), R=6,
            allow=pikepdf.Permissions(
                print_lowres=allow_print, print_highres=allow_print, extract=allow_copy,
                accessibility=True, modify_annotation=False, modify_assembly=False,
                modify_form=False, modify_other=False,
            ),
        ))
    return dst


@router.post("/unlock")
async def unlock_pdf(
    request: Request,
    file: UploadFile = File(...),
    password: str = Form(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    if not password or len(password) > MAX_PASSWORD:
        raise HTTPException(status_code=400, detail="Password wajib diisi")

    async def work(job, paths):
        return await run_in_threadpool(_unlock, paths[0], job.dir / "out.pdf", password)

    return await run_job(request, db, user, "UNLOCK", [file], work,
                         filename_out=f"unlocked_{_safe_stem(file.filename)}.pdf", check_encrypted=False)


@router.post("/protect")
async def protect_pdf(
    request: Request,
    file: UploadFile = File(...),
    password: str = Form(...),
    allow_print: bool = Form(True),
    allow_copy: bool = Form(True),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    if not MIN_PASSWORD <= len(password) <= MAX_PASSWORD:
        raise HTTPException(status_code=400, detail=f"Password {MIN_PASSWORD}–{MAX_PASSWORD} karakter")

    async def work(job, paths):
        return await run_in_threadpool(_protect, paths[0], job.dir / "out.pdf", password, allow_print, allow_copy)

    return await run_job(request, db, user, "PROTECT", [file], work,
                         filename_out=f"protected_{_safe_stem(file.filename)}.pdf")
