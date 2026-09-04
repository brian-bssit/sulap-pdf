import uuid
from datetime import datetime

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import User, AuditLog


async def get_user_by_google_sub(db: AsyncSession, google_sub: str) -> User | None:
    result = await db.execute(select(User).where(User.google_sub == google_sub))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user(db: AsyncSession, google_sub: str, email: str, display_name: str, picture_url: str | None, role: str = "user") -> User:
    user = User(
        google_sub=google_sub,
        email=email,
        display_name=display_name,
        picture_url=picture_url,
        role=role,
        last_login_at=datetime.utcnow(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def update_last_login(db: AsyncSession, user: User, display_name: str, picture_url: str | None) -> None:
    user.last_login_at = datetime.utcnow()
    user.display_name = display_name
    user.picture_url = picture_url
    await db.commit()


async def insert_audit_log(
    db: AsyncSession,
    user_id: uuid.UUID | None,
    user_email: str,
    action: str,
    source_files: list[str] | None = None,
    result_file: str | None = None,
    file_sizes: list[int] | None = None,
    result_size: int | None = None,
    processing_ms: int | None = None,
    status: str = "SUCCESS",
    error_message: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    log = AuditLog(
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
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log


async def get_audit_logs(
    db: AsyncSession,
    user_id: uuid.UUID | None = None,
    action: str | None = None,
    status: str | None = None,
    search: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[AuditLog], int]:
    conditions = []
    if user_id:
        conditions.append(AuditLog.user_id == user_id)
    if action:
        conditions.append(AuditLog.action == action)
    if status:
        conditions.append(AuditLog.status == status)
    if search:
        # ILIKE server-side (bukan filter client yang cuma kena halaman aktif).
        # Escape wildcard LIKE biar input user tak jadi pola.
        s = search.strip()
        if s:
            esc = s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            like = f"%{esc}%"
            conditions.append(
                or_(
                    AuditLog.user_email.ilike(like, escape="\\"),
                    AuditLog.action.ilike(like, escape="\\"),
                )
            )
    if date_from:
        conditions.append(AuditLog.executed_at >= date_from)
    if date_to:
        conditions.append(AuditLog.executed_at <= date_to)

    where = and_(*conditions) if conditions else None

    count_q = select(func.count(AuditLog.id))
    if where is not None:
        count_q = count_q.where(where)
    total = (await db.execute(count_q)).scalar() or 0

    q = select(AuditLog).order_by(AuditLog.executed_at.desc())
    if where is not None:
        q = q.where(where)
    q = q.offset((page - 1) * per_page).limit(per_page)
    rows = (await db.execute(q)).scalars().all()

    return list(rows), total
