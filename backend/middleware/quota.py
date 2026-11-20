import math
from datetime import timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from audit import log_audit
from auth.dependencies import get_current_user
from config import settings
from db.database import get_db
from db.models import AuditLog

# Login dan penolakan kuota itu sendiri tidak dihitung sebagai operasi.
_NOT_COUNTED = (
    "GOOGLE_LOGIN", "LOGOUT", "SESSION_REPLACED", "SESSION_IDLE_EXPIRED", "RATE_LIMITED", "USER_ROLE_CHANGE",
)


async def _usage(db: AsyncSession, user_id, seconds: int) -> tuple[int, float | None]:
    """(jumlah operasi dalam jendela, detik sampai operasi tertua keluar dari jendela).
    Dihitung di sisi DB (now()) → konsisten antar-instance Cloud Run, tanpa state in-memory."""
    window = timedelta(seconds=seconds)
    stmt = select(
        func.count(),
        func.extract("epoch", func.min(AuditLog.executed_at) + window - func.now()),
    ).where(
        AuditLog.user_id == user_id,
        AuditLog.executed_at >= func.now() - window,
        AuditLog.action.notin_(_NOT_COUNTED),
    )
    count, retry = (await db.execute(stmt)).one()
    return count, float(retry) if retry is not None else None


async def enforce_quota(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
) -> None:
    for seconds, limit, label in (
        (60, settings.rate_limit_per_min, "per menit"),
        (86400, settings.quota_per_day, "per hari"),
    ):
        if limit <= 0:  # 0 = nonaktif
            continue
        count, retry = await _usage(db, user.id, seconds)
        if count >= limit:
            wait = max(1, min(seconds, math.ceil(retry if retry is not None else seconds)))
            msg = f"Batas {limit} operasi {label} tercapai. Coba lagi dalam {wait} detik."
            await log_audit(
                db, request, str(user.id), user.email, "RATE_LIMITED",
                status="FAILED", error_message=msg,
            )
            raise HTTPException(status_code=429, detail=msg, headers={"Retry-After": str(wait)})
