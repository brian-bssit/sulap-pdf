import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

# Holder mutable (bukan nilai langsung): middleware BaseHTTPMiddleware menjalankan app di task
# lain, sehingga perubahan ContextVar di dalamnya tak terlihat di luar; objek dict yang sama terlihat.
request_ctx: ContextVar[dict | None] = ContextVar("request_ctx", default=None)

# Atribut bawaan LogRecord — selain ini (dan `fields`) tidak ikut ke JSON.
_RESERVED = set(vars(logging.LogRecord("", 0, "", 0, "", (), None))) | {"message", "asctime"}


class JsonFormatter(logging.Formatter):
    """Satu baris JSON per kejadian. `severity`/`message` dikenali Cloud Logging;
    field tambahan lewat `extra={"fields": {...}}`."""

    def format(self, record: logging.LogRecord) -> str:
        ctx = request_ctx.get() or {}
        out = {
            "time": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "severity": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": ctx.get("request_id"),
            "user_id": ctx.get("user_id"),
        }
        out.update(getattr(record, "fields", None) or {})
        if record.exc_info:
            out["exception"] = self.formatException(record.exc_info)
        return json.dumps(out, default=str, ensure_ascii=False)


def setup_logging(level: str, json_logs: bool) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        JsonFormatter() if json_logs
        else logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    )
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
