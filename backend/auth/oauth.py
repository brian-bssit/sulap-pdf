import hashlib
import hmac
import logging
import secrets
import time
import uuid

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db.database import get_db
from db.queries import get_user_by_google_sub, create_user, update_last_login
from auth.jwt import create_token
from audit import log_audit

try:
    from google.auth.transport.requests import Request as GoogleRequest
    from google.oauth2 import id_token as google_id_token

    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    GOOGLE_AUTH_AVAILABLE = False

logger = logging.getLogger("cloudpdf")

router = APIRouter()

# Only register OAuth if credentials are configured
oauth = None
if settings.google_client_id and settings.google_client_secret:
    from authlib.integrations.starlette_client import OAuth

    oauth = OAuth()
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )

_STATE_TTL_SECONDS = 600


def _new_state() -> str:
    """State OAuth stateless (HMAC + timestamp) — tanpa dict in-memory, aman
    multi-instance (Cloud Run), tanpa leak memori."""
    ts = int(time.time())
    nonce = secrets.token_hex(8)
    msg = f"{ts}.{nonce}".encode()
    sig = hmac.new(settings.secret_key.encode(), msg, hashlib.sha256).hexdigest()
    return f"{ts}.{nonce}.{sig}"


def _valid_state(state: str | None) -> bool:
    try:
        ts, nonce, sig = str(state).split(".")
    except ValueError:
        return False
    if not (ts.isdigit() and nonce and sig):
        return False
    msg = f"{ts}.{nonce}".encode()
    expect = hmac.new(settings.secret_key.encode(), msg, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expect, sig):
        return False
    return (time.time() - int(ts)) < _STATE_TTL_SECONDS


def _set_jwt_cookie(response, token: str):
    response.set_cookie(
        key="cpdf_token",
        value=token,
        httponly=True,
        secure=settings.frontend_url.startswith("https"),
        samesite="strict",
        path="/api",
        max_age=settings.jwt_expiry_days * 86400,
    )


@router.get("/google/login")
async def google_login(request: Request):
    if not oauth:
        if settings.dev_login_enabled:
            # Dev fallback: redirect to dev-login
            return RedirectResponse(url="/api/auth/dev/login")
        raise HTTPException(status_code=404, detail="Google login tidak dikonfigurasi")
    state = _new_state()
    redirect_uri = str(request.url_for("google_callback"))
    return await oauth.google.authorize_redirect(request, redirect_uri, state=state)


@router.get("/google/callback")
async def google_callback(request: Request, db: AsyncSession = Depends(get_db)):
    if not oauth:
        raise HTTPException(status_code=400, detail="OAuth not configured")

    state = request.query_params.get("state")
    if not _valid_state(state):
        logger.warning("OAuth callback: invalid or stale state parameter")
        return RedirectResponse(url=f"{settings.frontend_url}/?error=invalid_state")

    try:
        token = await oauth.google.authorize_access_token(request)
        userinfo = token.get("userinfo", {})

        google_sub = userinfo.get("sub", "")
        email = userinfo.get("email", "")
        display_name = userinfo.get("name", email.split("@")[0] if email else "Unknown")
        picture_url = userinfo.get("picture")

        if not google_sub or not email:
            logger.error("Google userinfo missing sub or email")
            return RedirectResponse(url=f"{settings.frontend_url}/?error=auth_failed")

        user = await get_user_by_google_sub(db, google_sub)
        is_new = user is None

        if is_new:
            user = await create_user(db, google_sub, email, display_name, picture_url)
        else:
            await update_last_login(db, user, display_name, picture_url)

        await log_audit(
            db=db,
            request=request,
            user_id=str(user.id),
            user_email=user.email,
            action="GOOGLE_LOGIN",
            status="SUCCESS",
        )

        jwt_token = create_token(str(user.id), user.email)
        response = RedirectResponse(url="/dashboard")
        _set_jwt_cookie(response, jwt_token)
        return response

    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        return RedirectResponse(url=f"/?error=auth_failed")


# ── Dev auth bypass (hanya bila DEV_LOGIN=true) ──

@router.get("/dev/login")
async def dev_login(request: Request, db: AsyncSession = Depends(get_db)):
    """Dev-only: auto-login tanpa Google OAuth."""
    if not settings.dev_login_enabled:
        raise HTTPException(status_code=404, detail="Not available")

    dev_email = request.query_params.get("email", "dev@cloudpdf.local")
    dev_name = request.query_params.get("name", "Dev User")
    dev_role = request.query_params.get("role", "user")
    dev_sub = f"dev-{dev_email}"

    user = await get_user_by_google_sub(db, dev_sub)
    if not user:
        user = await create_user(
            db,
            google_sub=dev_sub,
            email=dev_email,
            display_name=dev_name,
            picture_url=None,
            role=dev_role,
        )
    else:
        await update_last_login(db, user, dev_name, None)
        # Update role if changed (dev mode convenience)
        if user.role != dev_role:
            user.role = dev_role
            await db.commit()

    await log_audit(
        db=db,
        request=request,
        user_id=str(user.id),
        user_email=user.email,
        action="GOOGLE_LOGIN",
        status="SUCCESS",
    )

    jwt_token = create_token(str(user.id), user.email)
    response = RedirectResponse(url="/dashboard")
    _set_jwt_cookie(response, jwt_token)
    return response


# ── Google Identity Services (GIS) popup flow — same as beexexity ──
# Client-side "Sign in with Google" sends an ID token; we verify it server-side
# (client_id only, no client_secret needed), JIT-provision, and set the session cookie.

@router.get("/google/config")
async def google_config():
    """GIS client config for the frontend."""
    return {"client_id": settings.google_client_id}


@router.post("/google")
async def google_token_login(request: Request, db: AsyncSession = Depends(get_db)):
    """Sign in with a Google ID token (GIS popup flow)."""
    if not settings.google_client_id or not GOOGLE_AUTH_AVAILABLE:
        raise HTTPException(status_code=400, detail="Google authentication is not configured")

    try:
        body = await request.json()
    except Exception:
        body = {}
    credential = (body or {}).get("credential")
    if not credential:
        raise HTTPException(status_code=400, detail="Google credential is required")

    try:
        info = google_id_token.verify_oauth2_token(
            credential, GoogleRequest(), audience=settings.google_client_id
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Google authentication failed")

    sub = info.get("sub", "")
    email = info.get("email", "")
    if not sub or not email:
        raise HTTPException(status_code=401, detail="Google authentication failed")

    display_name = info.get("name") or email.split("@")[0]

    user = await get_user_by_google_sub(db, sub)
    is_new = user is None
    if is_new:
        user = await create_user(db, sub, email, display_name, info.get("picture"))
    else:
        await update_last_login(db, user, display_name, info.get("picture"))

    await log_audit(db, request, str(user.id), user.email, "GOOGLE_LOGIN", status="SUCCESS")

    token = create_token(str(user.id), user.email)
    response = JSONResponse(
        {"user": {"name": user.display_name, "email": user.email, "role": user.role}}
    )
    _set_jwt_cookie(response, token)
    return response
