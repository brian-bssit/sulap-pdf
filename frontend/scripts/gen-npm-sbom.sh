#!/usr/bin/env bash
# Regenerate SBOM npm (CycloneDX) + THIRD_PARTY_NOTICES/npm dari installed tree.
# Pakai --omit=dev: artefak yang didistribusikan = static export, devDep tak ikut.
# Jalankan dari repo root:
#   frontend/scripts/gen-npm-sbom.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/frontend"

npm sbom --sbom-format=cyclonedx --omit=dev > "$ROOT/docs/sbom/npm-cyclonedx.json"

python3 - "$ROOT" <<'PY'
import json, re, shutil, sys
from pathlib import Path
root = Path(sys.argv[1]); NM = root/"frontend"/"node_modules"
sbom = json.load(open(root/"docs/sbom/npm-cyclonedx.json"))
out = root/"THIRD_PARTY_NOTICES"/"npm"
shutil.rmtree(out, ignore_errors=True); out.mkdir(parents=True)
clean = lambda n: re.sub(r"[^A-Za-z0-9_.-]", "_", n)
rows = []
for c in sbom["components"]:
    name = c["name"]
    meta = json.loads((NM/name/"package.json").read_text())
    lic = meta.get("license"); lic = lic.get("type") if isinstance(lic, dict) else lic
    copied = []
    for f in sorted((NM/name).iterdir()):
        if f.is_file() and re.fullmatch(r"(LICEN[CS]E|NOTICE|COPYING|PATENTS)(\..*)?", f.name, re.I):
            shutil.copy2(f, out/f"{clean(name)}-{f.name}"); copied.append(f.name)
    if not copied:
        # Note saja utk paket yg tak menyertakan LICENSE (teks via source).
        (out/f"{clean(name)}-LICENSE.txt").write_text(
            f"{name} {c['version']}\nLicense: {lic}\nFull text: {meta.get('homepage') or 'lih. registry npm'}\n"
            "(paket tidak menyertakan file LICENSE di distribusi npm.)\n")
        copied = ["LICENSE.txt (note)"]
    rows.append({"name": name, "version": c["version"], "license": lic,
                 "source": meta.get("homepage"), "license_files": copied, "modifications": "none"})
(out/"index.json").write_text(json.dumps(rows, indent=2)+"\n")
print(f"OK npm SBOM: {len(rows)} komponen -> docs/sbom/npm-cyclonedx.json + THIRD_PARTY_NOTICES/npm/")
PY
