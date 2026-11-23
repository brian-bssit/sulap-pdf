"""Path traversal pada penyajian berkas statis + dokumentasi API tidak terbuka di production."""

import os

import pytest
from fastapi.testclient import TestClient

import main
from static_files import resolve_inside


@pytest.fixture
def site(tmp_path, monkeypatch):
    static = tmp_path / "site" / "static"
    static.mkdir(parents=True)
    (static / "index.html").write_text("<html>index</html>")
    (static / "dashboard.html").write_text("<html>dash</html>")
    (static / "app.js").write_text("console.log(1)")
    (static / "sub").mkdir()
    (static / "sub" / "index.html").write_text("<html>sub</html>")
    (tmp_path / "site" / "secret.txt").write_text("RAHASIA")          # sibling static/
    (tmp_path / "rahasia-di-luar.txt").write_text("RAHASIA-LUAR")
    os.symlink(tmp_path / "rahasia-di-luar.txt", static / "link.txt")  # symlink keluar
    monkeypatch.setattr(main, "static_dir", static)
    return TestClient(main.app)


@pytest.mark.parametrize("path", [
    "/..%2fsecret.txt", "/%2e%2e/secret.txt", "/..%2f..%2frahasia-di-luar.txt", "/sub/..%2f..%2fsecret.txt",
    "/....//secret.txt", "/%2e%2e%2fsecret.txt", "/link.txt", "/..%5csecret.txt", "/%252e%252e/secret.txt",
])
def test_traversal_variants_never_leak(site, path):
    r = site.get(path)
    assert "RAHASIA" not in r.text
    # varian yang tak keluar dari static/ jatuh ke SPA fallback (index) — tidak boleh 5xx
    assert r.status_code in (200, 404)
    if r.status_code == 200:
        assert r.text == "<html>index</html>"


def test_absolute_path_blocked(site):
    r = site.get("//etc/hosts")
    assert "localhost" not in r.text


def test_normal_files_served(site):
    assert site.get("/app.js").text == "console.log(1)"
    assert site.get("/dashboard").text == "<html>dash</html>"      # .html fallback
    assert site.get("/sub").text == "<html>sub</html>"             # direktori → index
    assert site.get("/halaman-spa-apa-saja").text == "<html>index</html>"  # SPA fallback


def test_api_paths_not_swallowed(site):
    assert site.get("/api/tidak-ada").status_code == 404


def test_missing_static_dir_is_404(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "static_dir", tmp_path / "tidak-ada")
    assert TestClient(main.app).get("/").status_code == 404


@pytest.mark.parametrize("rel,ok", [("a.txt", True), ("sub/../a.txt", True), ("../a.txt", False), ("sub/../../a.txt", False), ("a\x00.txt", False)])
def test_resolve_inside(tmp_path, rel, ok):
    root = tmp_path / "root"
    root.mkdir()
    (root / "a.txt").write_text("x")
    assert (resolve_inside(root, rel) is not None) == ok


def test_docs_disabled_in_production(monkeypatch, tmp_path):
    import importlib

    from config import settings

    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "secret_key", "k" * 64)
    reloaded = importlib.reload(main)
    try:
        reloaded.static_dir = tmp_path / "tanpa-static"   # jangan bergantung pada backend/static yang mungkin ada
        c = TestClient(reloaded.app)
        for p in ("/docs", "/redoc", "/openapi.json"):
            assert c.get(p).status_code == 404, p
    finally:
        monkeypatch.undo()
        importlib.reload(main)


def test_docs_available_in_development():
    c = TestClient(main.app)
    assert c.get("/openapi.json").status_code == 200
