import csv
import io
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from db.models import User
from db.queries import get_audit_logs
from auth.dependencies import get_current_admin_user

router = APIRouter()


def _uuid_or_400(user_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(user_id)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=400, detail="user_id bukan UUID yang valid")


def _uuid_or_none_400(user_id: str | None) -> uuid.UUID | None:
    if user_id is None:
        return None
    return _uuid_or_400(user_id)


# ── User Management ──

@router.get("/users")
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_user),
    page: int = Query(1, ge=1),
    per_page: int = Query(200, ge=1, le=500),
):
    """List registered users (paginated). Shape tetap utk kompatibilitas client."""
    total = (await db.execute(select(func.count(User.id)))).scalar() or 0
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    users = result.scalars().all()
    return {
        "data": [
            {
                "id": str(u.id),
                "email": u.email,
                "display_name": u.display_name,
                "role": u.role,
                "is_active": u.is_active,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
        "total": total,
    }


@router.post("/users/{user_id}/upgrade")
async def upgrade_user_role(
    user_id: str,
    role: str = Query(..., regex="^(admin|user)$"),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin_user),
):
    """Upgrade/downgrade user role. Admin only."""
    uid = _uuid_or_400(user_id)
    user = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    if role == "user" and user.role == "admin":
        admin_count = (
            await db.execute(
                select(func.count()).select_from(User).where(
                    User.role == "admin", User.is_active.is_(True)
                )
            )
        ).scalar_one()
        if admin_count <= 1:
            raise HTTPException(
                status_code=400, detail="Tidak bisa menurunkan admin terakhir yang aktif"
            )

    await db.execute(update(User).where(User.id == uid).values(role=role))
    await db.commit()
    return {"status": "ok", "user_id": user_id, "role": role}


# ── Audit Logs ──


@router.get("/audit-logs")
async def list_audit_logs(
    user_id: str | None = Query(None),
    action: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_admin_user),
):
    """Paginated audit log list with filters."""
    uid = _uuid_or_none_400(user_id)
    from_date = _parse_date(date_from) if date_from else None
    to_date = _parse_date(date_to) if date_to else None
    if to_date:
        to_date = to_date + timedelta(days=1)  # include end date

    rows, total = await get_audit_logs(
        db=db,
        user_id=uid,
        action=action,
        status=status,
        search=search,
        date_from=from_date,
        date_to=to_date,
        page=page,
        per_page=per_page,
    )

    return {
        "data": [_row_to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, (total + per_page - 1) // per_page) if total else 0,
    }


@router.get("/audit-logs/csv")
async def export_audit_logs_csv(
    user_id: str | None = Query(None),
    action: str | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_admin_user),
):
    """Export audit logs as CSV."""
    uid = _uuid_or_none_400(user_id)
    from_date = _parse_date(date_from) if date_from else None
    to_date = _parse_date(date_to) if date_to else None
    if to_date:
        to_date = to_date + timedelta(days=1)

    rows, _ = await get_audit_logs(
        db=db,
        user_id=uid,
        action=action,
        status=status,
        search=search,
        date_from=from_date,
        date_to=to_date,
        page=1,
        per_page=10_000,  # CSV exports all matching
    )

    output = io.StringIO()
    output.write("﻿")  # BOM for Excel UTF-8
    writer = csv.writer(output)
    writer.writerow(["Timestamp", "User Email", "Action", "Source Files", "Result File", "Status", "Duration (ms)", "IP Address"])
    for r in rows:
        writer.writerow([
            r.executed_at.isoformat() if r.executed_at else "",
            r.user_email or "",
            r.action or "",
            ", ".join(r.source_files) if r.source_files else "",
            r.result_file or "",
            r.status or "",
            str(r.processing_ms or 0),
            str(r.ip_address or ""),
        ])

    csv_bytes = output.getvalue().encode("utf-8")
    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )


def _row_to_dict(r):
    return {
        "id": r.id,
        "user_id": str(r.user_id) if r.user_id else None,
        "user_email": r.user_email,
        "action": r.action,
        "source_files": r.source_files,
        "result_file": r.result_file,
        "file_sizes": r.file_sizes,
        "result_size": r.result_size,
        "processing_ms": r.processing_ms,
        "status": r.status,
        "error_message": r.error_message,
        "ip_address": str(r.ip_address) if r.ip_address else None,
        "user_agent": r.user_agent,
        "executed_at": r.executed_at.isoformat() if r.executed_at else None,
    }


def _parse_date(s: str) -> datetime | None:
    try:
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None
