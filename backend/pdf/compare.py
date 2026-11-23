"""Bandingkan teks dua PDF: diff per kata per halaman (pasangan halaman = nomor yang sama). Hanya teks;
perbandingan visual (piksel) di luar lingkup."""

import difflib
import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from auth.dependencies import get_current_user
from db.database import get_db
from pdf.errors import open_reader
from pdf.job import run_job

router = APIRouter()

MAX_PAGES = 100
MAX_WORDS_PAGE = 10_000


def _words(path: Path) -> list[list[str]]:
    reader = open_reader(path)
    total = len(reader.pages)
    if total == 0:
        raise HTTPException(status_code=422, detail="PDF rusak atau tidak memiliki halaman")
    if total > MAX_PAGES:
        raise HTTPException(status_code=400, detail=f"Maksimal {MAX_PAGES} halaman per berkas")
    out = []
    for p in reader.pages:
        try:
            words = (p.extract_text() or "").split()
        except Exception:
            words = []
        if len(words) > MAX_WORDS_PAGE:
            raise HTTPException(status_code=400, detail="Ada halaman yang terlalu padat untuk dibandingkan")
        out.append(words)
    return out


def diff_page(a: list[str], b: list[str]) -> list[dict]:
    """Operasi berurutan {t: eq|add|del, text}. Penggantian = del lalu add."""
    ops: list[dict] = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            ops.append({"t": "eq", "text": " ".join(a[i1:i2])})
            continue
        if i2 > i1:
            ops.append({"t": "del", "text": " ".join(a[i1:i2])})
        if j2 > j1:
            ops.append({"t": "add", "text": " ".join(b[j1:j2])})
    return ops


def compare(path_a: Path, path_b: Path) -> bytes:
    wa, wb = _words(path_a), _words(path_b)
    pages, added, removed, changed = [], 0, 0, 0
    for n in range(max(len(wa), len(wb))):
        a = wa[n] if n < len(wa) else []
        b = wb[n] if n < len(wb) else []
        ops = diff_page(a, b)
        add = sum(len(o["text"].split()) for o in ops if o["t"] == "add")
        rem = sum(len(o["text"].split()) for o in ops if o["t"] == "del")
        added, removed = added + add, removed + rem
        changed += bool(add or rem)
        pages.append({"n": n + 1, "ops": ops, "added": add, "removed": rem})
    summary = {"pages_a": len(wa), "pages_b": len(wb), "added": added, "removed": removed, "changed_pages": changed}
    return json.dumps({"pages": pages, "summary": summary}, ensure_ascii=False).encode("utf-8")


@router.post("/compare")
async def compare_pdfs(
    request: Request,
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    async def work(job, paths):
        return await run_in_threadpool(compare, paths[0], paths[1])

    return await run_job(request, db, user, "COMPARE", [file_a, file_b], work,
                         filename_out="perbandingan.json", media_type="application/json")
