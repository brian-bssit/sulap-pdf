import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from db.database import engine
from router import api_router
from static_files import resolve_inside
from middleware.error_handler import register_error_handlers
from middleware.origin import OriginCheckMiddleware
from middleware.body_limit import BodyLimitMiddleware
from middleware.security_headers import SecurityHeadersMiddleware
from middleware.request_context import RequestContextMiddleware
from logging_setup import setup_logging

logger = logging.getLogger("cloudpdf")


async def cleanup_orphaned_files():
    """Background task: hapus file /tmp yatim setiap N detik."""
    while True:
        await asyncio.sleep(settings.cleanup_interval_seconds)
        cutoff = time.time() - settings.orphan_age_seconds
        tmp = Path("/tmp")
        count = 0
        freed = 0
        for f in tmp.glob("cpdf_*"):
            try:
                if f.stat().st_mtime < cutoff:
                    size = f.stat().st_size
                    f.unlink(missing_ok=True)
                    count += 1
                    freed += size
            except OSError:
                pass
        if count:
            logger.info(f"Orphan cleanup: removed {count} files, freed {freed} bytes")


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging(settings.log_level, json_logs=settings.environment == "production")
    logger.info(f"Starting {settings.app_name}")

    # Start orphan cleanup
    cleanup_task = asyncio.create_task(cleanup_orphaned_files())

    yield

    cleanup_task.cancel()
    await engine.dispose()
    logger.info(f"Shutting down {settings.app_name}")


# Dokumentasi API otomatis (/docs, /redoc, /openapi.json) tidak dibuka di production.
_docs = {} if settings.environment != "production" else {"docs_url": None, "redoc_url": None, "openapi_url": None}
app = FastAPI(title=settings.app_name, lifespan=lifespan, **_docs)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(OriginCheckMiddleware, allowed_origin=settings.frontend_url)
# Batas total = 30MB (agregat merge) + 1MiB overhead multipart. Paling luar → ditolak sebelum body dibaca.
app.add_middleware(BodyLimitMiddleware, max_bytes=(settings.max_file_size_mb + 1) * 1024 * 1024)
app.add_middleware(SecurityHeadersMiddleware, hsts=settings.frontend_url.startswith("https"))
# Paling luar: request_id + log akses mencakup respons yang ditolak middleware lain (413/403).
app.add_middleware(RequestContextMiddleware)

register_error_handlers(app)

app.include_router(api_router, prefix="/api")

# Serve static frontend
static_dir = Path(__file__).parent / "static"


@app.get("/{full_path:path}")
async def serve_frontend(request: Request, full_path: str):
    """Serve static files with SPA fallback. Setiap jalur diverifikasi tetap di dalam `static/`
    (path traversal `..%2f` dulu bisa membaca berkas apa pun, termasuk kode sumber)."""
    # Skip API paths (shouldn't reach here but belt-and-suspenders)
    if full_path.startswith("api/") or not static_dir.exists():
        return HTMLResponse(status_code=404)

    file_path = resolve_inside(static_dir, full_path)
    if file_path is None:
        return HTMLResponse(status_code=404)

    # Exact file match
    if file_path.is_file():
        return FileResponse(str(file_path))

    # Directory → index.html
    if file_path.is_dir() and (file_path / "index.html").is_file():
        return FileResponse(str(file_path / "index.html"))

    # .html fallback (e.g. /dashboard → /dashboard.html)
    html_path = resolve_inside(static_dir, f"{full_path}.html")
    if html_path is not None and html_path.is_file():
        return FileResponse(str(html_path))

    # SPA fallback
    index_path = static_dir / "index.html"
    if index_path.is_file():
        return FileResponse(str(index_path))

    return HTMLResponse(status_code=404)
