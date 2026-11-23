"""Bandingkan dua PDF (D2)."""

import io
import json

import pytest
from pypdf import PdfReader, PdfWriter

from pdf.compare import diff_page
from tests.integration.test_tools import last_audit
from tools import make_fixtures as mk


def text_pdf(*page_texts: str) -> bytes:
    import pikepdf
    from pikepdf import Dictionary, Name, Stream
    pdf = pikepdf.new()
    font = pdf.make_indirect(Dictionary(Type=Name.Font, Subtype=Name.Type1, BaseFont=Name.Helvetica))
    for t in page_texts:
        page = pdf.add_blank_page(page_size=(595, 842))
        page.Resources = Dictionary(Font=Dictionary(F1=font))
        page.Contents = Stream(pdf, f"BT /F1 12 Tf 50 700 Td ({t}) Tj ET".encode())
    buf = io.BytesIO()
    pdf.save(buf)
    return buf.getvalue()


def cmp(client, a, b):
    return client.post("/api/pdf/compare", files={"file_a": ("a.pdf", a), "file_b": ("b.pdf", b)})


def test_diff_page_unit():
    assert diff_page("a b c".split(), "a b c".split()) == [{"t": "eq", "text": "a b c"}]
    assert diff_page("a b c".split(), "a x c".split()) == [
        {"t": "eq", "text": "a"}, {"t": "del", "text": "b"}, {"t": "add", "text": "x"}, {"t": "eq", "text": "c"}]
    assert diff_page([], "x y".split()) == [{"t": "add", "text": "x y"}]
    assert diff_page("x y".split(), []) == [{"t": "del", "text": "x y"}]
    assert diff_page([], []) == []


def test_compare_changes_and_summary(client, audit_rows):
    r = cmp(client, text_pdf("Saldo akhir 100 juta rupiah", "Sama persis"), text_pdf("Saldo akhir 250 juta rupiah", "Sama persis", "Halaman baru"))
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/json")
    d = json.loads(r.content)
    assert d["summary"] == {"pages_a": 2, "pages_b": 3, "added": 3, "removed": 1, "changed_pages": 2}
    p1 = d["pages"][0]
    assert {"t": "del", "text": "100"} in p1["ops"] and {"t": "add", "text": "250"} in p1["ops"]
    assert (p1["added"], p1["removed"]) == (1, 1)
    assert d["pages"][1]["added"] == d["pages"][1]["removed"] == 0
    assert d["pages"][2]["ops"] == [{"t": "add", "text": "Halaman baru"}]
    a = last_audit(audit_rows)
    assert (a["action"], a["status"], a["source_files"]) == ("COMPARE", "SUCCESS", ["a.pdf", "b.pdf"])


def test_compare_identical_no_changes(client):
    pdf = text_pdf("Halo dunia")
    d = json.loads(cmp(client, pdf, pdf).content)
    assert d["summary"]["changed_pages"] == 0 and d["summary"]["added"] == d["summary"]["removed"] == 0


def test_compare_bad_inputs(client, pdf_corrupt, pdf_encrypted, pdf_normal):
    assert cmp(client, pdf_corrupt, pdf_normal).status_code == 422
    assert cmp(client, pdf_normal, pdf_encrypted).status_code == 422
    assert cmp(client, pdf_normal, b"bukan pdf").status_code == 400
    assert client.post("/api/pdf/compare", files={"file_a": ("a.pdf", pdf_normal)}).status_code == 422  # file_b hilang


def test_compare_over_100_pages_400(client, pdf_normal):
    assert cmp(client, mk.pdf_many(101), pdf_normal).status_code == 400
