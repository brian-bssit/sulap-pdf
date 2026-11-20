from fastapi import HTTPException

from config import settings


def check_identity(email: str, email_verified, hd: str | None = None) -> None:
    """Tolak identitas Google yang tak terverifikasi atau di luar domain korporat.
    401 = identitas tak bisa dipercaya; 403 = valid tapi bukan domain yang diizinkan."""
    if email_verified not in (True, "true"):
        raise HTTPException(status_code=401, detail="Google authentication failed")
    allowed = settings.allowed_domains
    if not allowed:
        return
    domain = email.rsplit("@", 1)[-1].lower()
    if domain not in allowed or (hd and hd.lower() not in allowed):
        raise HTTPException(status_code=403, detail="Akun tidak diizinkan. Gunakan email korporat.")
