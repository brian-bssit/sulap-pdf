"""Unit tests for pdf/convert.py soffice argv — no DB / auth / LO binary needed.

Regression gate: konversi DOCX/XLSX 422 di produksi disebabkan bentuk
`--env:UserInstallation` dua-strip + nilai sebagai token terpisah — keduanya
ditolak LibreOffice ("Error in option"). Bentuk sah = SATU token `-env:X=Y`.
Test ini mengunci kontrak itu agar tidak balik lagi.
"""

from pathlib import Path

from pdf.convert import _LIBREOFFICE_BIN, _build_convert_cmd


def test_env_token_single_dash_single_token():
    cmd = _build_convert_cmd(Path("/tmp/cpdf_abc123_lo"), Path("/tmp/cpdf_abc123_in.docx"))

    # Tidak boleh ada bentuk yang ditolak LO.
    assert "--env:UserInstallation" not in cmd
    # Bentuk sah: satu token `-env:UserInstallation=file://...` (strip tunggal, nilai menyatu).
    env_tokens = [a for a in cmd if a.startswith("-env:UserInstallation=")]
    assert len(env_tokens) == 1
    tok = env_tokens[0]
    assert tok.startswith("-env:UserInstallation=file:///tmp/cpdf_")
    assert tok.endswith("_lo")
    # Profil unik per job → tidak ada konflik lock profil bersama antar request paralel.
    assert tok.count("_lo") == 1


def test_cmd_order_headless_norestore_convert():
    cmd = _build_convert_cmd(Path("/tmp/cpdf_abc123_lo"), Path("/tmp/cpdf_abc123_in.xlsx"))
    assert cmd[:3] == [_LIBREOFFICE_BIN, "--headless", "--norestore"]
    assert "--convert-to" in cmd and cmd[cmd.index("--convert-to") + 1] == "pdf"
    assert cmd[cmd.index("--outdir") + 1] == "/tmp"  # parent dari input
    # Input = argumen terakhir; output naming LO = basename input → .pdf di outdir sama.
    assert cmd[-1] == "/tmp/cpdf_abc123_in.xlsx"
