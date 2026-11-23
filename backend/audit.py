import ipaddress
import logging

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from db.queries import insert_audit_log

logger = logging.getLogger("cloudpdf")


async def log_audit(
    db: AsyncSession,
    request: Request,
    user_id: str | None,
    user_email: str,
    action: str,
    source_files: list[str] | None = None,
    result_file: str | None = None,
    file_sizes: list[int] | None = None,
    result_size: int | None = None,
    processing_ms: int | None = None,
    status: str = "SUCCESS",
    error_message: str | None = None,
    detail: dict | None = None,
) -> None:
    try:
        # Di belakang proxy (Cloud Run) alamat asli ada di X-Forwarded-For, bukan
        # request.client (yang IP proxy). Nilai audit-only → spoofable, acceptable.
        xff = request.headers.get("x-forwarded-for", "")
        ip = xff.split(",")[0].strip() or (request.client.host if request.client else None)
        # Kolom INET: nilai non-IP (XFF dipalsukan klien) membuat INSERT gagal dan
        # meracuni session transaksi request → validasi dulu, simpan NULL bila bukan IP.
        try:
            ip = str(ipaddress.ip_address(ip)) if ip else None
        except ValueError:
            ip = None
        ua = request.headers.get("user-agent", "")
        # Salinan ke Cloud Logging (sink immutable), ditulis sebelum INSERT agar
        # tetap tercatat walau DB gagal.
        logger.info("audit", extra={"fields": {
            "event": "audit", "user_email": user_email, "action": action, "status": status,
            "source_files": source_files, "result_size": result_size,
            "processing_ms": processing_ms, "ip": ip, "detail": detail,
        }})
        await insert_audit_log(
            db=db,
            user_id=user_id,
            user_email=user_email,
            action=action,
            source_files=source_files,
            result_file=result_file,
            file_sizes=file_sizes,
            result_size=result_size,
            processing_ms=processing_ms,
            status=status,
            error_message=error_message,
            ip_address=ip,
            user_agent=ua,
            detail=detail,
        )
    except Exception as e:
        logger.error(f"Failed to insert audit log: {e}")
