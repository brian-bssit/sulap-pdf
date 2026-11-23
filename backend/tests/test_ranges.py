import pytest
from fastapi import HTTPException

from pdf.ranges import parse_ranges


@pytest.mark.parametrize("spec,total,expected", [
    ("1", 3, [0]),
    ("1-3,5,8-", 10, [0, 1, 2, 4, 7, 8, 9]),
    ("2-3", 5, [1, 2]),
    ("5,1", 5, [4, 0]),            # urutan input dipertahankan
    ("1-3,2-4", 5, [0, 1, 2, 3]),  # tanpa duplikat
    (" 1-2 ", 2, [0, 1]),   # spasi diabaikan
    ("2-", 2, [1]),
])
def test_valid(spec, total, expected):
    assert parse_ranges(spec, total) == expected


@pytest.mark.parametrize("spec,total", [
    ("", 5), ("  ", 5), (",", 5), ("0", 5), ("6", 5), ("1-6", 5), ("3-1", 5),
    ("a", 5), ("-3", 5), ("1--2", 5), ("1-2-3", 5), ("8-", 5),
])
def test_invalid(spec, total):
    with pytest.raises(HTTPException) as e:
        parse_ranges(spec, total)
    assert e.value.status_code == 400
    assert "1-3,5,8-" in e.value.detail  # contoh format ikut di pesan
