"""Uji beban SULAP PDF. HANYA untuk backend lokal/staging dengan DEV_LOGIN_ENABLED=true dan
RATE_LIMIT_PER_MIN=0 QUOTA_PER_DAY=0. JANGAN diarahkan ke produksi tanpa izin tertulis.

    python -m venv .venv && .venv/bin/pip install -r loadtest/requirements.txt
    .venv/bin/locust -f loadtest/locustfile.py --headless -u 5 -r 1 -t 60s \
        --host http://localhost:8080 --csv /tmp/sulap-load
"""
import json
import uuid

from locust import HttpUser, between, task


def minimal_pdf(pages: int = 1, label: str = "Beban") -> bytes:
    """PDF valid n halaman tanpa dependency (xref dihitung)."""
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", None, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for n in range(1, pages + 1):
        page_id, content_id = 3 + 2 * (n - 1) + 1, 3 + 2 * (n - 1) + 2
        content = f"BT /F1 18 Tf 20 100 Td ({label} {n}) Tj ET"
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents {content_id} 0 R /Resources << /Font << /F1 3 0 R >> >> >>")
        objs.append(f"<< /Length {len(content)} >>\nstream\n{content}\nendstream")
        kids.append(f"{page_id} 0 R")
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {pages} >>"
    out, offsets = "%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{o}\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offsets)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    return out.encode("latin-1")


SMALL = minimal_pdf(1)
THREE = minimal_pdf(3)
BIG = minimal_pdf(100)


class Karyawan(HttpUser):
    wait_time = between(0.5, 2)

    def on_start(self):
        r = self.client.get(
            f"/api/auth/dev/login?email=load-{uuid.uuid4().hex[:8]}@banksampoerna.com&role=user",
            allow_redirects=False, name="dev-login",
        )
        assert r.status_code in (302, 307), f"dev-login gagal: {r.status_code} (DEV_LOGIN_ENABLED?)"

    @task(4)
    def compress(self):
        self.client.post("/api/pdf/compress", files={"file": ("a.pdf", SMALL, "application/pdf")}, name="compress")

    @task(2)
    def merge(self):
        self.client.post(
            "/api/pdf/merge",
            files=[("files", ("a.pdf", SMALL, "application/pdf")), ("files", ("b.pdf", THREE, "application/pdf"))],
            name="merge",
        )

    @task(2)
    def rearrange_100_pages(self):
        ops = json.dumps([{"action": "reorder", "order": list(range(99, -1, -1))}])
        self.client.post("/api/pdf/rearrange", files={"file": ("a.pdf", BIG, "application/pdf")}, data={"operations": ops}, name="rearrange(100 hlm)")

    @task(2)
    def remove_pages(self):
        self.client.post("/api/pdf/remove-pages", files={"file": ("a.pdf", THREE, "application/pdf")}, data={"pages_to_remove": "[0]"}, name="remove-pages")

    @task(1)
    def convert_txt(self):
        self.client.post("/api/pdf/convert", files={"file": ("a.txt", b"uji beban sulap", "text/plain")}, name="convert(LibreOffice)")
