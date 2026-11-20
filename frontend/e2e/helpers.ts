import type { Page } from "@playwright/test";

/** PDF 1 halaman valid, dibangun dengan offset xref yang benar (tanpa dependency). */
export function minimalPdf(text: string): Buffer {
  const content = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (out += `${String(o).padStart(10, "0")} 00000 n \n`));
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Login lewat dev-login (hanya aktif di backend e2e) lalu tunggu dashboard. */
export async function loginAs(page: Page, email: string, role: "user" | "auditor" | "admin") {
  await page.goto(`/api/auth/dev/login?email=${encodeURIComponent(email)}&role=${role}`);
  await page.waitForURL("**/dashboard");
}
