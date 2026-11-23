import csv
import io
import uuid
from datetime import datetime, timedelta

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Query, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db.database import get_db
from db.models import User
from db.queries import get_audit_logs
from auth import roles
from auth.dependencies import get_admin_viewer, get_role_approver, get_role_requester, get_super_admin
from admin import role_service
from db.models import RoleChangeRequest

router = APIRouter()


def _cell(value) -> str:
    """Netralkan CSV/formula injection: sel yang diawali = + - @ (atau tab/CR) diberi apostrof agar Excel
    tak menjalankannya. Nama berkas dan email berasal dari user → tidak dipercaya."""
    s = "" if value is None else str(value)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


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
    viewer=Depends(get_admin_viewer),
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


@router.get("/users/csv")
async def export_users_csv(
    db: AsyncSession = Depends(get_db),
    viewer=Depends(get_admin_viewer),
):
    """Ekspor daftar user (bahan review akses tahunan): email, nama, role, status, login terakhir, dibuat."""
    users = (await db.execute(select(User).order_by(User.email))).scalars().all()
    output = io.StringIO()
    output.write("\ufeff")  # BOM untuk Excel UTF-8
    writer = csv.writer(output)
    writer.writerow(["Email", "Nama", "Role", "Aktif", "Login Terakhir", "Dibuat"])
    for u in users:
        writer.writerow([
            _cell(u.email), _cell(u.display_name), _cell(u.role), "ya" if u.is_active else "tidak",
            u.last_login_at.isoformat() if u.last_login_at else "", u.created_at.isoformat() if u.created_at else "",
        ])
    return StreamingResponse(
        iter([output.getvalue().encode("utf-8")]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users.csv"},
    )


@router.post("/users/{user_id}/upgrade")
async def upgrade_user_role(
    request: Request,
    user_id: str,
    role: str = Query(..., description="Salah satu dari: " + ", ".join(roles.ALL_ROLES)),
    db: AsyncSession = Depends(get_db),
    actor=Depends(get_super_admin),
):
    """Ubah role LANGSUNG (tanpa dual control). Hanya Super Admin; invarian peran admin tetap diperiksa."""
    return await role_service.apply_direct(db, request, actor, _uuid_or_400(user_id), role)


# ── Pengajuan perubahan role (dual control) ──

class RoleRequestIn(BaseModel):
    user_id: str
    role: str
    reason: str | None = Field(default=None, max_length=1000)


class DecisionIn(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


async def _emails(db: AsyncSession, reqs: list[RoleChangeRequest]) -> dict:
    ids = {r.target_user_id for r in reqs} | {r.requested_by for r in reqs} | {r.decided_by for r in reqs if r.decided_by}
    rows = (await db.execute(select(User.id, User.email).where(User.id.in_(ids)))).all() if ids else []
    return {i: e for i, e in rows}


@router.get("/role-requests")
async def list_role_requests(
    status: str | None = Query(None, pattern="^(PENDING|APPROVED|REJECTED|CANCELLED)$"),
    db: AsyncSession = Depends(get_db),
    viewer=Depends(get_admin_viewer),
):
    q = select(RoleChangeRequest).order_by(RoleChangeRequest.created_at.desc()).limit(200)
    if status:
        q = q.where(RoleChangeRequest.status == status)
    reqs = (await db.execute(q)).scalars().all()
    emails = await _emails(db, list(reqs))
    return {"data": [role_service.serialize(r, emails) for r in reqs]}


@router.post("/role-requests", status_code=201)
async def create_role_request(
    request: Request, body: RoleRequestIn, db: AsyncSession = Depends(get_db), requester=Depends(get_role_requester)
):
    req = await role_service.create_request(db, request, requester, _uuid_or_400(body.user_id), body.role, body.reason)
    return role_service.serialize(req, await _emails(db, [req]))


@router.post("/role-requests/{request_id}/approve")
async def approve_role_request(
    request: Request, request_id: str, body: DecisionIn | None = None,
    db: AsyncSession = Depends(get_db), approver=Depends(get_role_approver),
):
    req = await role_service.approve(db, request, approver, _uuid_or_400(request_id), body.note if body else None)
    return role_service.serialize(req, await _emails(db, [req]))


@router.post("/role-requests/{request_id}/reject")
async def reject_role_request(
    request: Request, request_id: str, body: DecisionIn | None = None,
    db: AsyncSession = Depends(get_db), approver=Depends(get_role_approver),
):
    req = await role_service.reject(db, request, approver, _uuid_or_400(request_id), body.note if body else None)
    return role_service.serialize(req, await _emails(db, [req]))


@router.post("/role-requests/{request_id}/cancel")
async def cancel_role_request(
    request: Request, request_id: str, db: AsyncSession = Depends(get_db), actor=Depends(get_admin_viewer),
):
    req = await role_service.cancel(db, request, actor, _uuid_or_400(request_id))
    return role_service.serialize(req, await _emails(db, [req]))


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
    user=Depends(get_admin_viewer),
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
    user=Depends(get_admin_viewer),
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
            _cell(r.user_email),
            _cell(r.action),
            _cell(", ".join(r.source_files) if r.source_files else ""),
            _cell(r.result_file),
            _cell(r.status),
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
        "detail": r.detail,
        "executed_at": r.executed_at.isoformat() if r.executed_at else None,
    }


def _parse_date(s: str) -> datetime | None:
    try:
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None
