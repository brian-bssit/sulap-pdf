import json
import re

import pytest
from fastapi import HTTPException

from pdf.dl_headers import attachment_filename
from pdf.rearrange import MAX_OPS, _validate_ops


def _raises(raw: str, fragment: str) -> HTTPException:
    with pytest.raises(HTTPException) as ei:
        _validate_ops(raw)
    assert fragment in str(ei.value.detail)
    return ei.value


def test_validate_ops_accepts_valid_moves():
    ops = _validate_ops(json.dumps([
        {"action": "reorder", "order": [2, 0, 1]},
        {"action": "rotate", "page": 1, "angle": 90},
        {"action": "delete", "page": 0},
        {"action": "move", "page": 1, "to": 0},
    ]))
    assert [o["action"] for o in ops] == ["reorder", "rotate", "delete", "move"]


def test_validate_ops_rejects_non_json():
    _raises("bukan json{", "tidak valid")


def test_validate_ops_rejects_non_list():
    _raises('{"action":"rotate"}', "array")


def test_validate_ops_rejects_unknown_action():
    _raises('[{"action":"explode"}]', "Aksi tidak dikenal")


def test_validate_ops_rejects_bool_page():
    # bool adalah subclass int di Python — jangan lolos sebagai index.
    _raises('[{"action":"rotate","page":true,"angle":90}]', "harus integer")


def test_validate_ops_rejects_bad_angle():
    _raises('[{"action":"rotate","page":0,"angle":37}]', "kelipatan 90")


def test_validate_ops_rejects_non_int_in_order():
    _raises('[{"action":"reorder","order":[0,"a"]}]', "array integer")


def test_validate_ops_caps_count():
    ops = [{"action": "delete", "page": 0}] * (MAX_OPS + 1)
    _raises(json.dumps(ops), "Maksimal")


def test_attachment_filename_ascii_clean():
    cd = attachment_filename("laporan_akhir.pdf")
    assert 'filename="laporan_akhir.pdf"' in cd


def test_attachment_filename_strips_injection():
    # quote/backslash/CR/LF jangan lolos ke fallback ASCII (header injection).
    cd = attachment_filename('x"\\\r\n.pdf')
    assert "\r" not in cd and "\n" not in cd
    m = re.search(r'filename="([^"]*)"', cd)
    assert m and m.group(1) == "x.pdf"  # disanitasi, ekstensi utuh


def test_attachment_filename_encodes_non_ascii():
    cd = attachment_filename("faktur €.pdf")
    # fallback ASCII + filename* RFC5987 untuk nama asli
    assert 'filename="faktur ?.pdf"' in cd
    assert "filename*=UTF-8''faktur%20%E2%82%AC.pdf" in cd
