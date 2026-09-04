import uuid

from fastapi import Request, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from auth.jwt import decode_token, get_token_from_cookie
from db.database import get_db
from db.models import User
from db.queries import get_user_by_id


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

    return user


async def get_current_admin_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    user = await get_current_user(request, db)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
