"""Content-Disposition filename — aman & non-ASCII.

Header HTTP wajib latin-1: nama file mentah berkarakter non-latin (>U+00FF)
membuat Starlette error 500 SETELAH PDF diproses. Sekaligus guard header
injection: quote / backslash / CR / LF di-buang dari fallback ASCII.
"""
from urllib.parse import quote


def attachment_filename(fname: str) -> str:
    """fname = nama lengkap (mis. 'laporan akhir_edited.pdf')."""
    ascii_fb = fname.encode("ascii", errors="replace").decode("ascii")
    safe = "".join(c for c in ascii_fb if 32 <= ord(c) < 127 and c not in '"\\') or "file.pdf"
    return f'attachment; filename="{safe}"; filename*=UTF-8\'\'{quote(fname)}'
