"""Parser rentang halaman 1-based (`1-3,5,8-`) → indeks 0-based."""

import re

from fastapi import HTTPException

_PART = re.compile(r"^(\d+)(?:(-)(\d*))?$")
_HINT = "Format rentang: 1-3,5,8- (nomor halaman dimulai dari 1)"


def parse_ranges(spec: str, total: int) -> list[int]:
    """Urutan sesuai input, tanpa duplikat. Kosong / di luar 1..total / awal>akhir → 400."""
    parts = [p.strip() for p in (spec or "").replace(" ", "").split(",") if p.strip()]
    if not parts:
        raise HTTPException(status_code=400, detail=f"Rentang halaman kosong. {_HINT}")
    out: list[int] = []
    seen: set[int] = set()
    for part in parts:
        m = _PART.match(part)
        if not m:
            raise HTTPException(status_code=400, detail=f"Rentang tidak valid: '{part}'. {_HINT}")
        start = int(m.group(1))
        end = (int(m.group(3)) if m.group(3) else total) if m.group(2) else start
        if start < 1 or end < start or end > total:
            raise HTTPException(
                status_code=400, detail=f"Rentang '{part}' di luar batas (dokumen {total} halaman). {_HINT}"
            )
        for n in range(start - 1, end):
            if n not in seen:
                seen.add(n)
                out.append(n)
    return out
