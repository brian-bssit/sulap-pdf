import uuid

from fastapi import Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from auth.jwt import decode_token, get_token_from_cookie
from auth import roles
from auth.session import validate_session
from db.database import get_db
from db.models import User
from db.queries import get_user_by_id
from logging_setup import request_ctx


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    token = await get_token_from_cookie(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    try:
        uid = uuid.UUID(user_id)
    except (ValueError, TypeError, AttributeError):
        # Token disusun buruk / palsu — ini urusan auth, bukan 400 yang memantulkan nilai.
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = await get_user_by_id(db, uid)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    await validate_session(db, request, user, payload)

    ctx = request_ctx.get()
    if ctx is not None:
        ctx["user_id"] = str(user.id)
    return user


def require_roles(*roles: str):
    """Dependency: user harus memiliki salah satu `roles`. Role dibaca dari DB di tiap request."""

    async def dependency(request: Request, db: AsyncSession = Depends(get_db)) -> User:
        user = await get_current_user(request, db)
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Anda tidak memiliki akses untuk fungsi ini")
        return user

    return dependency


get_admin_viewer = require_roles(*roles.VIEW_ROLES)          # daftar user, log audit, pengajuan role (baca)
get_super_admin = require_roles(roles.SUPER_ADMIN)           # ubah role langsung
get_role_requester = require_roles(roles.DCA_OFFICER)        # mengajukan perubahan role
get_role_approver = require_roles(*roles.APPROVER_ROLES)     # menyetujui/menolak pengajuan
