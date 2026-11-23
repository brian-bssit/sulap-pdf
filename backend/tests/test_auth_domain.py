"""Unit tests: batas domain login, config fail-fast, token JWT. Tanpa DB/jaringan."""

import time

import jwt as pyjwt
import pytest
from fastapi import HTTPException

from auth import domain
from auth.jwt import create_token, decode_token
from config import DEFAULT_SECRET_KEY, Settings, settings


@pytest.fixture
def corp(monkeypatch):
    monkeypatch.setattr(settings, "allowed_email_domains", "banksampoerna.com")


def test_domain_ok(corp):
    domain.check_identity("a@banksampoerna.com", True, "banksampoerna.com")
    domain.check_identity("A@BankSampoerna.com", True, None)


def test_domain_wrong_is_403(corp):
    with pytest.raises(HTTPException) as e:
        domain.check_identity("a@gmail.com", True, None)
    assert e.value.status_code == 403


def test_hd_mismatch_is_403(corp):
    with pytest.raises(HTTPException) as e:
        domain.check_identity("a@banksampoerna.com", True, "evil.com")
    assert e.value.status_code == 403


def test_suffix_trick_is_403(corp):
    with pytest.raises(HTTPException) as e:
        domain.check_identity("a@evilbanksampoerna.com", True, None)
    assert e.value.status_code == 403


@pytest.mark.parametrize("verified", [False, None, "false"])
def test_unverified_is_401(corp, verified):
    with pytest.raises(HTTPException) as e:
        domain.check_identity("a@banksampoerna.com", verified, None)
    assert e.value.status_code == 401


def test_empty_allowlist_dev_passes(monkeypatch):
    monkeypatch.setattr(settings, "allowed_email_domains", "")
    domain.check_identity("a@gmail.com", True, None)


def test_production_requires_allowlist():
    with pytest.raises(ValueError, match="ALLOWED_EMAIL_DOMAINS"):
        Settings(_env_file=None, environment="production", secret_key="x" * 64, allowed_email_domains="")
    Settings(_env_file=None, environment="production", secret_key="x" * 64, allowed_email_domains="banksampoerna.com")


def test_token_roundtrip_and_expiry(monkeypatch):
    t = create_token("uid-1", "a@b.c")
    assert decode_token(t)["user_id"] == "uid-1"
    assert decode_token("garbage") is None
    expired = pyjwt.encode({"user_id": "u", "exp": int(time.time()) - 5}, settings.secret_key, algorithm="HS256")
    assert decode_token(expired) is None


def test_legacy_jose_style_token_still_valid():
    # Token lama (python-jose, HS256, klaim user_id/email/exp int) harus tetap diterima.
    legacy = pyjwt.encode(
        {"user_id": "u", "email": "a@b.c", "exp": int(time.time()) + 60},
        settings.secret_key,
        algorithm="HS256",
    )
    assert decode_token(legacy)["email"] == "a@b.c"


def test_default_secret_constant_unchanged():
    assert DEFAULT_SECRET_KEY.startswith("change-me")
