"""Sesi: satu sesi aktif per akun (login terbaru menang) + idle timeout.

Kolom `users.session_id` = sesi yang sah; `users.last_seen_at` = aktivitas terakhir.
`last_seen_at IS NULL` pada user ber-sesi berarti sesi itu sudah dinyatakan habis (idle) dan sudah dicatat."""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from audit import log_audit
from auth.jwt import create_token
from config import settings
from db.models import User

# Frekuensi maksimum penulisan last_seen_at (hindari UPDATE di tiap request).
TOUCH_INTERVAL_SECONDS = 30
# Klien (IdleGuard) memaksa keluar tepat di `idle_timeout_seconds`; server jadi pengaman cadangan dengan sedikit
# kelonggaran supaya selisih jeda ping (≤ ~50 dtk) tak mengeluarkan user yang masih aktif lebih awal dari klien.
IDLE_GRACE_SECONDS = 60

REASON_IDLE = "SESSION_IDLE"
REASON_REPLACED = "SESSION_REPLACED"
REASON_INVALID = "SESSION_INVALID"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _server_idle_limit() -> int:
    return settings.idle_timeout_seconds + IDLE_GRACE_SECONDS


def auth_error(reason: str, detail: str) -> HTTPException:
    """401 dengan alasan yang bisa dibaca klien lewat header `X-Auth-Reason`."""
    return HTTPException(status_code=401, detail=detail, headers={"X-Auth-Reason": reason})


async def issue_token(db: AsyncSession, request: Request, user: User) -> str:
    """Mulai sesi baru untuk `user` dan kembalikan JWT-nya. Sesi lama (bila ada) otomatis tidak valid."""
    replaced = (
        user.session_id is not None
        and user.last_seen_at is not None
        and (_now() - user.last_seen_at).total_seconds() < _server_idle_limit()
    )
    user.session_id = uuid.uuid4()
    user.last_seen_at = _now()
    await db.commit()
    if replaced:
        await log_audit(db, request, str(user.id), user.email, "SESSION_REPLACED", status="SUCCESS")
    return create_token(str(user.id), user.email, str(user.session_id))


async def validate_session(db: AsyncSession, request: Request, user: User, payload: dict) -> None:
    """Pastikan token milik sesi yang sah dan tidak idle; perbarui `last_seen_at` (dibatasi frekuensinya)."""
    sid = payload.get("sid")
    if not sid or user.session_id is None or str(user.session_id) != sid:
        # Token lama (tanpa sid) atau sesi sudah digantikan login di tempat lain.
        reason = REASON_INVALID if not sid else REASON_REPLACED
        msg = "Sesi tidak valid. Silakan login ulang." if not sid else "Sesi berakhir karena login di tempat lain."
        raise auth_error(reason, msg)

    now = _now()
    last = user.last_seen_at
    if last is None or (now - last).total_seconds() > _server_idle_limit():
        if last is not None:  # pertama kali terdeteksi → catat sekali, tandai habis
            user.last_seen_at = None
            await db.commit()
            await log_audit(db, request, str(user.id), user.email, "SESSION_IDLE_EXPIRED", status="SUCCESS")
        raise auth_error(REASON_IDLE, "Sesi berakhir karena tidak ada aktivitas.")

    if (now - last).total_seconds() >= TOUCH_INTERVAL_SECONDS:
        user.last_seen_at = now
        await db.commit()
