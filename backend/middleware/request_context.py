import logging
import re
import time
import uuid

from logging_setup import request_ctx

logger = logging.getLogger("cloudpdf")

_VALID_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_QUIET_PATHS = ("/api/health", "/api/ready")


class RequestContextMiddleware:
    """ASGI murni, paling luar: beri tiap request `request_id` (X-Request-ID masuk bila valid,
    selain itu dibangkitkan), kembalikan di respons, dan tulis SATU baris log akses terstruktur
    (method, path tanpa query, status, durasi, user_id bila sudah terautentikasi)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = dict(scope["headers"]).get(b"x-request-id", b"").decode("latin-1")
        rid = incoming if _VALID_ID.match(incoming) else uuid.uuid4().hex[:12]
        ctx = {"request_id": rid, "user_id": None}
        token = request_ctx.set(ctx)
        start = time.monotonic()
        status = 500

        async def send_wrapper(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message["headers"] = [*message["headers"], (b"x-request-id", rid.encode())]
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            path = scope["path"]
            parts = path.split("/")
            fields = {
                "event": "request",
                "method": scope["method"],
                "path": path,
                "status": status,
                "duration_ms": int((time.monotonic() - start) * 1000),
                "tool": parts[3] if path.startswith("/api/pdf/") and len(parts) > 3 else None,
            }
            level = logging.DEBUG if path in _QUIET_PATHS and status < 500 else logging.INFO
            logger.log(level, "request", extra={"fields": fields})
            request_ctx.reset(token)
