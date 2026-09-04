import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from db.database import engine
from db.models import Base
from router import api_router
from middleware.error_handler import register_error_handlers
from middleware.origin import OriginCheckMiddleware

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
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper()),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logger.info(f"Starting {settings.app_name}")

    # Create DB tables (non-fatal if DB unavailable)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables verified")
    except Exception as e:
        logger.warning(f"Database not available, tables not created: {e}")

    # Start orphan cleanup
    cleanup_task = asyncio.create_task(cleanup_orphaned_files())

    yield

    cleanup_task.cancel()
    await engine.dispose()
    logger.info(f"Shutting down {settings.app_name}")


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(OriginCheckMiddleware, allowed_origin=settings.frontend_url)

register_error_handlers(app)

app.include_router(api_router, prefix="/api")

# Serve static frontend
static_dir = Path(__file__).parent / "static"

if static_dir.exists():
    from fastapi import Request
    from fastapi.responses import FileResponse, HTMLResponse

    @app.get("/{full_path:path}")
    async def serve_frontend(request: Request, full_path: str):
        """Serve static files with SPA fallback."""
        # Skip API paths (shouldn't reach here but belt-and-suspenders)
        if full_path.startswith("api/"):
            return HTMLResponse(status_code=404)

        file_path = static_dir / full_path

        # Exact file match
        if file_path.is_file():
            return FileResponse(str(file_path))

        # Directory → index.html
        if file_path.is_dir() and (file_path / "index.html").is_file():
            return FileResponse(str(file_path / "index.html"))

        # .html fallback (e.g. /dashboard → /dashboard.html)
        html_path = static_dir / f"{full_path}.html"
        if html_path.is_file():
            return FileResponse(str(html_path))

        # SPA fallback
        index_path = static_dir / "index.html"
        if index_path.is_file():
            return FileResponse(str(index_path))

        return HTMLResponse(status_code=404)
