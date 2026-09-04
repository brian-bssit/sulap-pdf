#!/usr/bin/env python3
"""Generate CycloneDX SBOM (python) + THIRD_PARTY_NOTICES untuk dependency backend.

Resolusi closure = hasil `pip install -r requirements.txt` (--ignore-installed
--report) — sama seperti yang dipasang Dockerfile saat image build. Versi/license
dibaca dari distribusi yg terinstall (importlib.metadata) — bukan dari index.

Pemakaian (WAJIB dari venv backend, supaya metadata yg dibaca cocok):
    backend/.venv/bin/python backend/tools/gen_sbom.py
    # menulis docs/sbom/python-cyclonedx.json
    #     + menyalin teks license ke THIRD_PARTY_NOTICES/python/
    #     + menulis THIRD_PARTY_NOTICES/python/index.json
"""
from __future__ import annotations

import importlib.metadata as im
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # pdf-super/
REQS = ROOT / "backend" / "requirements.txt"
SBOM_OUT = ROOT / "docs" / "sbom" / "python-cyclonedx.json"
NOTICES = ROOT / "THIRD_PARTY_NOTICES" / "python"

# Classifier -> SPDX (fallback utk dist lawas tanpa License-Expression).
_CLASSIFIER_SPDX = {
    "Apache Software License": "Apache-2.0",
    "BSD License": "BSD-3-Clause",
    "MIT License": "MIT",
    "Mozilla Public License 2.0 (MPL 2.0)": "MPL-2.0",
    "OSI Approved :: Apache Software License": "Apache-2.0",
    "OSI Approved :: BSD License": "BSD-3-Clause",
    "OSI Approved :: MIT License": "MIT",
    "OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)": "MPL-2.0",
    "Python Software Foundation License": "PSF-2.0",
    "OSI Approved :: Python Software Foundation License": "PSF-2.0",
}


def closure_names() -> set[str]:
    """Resolusi dependency yg akan di-install oleh `-r requirements.txt`."""
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        report = f.name
    cmd = [
        sys.executable, "-m", "pip", "install", "--dry-run",
        "--ignore-installed", "--report", report, "-r", str(REQS),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    try:
        data = json.loads(Path(report).read_text())
    finally:
        Path(report).unlink(missing_ok=True)
    return {i["metadata"]["name"].lower().replace("_", "-") for i in data.get("install", [])}


def _spdx_from_classifier(m: im.PackageMetadata) -> str | None:
    for c in m.get_all("Classifier") or []:
        if c.startswith("License ::"):
            tail = c.split("::", 1)[1].strip()
            if tail.startswith("OSI Approved :: "):
                tail = tail.split("::", 1)[1].strip()
            if tail in _CLASSIFIER_SPDX:
                return _CLASSIFIER_SPDX[tail]
            return tail
    return None


def collect() -> list[dict]:
    names = closure_names()
    out = []
    for dist in im.distributions():
        nm = dist.metadata.get("Name", "").lower().replace("_", "-")
        if nm not in names:
            continue
        md = dist.metadata
        lic = md.get("License-Expression") or _spdx_from_classifier(md)
        if not lic:
            lic = md.get("License")
        if lic and lic.upper() in ("UNKNOWN", "NONE"):
            lic = None
        # Project-URL: "Homepage, https://..." -> ambil URL.
        url = None
        for pu in md.get_all("Project-URL") or []:
            if pu.split(",", 1)[0].strip().lower() == "homepage":
                url = pu.split(",", 1)[1].strip()
                break
        if not url and md.get("Home-page"):
            url = md.get("Home-page")
        author = (md.get("Author") or md.get("Author-email") or "").strip()
        out.append({
            "name": dist.metadata["Name"], "version": dist.version,
            "license": lic, "url": url, "author": author, "dist": dist,
        })
    out.sort(key=lambda d: d["name"].lower())
    return out


def sbom_json(rows: list[dict]) -> dict:
    comps = []
    for i, r in enumerate(rows):
        lic_obj = {"license": {"id": r["license"]}} if r["license"] else {}
        comp = {
            "type": "library",
            "bom-ref": f"pkg:pypi/{r['name'].lower()}@{r['version']}",
            "name": r["name"],
            "version": r["version"],
            "purl": f"pkg:pypi/{r['name'].lower()}@{r['version']}",
        }
        if r["author"]:
            comp["author"] = r["author"]
        if r["url"]:
            comp["externalReferences"] = [{"type": "website", "url": r["url"]}]
        if lic_obj:
            comp["licenses"] = [lic_obj]
        comps.append(comp)
    return {
        "bomFormat": "CycloneDX", "specVersion": "1.5",
        "serialNumber": "urn:uuid:5bf0b000-0000-4000-8000-000000000001",
        "version": 1,
        "metadata": {
            "timestamp": "2026-09-04T00:00:00Z",
            "tools": [{"name": "backend/tools/gen_sbom.py", "version": "1.0"}],
            "component": {
                "type": "application", "name": "sulap-pdf-backend",
                "version": "0.1.0", "bom-ref": "sulap-pdf-backend",
            },
        },
        "components": comps,
    }


_LIC_FILES = ("LICENSE", "LICENSE.txt", "LICENSE.md", "COPYING", "NOTICE",
              "LICENSE-APACHE", "LICENSE-MIT", "COPYRIGHT")


def copy_licenses(rows: list[dict]) -> None:
    """Salin teks license utk tiap komponen ke THIRD_PARTY_NOTICES/python/."""
    NOTICES.mkdir(parents=True, exist_ok=True)
    for r in rows:
        d = r["dist"]
        copied = []
        # PEP 639: dist-info/licenses/* ; lalu file akar dist-info.
        base = Path(d._path)  # noqa: SLF001
        lic_dir = base / "licenses"
        if lic_dir.is_dir():
            for f in sorted(lic_dir.iterdir()):
                if f.is_file():
                    shutil.copy2(f, NOTICES / f"{r['name']}-{f.name}")
                    copied.append(f.name)
        for name in _LIC_FILES:
            src = base / name
            if src.is_file():
                dst = NOTICES / f"{r['name']}-{name}"
                if not dst.exists():
                    shutil.copy2(src, dst)
                copied.append(name)
        if not copied:
            # Tulis placeholder berisi license expression saja.
            (NOTICES / f"{r['name']}-LICENSE.txt").write_text(
                f"License: {r['license'] or 'UNKNOWN'}\nNo license file "
                f"ditemukan di distribusi.\n"
            )
    # index.json (metadata ringkas; teks lengkap = file License-<nama>-*.txt).
    idx = [{
        "name": r["name"], "version": r["version"], "license": r["license"],
        "source": r["url"], "modifications": "none",
    } for r in rows]
    (NOTICES / "index.json").write_text(json.dumps(idx, indent=2) + "\n")


def main() -> int:
    rows = collect()
    if not rows:
        print("Tidak ada komponen — jalankan dari venv backend (backend/.venv/bin/python).",
              file=sys.stderr)
        return 1
    SBOM_OUT.parent.mkdir(parents=True, exist_ok=True)
    SBOM_OUT.write_text(json.dumps(sbom_json(rows), indent=2) + "\n")
    copy_licenses(rows)
    print(f"OK: {SBOM_OUT} ({len(rows)} komponen)")
    print(f"OK: license text -> {NOTICES}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
