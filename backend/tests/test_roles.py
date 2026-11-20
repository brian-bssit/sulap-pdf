"""Unit tests: akses auditor/admin tanpa DB (get_current_user di-patch)."""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from auth import dependencies as deps


def _patch_user(monkeypatch, role):
    async def fake(request, db):
        return SimpleNamespace(role=role)

    monkeypatch.setattr(deps, "get_current_user", fake)


@pytest.mark.parametrize("role,allowed", [("admin", True), ("auditor", True), ("user", False)])
def test_auditor_or_admin(monkeypatch, role, allowed):
    _patch_user(monkeypatch, role)
    call = deps.get_current_auditor_or_admin(None, None)
    if allowed:
        assert asyncio.run(call).role == role
    else:
        with pytest.raises(HTTPException) as e:
            asyncio.run(call)
        assert e.value.status_code == 403


@pytest.mark.parametrize("role", ["auditor", "user"])
def test_admin_only_rejects_auditor(monkeypatch, role):
    _patch_user(monkeypatch, role)
    with pytest.raises(HTTPException) as e:
        asyncio.run(deps.get_current_admin_user(None, None))
    assert e.value.status_code == 403
