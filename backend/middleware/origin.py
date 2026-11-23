import asyncio
import shutil

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from db.database import engine

router = APIRouter()


@router.get("/health")
async def health_check():
    """Cloud Run health check. Liveness only — no DB dep."""
    return {"status": "UP"}


async def _db_ok() -> bool:
    try:
        async with engine.connect() as conn:
            await asyncio.wait_for(conn.execute(text("SELECT 1")), timeout=3)
        return True
    except Exception:
        return False


@router.get("/ready")
async def readiness():
    """Siap melayani: DB terjangkau + binary pemroses ada di image. Hanya boolean (tanpa detail
    internal). 503 bila ada yang gagal. Liveness tetap /health (tanpa dependensi)."""
    checks = {
        "db": await _db_ok(),
        "qpdf": shutil.which("qpdf") is not None,
        "libreoffice": (shutil.which("soffice") or shutil.which("libreoffice")) is not None,
        "tesseract": shutil.which("tesseract") is not None,  # OCR
    }
    ok = all(checks.values())
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"status": "READY" if ok else "NOT_READY", "checks": checks},
    )


class OriginCheckMiddleware(BaseHTTPMiddleware):
    """CSRF-defense: tolak mutation request bila header Origin ada tapi ≠ frontend_url.
    Origin kosong/tak ada (curl, server-to-server, test) tetap diloloskan — tanpa ambient
    auth dari browser, tak ada vektor CSRF. GET/HEAD/OPTIONS aman selalu diloloskan."""

    def __init__(self, app, allowed_origin: str | None):
        super().__init__(app)
        self._allowed = allowed_origin.rstrip("/") if allowed_origin else None

    async def dispatch(self, request: Request, call_next):
        if request.method in ("GET", "HEAD", "OPTIONS") or not self._allowed:
            return await call_next(request)
        origin = (request.headers.get("origin") or "").rstrip("/")
        if origin and origin != self._allowed:
            return JSONResponse(status_code=403, content={"detail": "Origin not allowed"})
        return await call_next(request)
