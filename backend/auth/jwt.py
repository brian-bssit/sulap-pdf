from datetime import datetime, timedelta, timezone

import uuid

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
import jwt
from jwt import PyJWTError
from sqlalchemy.ext.asyncio import AsyncSession

from audit import log_audit
from config import settings
from db.database import get_db
from db.queries import get_user_by_id

router = APIRouter()


def create_token(user_id: str, email: str, sid: str | None = None) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "sid": sid,
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except PyJWTError:
        return None


async def get_token_from_cookie(request: Request) -> str | None:
    return request.cookies.get("cpdf_token")


@router.post("/logout")
async def logout(request: Request, reason: str | None = Query(None), db: AsyncSession = Depends(get_db)):
    """Hapus cookie; bila sesi masih valid, catat LOGOUT di audit (checklist: log login & logout)."""
    payload = decode_token(request.cookies.get("cpdf_token") or "")
    try:
        user = await get_user_by_id(db, uuid.UUID(payload["user_id"])) if payload else None
    except (KeyError, ValueError, TypeError):
        user = None
    if user:
        # `reason=idle` dikirim klien saat IdleGuard memaksa keluar; nilai lain diabaikan (tak dipercaya).
        detail = {"reason": "idle"} if reason == "idle" else None
        await log_audit(db, request, str(user.id), user.email, "LOGOUT", status="SUCCESS", detail=detail)
    response = JSONResponse({"message": "Logged out"})
    response.delete_cookie(key="cpdf_token", path="/api")
    return response
