from fastapi import APIRouter, Depends, Request, Response

from auth.dependencies import get_current_user
from config import settings

router = APIRouter()


@router.get("/me")
async def get_me(request: Request, user=Depends(get_current_user)):
    return {
        "id": str(user.id),
        "email": user.email,
        "display_name": user.display_name,
        "picture_url": user.picture_url,
        "role": user.role,
        "idle_timeout_seconds": settings.idle_timeout_seconds,
    }


@router.post("/ping", status_code=204)
async def ping(user=Depends(get_current_user)):
    """Penanda aktivitas dari klien (get_current_user memperbarui last_seen_at). 401 bila sesi sudah habis."""
    return Response(status_code=204)
