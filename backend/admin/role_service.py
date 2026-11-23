"""Aturan perubahan role: dual control (maker–approver), invarian peran admin, dan audit.

Invarian (setelah perubahan apa pun yang menyentuh peran admin): ada ≥ 1 `dca_officer` aktif DAN ≥ 1 `dca_supervisor`
aktif, ATAU ≥ 1 `super_admin` aktif. Semua perubahan diserialkan dengan advisory lock agar dua perubahan bersamaan
tak bisa sama-sama lolos pemeriksaan."""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, Request
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from audit import log_audit
from auth import roles
from db.models import RoleChangeRequest, User

_LOCK_ID = 727275
INVARIANT_MESSAGE = (
    "Perubahan ditolak: sistem harus selalu punya minimal 1 IT DCA Officer dan 1 IT DCA Supervisor aktif, "
    "atau minimal 1 Super Admin aktif."
)


# ── logika murni (diuji tanpa DB) ──
def counts_after(counts: dict[str, int], from_role: str, to_role: str) -> dict[str, int]:
    c = dict(counts)
    c[from_role] = c.get(from_role, 0) - 1
    c[to_role] = c.get(to_role, 0) + 1
    return c


def invariant_ok(counts: dict[str, int]) -> bool:
    return (counts.get(roles.DCA_OFFICER, 0) >= 1 and counts.get(roles.DCA_SUPERVISOR, 0) >= 1) or counts.get(roles.SUPER_ADMIN, 0) >= 1


def touches_admin_roles(from_role: str, to_role: str) -> bool:
    return from_role in roles.ADMIN_ROLES or to_role in roles.ADMIN_ROLES


# ── akses data ──
async def _lock(db: AsyncSession) -> None:
    await db.execute(text(f"SELECT pg_advisory_xact_lock({_LOCK_ID})"))


async def active_counts(db: AsyncSession) -> dict[str, int]:
    rows = (await db.execute(select(User.role, func.count()).where(User.is_active.is_(True)).group_by(User.role))).all()
    counts = {r: 0 for r in roles.ALL_ROLES}
    counts.update({r: n for r, n in rows})
    return counts


async def _check_invariant(db: AsyncSession, from_role: str, to_role: str) -> None:
    if not touches_admin_roles(from_role, to_role):
        return
    if not invariant_ok(counts_after(await active_counts(db), from_role, to_role)):
        raise HTTPException(status_code=400, detail=INVARIANT_MESSAGE)


async def _get_user(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    return user


def _valid_role(role: str) -> None:
    if role not in roles.ALL_ROLES:
        raise HTTPException(status_code=422, detail="Role tidak dikenal")


def serialize(r: RoleChangeRequest, emails: dict[uuid.UUID, str]) -> dict:
    return {
        "id": str(r.id),
        "target_user_id": str(r.target_user_id),
        "target_email": emails.get(r.target_user_id),
        "from_role": r.from_role,
        "to_role": r.to_role,
        "reason": r.reason,
        "requested_by": str(r.requested_by),
        "requested_by_email": emails.get(r.requested_by),
        "status": r.status,
        "decided_by_email": emails.get(r.decided_by) if r.decided_by else None,
        "decided_at": r.decided_at.isoformat() if r.decided_at else None,
        "decision_note": r.decision_note,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


# ── operasi ──
async def apply_direct(db: AsyncSession, request: Request, actor: User, target_id: uuid.UUID, to_role: str) -> dict:
    """Super Admin mengubah role langsung (tanpa pengajuan)."""
    _valid_role(to_role)
    await _lock(db)
    target = await _get_user(db, target_id)
    old = target.role
    if old == to_role:
        return {"status": "ok", "user_id": str(target.id), "role": to_role}
    await _check_invariant(db, old, to_role)
    target.role = to_role
    email = target.email
    await db.commit()
    await log_audit(
        db, request, str(actor.id), actor.email, "USER_ROLE_CHANGE",
        detail={"target_id": str(target_id), "target_email": email, "from": old, "to": to_role, "via": "direct"},
    )
    return {"status": "ok", "user_id": str(target_id), "role": to_role}


async def create_request(
    db: AsyncSession, request: Request, requester: User, target_id: uuid.UUID, to_role: str, reason: str | None
) -> RoleChangeRequest:
    _valid_role(to_role)
    if to_role not in roles.REQUESTABLE_BY_OFFICER:
        raise HTTPException(status_code=403, detail="Pemberian Super Admin hanya dapat dilakukan oleh Super Admin")
    if target_id == requester.id:
        raise HTTPException(status_code=400, detail="Tidak boleh mengajukan perubahan role untuk diri sendiri")
    await _lock(db)
    target = await _get_user(db, target_id)
    if target.role == roles.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Role Super Admin hanya dapat diubah oleh Super Admin")
    if target.role == to_role:
        raise HTTPException(status_code=400, detail="User sudah memiliki role tersebut")
    await _check_invariant(db, target.role, to_role)  # gagal cepat; diperiksa ulang saat persetujuan

    req = RoleChangeRequest(
        target_user_id=target.id, from_role=target.role, to_role=to_role,
        reason=(reason or "").strip() or None, requested_by=requester.id, status="PENDING",
    )
    db.add(req)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Sudah ada pengajuan yang menunggu keputusan untuk user ini")
    await db.refresh(req)
    await log_audit(
        db, request, str(requester.id), requester.email, "ROLE_CHANGE_REQUESTED",
        detail={"request_id": str(req.id), "target_email": target.email, "from": req.from_role, "to": to_role, "reason": req.reason},
    )
    return req


async def _load_pending(db: AsyncSession, request_id: uuid.UUID) -> RoleChangeRequest:
    req = (
        await db.execute(select(RoleChangeRequest).where(RoleChangeRequest.id == request_id).with_for_update())
    ).scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=404, detail="Pengajuan tidak ditemukan")
    if req.status != "PENDING":
        raise HTTPException(status_code=409, detail="Pengajuan sudah diputuskan")
    return req


async def _finish(db: AsyncSession, req: RoleChangeRequest, status: str, decider: User, note: str | None) -> None:
    req.status = status
    req.decided_by = decider.id
    req.decided_at = datetime.now(timezone.utc)
    req.decision_note = (note or "").strip() or None


async def approve(db: AsyncSession, request: Request, approver: User, request_id: uuid.UUID, note: str | None) -> RoleChangeRequest:
    await _lock(db)
    req = await _load_pending(db, request_id)
    if req.requested_by == approver.id:
        raise HTTPException(status_code=403, detail="Pengaju tidak boleh menyetujui pengajuannya sendiri")
    target = await _get_user(db, req.target_user_id)
    if target.role != req.from_role:
        # Role target sudah berubah sejak diajukan → pengajuan basi, tutup otomatis.
        await _finish(db, req, "REJECTED", approver, "Role target berubah sejak diajukan")
        await db.commit()
        raise HTTPException(status_code=409, detail="Role target sudah berubah sejak diajukan; pengajuan ditutup")
    await _check_invariant(db, req.from_role, req.to_role)
    target.role = req.to_role
    await _finish(db, req, "APPROVED", approver, note)
    target_email, from_role, to_role, rid = target.email, req.from_role, req.to_role, str(req.id)
    await db.commit()
    await log_audit(
        db, request, str(approver.id), approver.email, "ROLE_CHANGE_APPROVED",
        detail={"request_id": rid, "target_email": target_email, "from": from_role, "to": to_role, "requested_by": str(req.requested_by)},
    )
    return req


async def reject(db: AsyncSession, request: Request, approver: User, request_id: uuid.UUID, note: str | None) -> RoleChangeRequest:
    await _lock(db)
    req = await _load_pending(db, request_id)
    if req.requested_by == approver.id:
        raise HTTPException(status_code=403, detail="Pengaju tidak boleh memutuskan pengajuannya sendiri; gunakan Batalkan")
    await _finish(db, req, "REJECTED", approver, note)
    rid = str(req.id)
    await db.commit()
    await log_audit(db, request, str(approver.id), approver.email, "ROLE_CHANGE_REJECTED", detail={"request_id": rid, "note": req.decision_note})
    return req


async def cancel(db: AsyncSession, request: Request, actor: User, request_id: uuid.UUID) -> RoleChangeRequest:
    await _lock(db)
    req = await _load_pending(db, request_id)
    if req.requested_by != actor.id and actor.role != roles.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Hanya pengaju atau Super Admin yang dapat membatalkan")
    await _finish(db, req, "CANCELLED", actor, None)
    rid = str(req.id)
    await db.commit()
    await log_audit(db, request, str(actor.id), actor.email, "ROLE_CHANGE_CANCELLED", detail={"request_id": rid})
    return req
