from pathlib import Path


def resolve_inside(root: Path, rel: str) -> Path | None:
    """Gabungkan `rel` ke `root` dan kembalikan HANYA bila hasil resolusi (termasuk symlink, `..`,
    path absolut, byte NUL) tetap di dalam `root`. Selain itu None → pemanggil menjawab 404."""
    if "\x00" in rel:
        return None
    try:
        base = root.resolve()
        target = (base / rel).resolve()
    except (OSError, RuntimeError, ValueError):
        return None
    return target if target == base or base in target.parents else None
