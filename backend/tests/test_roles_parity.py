"""Daftar role frontend (lib/roles.ts) harus sama dengan backend (auth/roles.py)."""

import re
from pathlib import Path

from auth import roles

TS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "roles.ts"


def _ts_list(name: str) -> list[str]:
    m = re.search(rf"{name}[^=]*=\s*\[([^\]]*)\]", TS.read_text())
    assert m, name
    return re.findall(r'"([a-z_]+)"', m.group(1))


def test_all_roles_match():
    assert _ts_list("ROLES") == list(roles.ALL_ROLES)


def test_view_and_requestable_match():
    assert _ts_list("VIEW_ROLES") == list(roles.VIEW_ROLES)
    assert _ts_list("REQUESTABLE_ROLES") == list(roles.REQUESTABLE_BY_OFFICER)
