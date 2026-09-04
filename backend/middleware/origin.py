from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

router = APIRouter()


@router.get("/health")
async def health_check():
    """Cloud Run health check. Liveness only — no DB dep."""
    return {"status": "UP"}


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
