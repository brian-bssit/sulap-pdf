"""Invarian peran admin: (≥1 DCA Officer ∧ ≥1 DCA Supervisor) ∨ ≥1 Super Admin — logika murni."""

import itertools

import pytest

from admin.role_service import counts_after, invariant_ok, touches_admin_roles
from auth import roles as R


def c(o=0, s=0, sa=0, u=5, a=0):
    return {R.DCA_OFFICER: o, R.DCA_SUPERVISOR: s, R.SUPER_ADMIN: sa, R.USER: u, R.AUDITOR: a}


@pytest.mark.parametrize("counts,ok", [
    (c(o=1, s=1), True), (c(sa=1), True), (c(o=3, s=2, sa=1), True),
    (c(o=1), False), (c(s=1), False), (c(), False), (c(o=5), False), (c(s=5), False),
    (c(o=0, s=0, sa=2), True),
])
def test_invariant_truth_table(counts, ok):
    assert invariant_ok(counts) is ok


def test_counts_after_moves_one_user():
    after = counts_after(c(o=1, s=1), R.DCA_OFFICER, R.USER)
    assert after[R.DCA_OFFICER] == 0 and after[R.USER] == 6


@pytest.mark.parametrize("start,frm,to,ok", [
    (c(o=1, s=1), R.DCA_OFFICER, R.USER, False),          # menghilangkan satu-satunya Officer
    (c(o=1, s=1), R.DCA_SUPERVISOR, R.AUDITOR, False),    # menghilangkan satu-satunya Supervisor
    (c(o=2, s=1), R.DCA_OFFICER, R.USER, True),           # masih ada Officer lain
    (c(o=1, s=1, sa=1), R.DCA_OFFICER, R.USER, True),     # Super Admin menutupi
    (c(sa=1), R.SUPER_ADMIN, R.USER, False),              # Super Admin terakhir
    (c(sa=2), R.SUPER_ADMIN, R.USER, True),
    (c(o=1, s=1), R.USER, R.SUPER_ADMIN, True),
    (c(), R.USER, R.SUPER_ADMIN, True),                   # sistem kosong → pemulihan lewat Super Admin diizinkan
    (c(o=1), R.USER, R.DCA_SUPERVISOR, True),             # melengkapi pasangan
    (c(o=1, s=1, sa=1), R.SUPER_ADMIN, R.DCA_OFFICER, True),
])
def test_transitions(start, frm, to, ok):
    assert invariant_ok(counts_after(start, frm, to)) is ok


@pytest.mark.parametrize("frm,to,touches", [
    (R.USER, R.AUDITOR, False), (R.AUDITOR, R.USER, False),
    (R.USER, R.DCA_OFFICER, True), (R.SUPER_ADMIN, R.USER, True), (R.DCA_SUPERVISOR, R.AUDITOR, True),
])
def test_only_admin_role_changes_are_checked(frm, to, touches):
    assert touches_admin_roles(frm, to) is touches


def test_exhaustive_small_systems_invariant_matches_definition():
    for o, s, sa in itertools.product(range(3), repeat=3):
        assert invariant_ok(c(o=o, s=s, sa=sa)) is ((o >= 1 and s >= 1) or sa >= 1)
