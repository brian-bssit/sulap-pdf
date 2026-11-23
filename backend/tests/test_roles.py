"""Akses berbasis peran tanpa DB (get_current_user di-patch)."""

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from auth import dependencies as deps
from auth import roles


def _patch_user(monkeypatch, role):
    async def fake(request, db):
        return SimpleNamespace(role=role)

    monkeypatch.setattr(deps, "get_current_user", fake)


def _call(dep, monkeypatch, role):
    _patch_user(monkeypatch, role)
    return asyncio.run(dep(None, None))


def _allowed(dep, monkeypatch, role) -> bool:
    try:
        _call(dep, monkeypatch, role)
        return True
    except HTTPException as e:
        assert e.status_code == 403
        return False


@pytest.mark.parametrize("role,expected", [
    (roles.USER, False), (roles.AUDITOR, True), (roles.DCA_OFFICER, True), (roles.DCA_SUPERVISOR, True), (roles.SUPER_ADMIN, True),
])
def test_viewer(monkeypatch, role, expected):
    assert _allowed(deps.get_admin_viewer, monkeypatch, role) is expected


@pytest.mark.parametrize("role", roles.ALL_ROLES)
def test_super_admin_only(monkeypatch, role):
    assert _allowed(deps.get_super_admin, monkeypatch, role) is (role == roles.SUPER_ADMIN)


@pytest.mark.parametrize("role", roles.ALL_ROLES)
def test_only_officer_requests(monkeypatch, role):
    assert _allowed(deps.get_role_requester, monkeypatch, role) is (role == roles.DCA_OFFICER)


@pytest.mark.parametrize("role", roles.ALL_ROLES)
def test_approvers(monkeypatch, role):
    assert _allowed(deps.get_role_approver, monkeypatch, role) is (role in (roles.DCA_SUPERVISOR, roles.SUPER_ADMIN))


def test_role_constants_fit_column():
    assert all(len(r) <= 20 for r in roles.ALL_ROLES)  # users.role VARCHAR(20)
    assert set(roles.ADMIN_ROLES) <= set(roles.ALL_ROLES) and set(roles.VIEW_ROLES) <= set(roles.ALL_ROLES)
