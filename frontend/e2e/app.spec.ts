import { expect, test } from "@playwright/test";
import { t } from "../src/lib/strings";
import { loginAs, minimalPdf } from "./helpers";

test("halaman login tampil dan tak ada akses dashboard tanpa sesi", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SULAP PDF" })).toBeVisible();
  const me = await page.request.get("/api/auth/me");
  expect(me.status()).toBe(401);
});

test("user biasa: dashboard tanpa Admin Panel", async ({ page }) => {
  await loginAs(page, "e2e-user@banksampoerna.com", "user");
  await expect(page.getByText(t.nav.compress).first()).toBeVisible();
  await expect(page.getByText(t.nav.admin)).toHaveCount(0);
});

test("compress: unggah PDF → pratinjau tampil → hasil baru terunduh saat tombol Unduh ditekan", async ({ page }) => {
  await loginAs(page, "e2e-user@banksampoerna.com", "user");
  await page.setInputFiles("#compress-file-input", { name: "contoh.pdf", mimeType: "application/pdf", buffer: minimalPdf("Halo Compress") });
  await page.getByRole("button", { name: t.compress.action, exact: true }).click();
  // PDF 1 halaman kecil tak bisa diperkecil secara lossless → "Sudah optimal", file asli dikembalikan
  await expect(page.getByText(t.compress.unchangedTitle)).toBeVisible();
  await expect(page.getByRole("img", { name: t.result.preview })).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: t.result.download }).click()]);
  expect(download.suggestedFilename()).toBe("compressed_contoh.pdf");
  const { readFileSync } = await import("node:fs");
  expect(readFileSync((await download.path())!).subarray(0, 4).toString()).toBe("%PDF");
});

test("compress: tingkat kompresi terkirim ke server", async ({ page }) => {
  await page.addInitScript(() => {
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      if (body instanceof FormData && body.has("level")) (window as unknown as { __level: string }).__level = String(body.get("level"));
      return send.call(this, body as XMLHttpRequestBodyInit);
    };
  });
  await loginAs(page, "e2e-user@banksampoerna.com", "user");
  await page.setInputFiles("#compress-file-input", { name: "a.pdf", mimeType: "application/pdf", buffer: minimalPdf("A") });
  await expect(page.getByRole("radio", { name: new RegExp(t.compress.levels.high.label) })).toBeChecked(); // default = perilaku lama
  await page.getByRole("radio", { name: new RegExp(t.compress.levels.low.label) }).check();
  await page.getByRole("button", { name: t.compress.action, exact: true }).click();
  await expect(page.getByText(t.result.download)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __level: string }).__level)).toBe("low");
});

test("merge: dua PDF → satu hasil terunduh", async ({ page }) => {
  await loginAs(page, "e2e-user@banksampoerna.com", "user");
  await page.getByRole("button", { name: t.nav.merge }).click();
  await page.setInputFiles("#merge-file-input", [
    { name: "a.pdf", mimeType: "application/pdf", buffer: minimalPdf("A") },
    { name: "b.pdf", mimeType: "application/pdf", buffer: minimalPdf("B") },
  ]);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await page.getByRole("button", { name: t.merge.action, exact: true }).click();
      await page.getByRole("button", { name: t.result.download }).click();
    })(),
  ]);
  expect(download.suggestedFilename()).toBe("merged.pdf");
});

test("compress: file bukan PDF ditolak dengan pesan error", async ({ page }) => {
  await loginAs(page, "e2e-user@banksampoerna.com", "user");
  await page.setInputFiles("#compress-file-input", { name: "palsu.pdf", mimeType: "application/pdf", buffer: Buffer.from("bukan pdf") });
  await page.getByRole("button", { name: t.compress.action, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Hanya PDF" })).toBeVisible();
});

test("admin: bisa ubah role lewat dropdown; auditor hanya baca", async ({ page }) => {
  await loginAs(page, "e2e-admin@banksampoerna.com", "admin");
  await page.getByText(t.nav.admin).click();
  await expect(page.getByLabel("Role untuk e2e-admin@banksampoerna.com")).toBeVisible();

  await loginAs(page, "e2e-auditor@banksampoerna.com", "auditor");
  await page.getByText(t.nav.admin).click();
  await expect(page.getByText("Daftar user (hanya baca).")).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  // tab audit terbuka untuk auditor: tabel termuat (bukan 403), memuat login e2e sebelumnya
  await page.getByRole("button", { name: new RegExp(t.admin.audit) }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("e2e-admin@banksampoerna.com").first()).toBeVisible();
});

// ── Edit PDF: karakterisasi perilaku sebelum/sesudah refactor EditOverlayTool ──
/** Playwright tak bisa membaca body multipart ber-Blob; tangkap field `operations` dari FormData di XHR. */
async function captureOperations(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      if (body instanceof FormData && body.has("operations")) (window as unknown as { __ops: string }).__ops = String(body.get("operations"));
      return send.call(this, body as XMLHttpRequestBodyInit);
    };
  });
}
const sentOps = async (page: import("@playwright/test").Page) =>
  JSON.parse(await page.evaluate(() => (window as unknown as { __ops: string }).__ops));

async function openEdit(page: import("@playwright/test").Page) {
  await captureOperations(page);
  await page.setViewportSize({ width: 1280, height: 1000 }); // kanvas harus terlihat utk klik koordinat
  await loginAs(page, "e2e-user@banksampoerna.com", "user");
  await page.getByRole("button", { name: t.nav.edit }).click();
  await page.setInputFiles("#edit-file-input", { name: "surat.pdf", mimeType: "application/pdf", buffer: minimalPdf("Surat") });
  await expect(page.getByText(/1 halaman/)).toBeVisible();
  // tunggu render selesai: sebelum itu viewport belum ada dan klik pada kanvas diabaikan
  await expect.poll(async () => (await page.locator("canvas").boundingBox())?.width ?? 0).toBeGreaterThan(100);
}

test("edit: tambah teks lalu Apply mengirim operasi teks 1-based dan mengunduh", async ({ page }) => {
  await openEdit(page);
  await page.getByRole("button", { name: "Teks", exact: true }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + 200, box.y + 150);
  await expect(page.getByText(t.edit.activeOverlays)).toBeVisible();
  await expect(page.getByText(/“Teks”/)).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: t.edit.apply }).click()]);
  const ops = await sentOps(page);
  expect(ops).toHaveLength(1);
  expect(ops[0]).toMatchObject({ type: "text", page: 1, text: "Teks", font: "Helvetica", font_size: 24 });
  expect(ops[0].x).toBeGreaterThan(0);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  await expect(page.getByText(t.edit.done)).toBeVisible();
});

test("edit: gambar Block dengan drag lalu Apply mengirim rectangle berukuran > 0", async ({ page }) => {
  await openEdit(page);
  await page.getByRole("button", { name: "Block", exact: true }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 90, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText(/Hal 1/)).toBeVisible();

  await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: t.edit.apply }).click()]);
  const [op] = await sentOps(page);
  expect(op).toMatchObject({ type: "rectangle", page: 1, color: "#FFFFFF", opacity: 1 });
  expect(op.width).toBeGreaterThan(8);
  expect(op.height).toBeGreaterThan(8);
});

test("edit: hapus overlay dari daftar → tombol Apply nonaktif", async ({ page }) => {
  await openEdit(page);
  await page.getByRole("button", { name: "Teks", exact: true }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + 60, box.y + 60);
  await page.getByRole("button", { name: "Hapus teks nomor 1", exact: true }).click();
  await expect(page.getByRole("button", { name: t.edit.apply })).toBeDisabled();
});

test("edit: pindah halaman dan batas pratinjau", async ({ page }) => {
  await openEdit(page);
  await expect(page.getByLabel(t.edit.prevPage)).toBeDisabled();
  await expect(page.getByLabel(t.edit.nextPage)).toBeDisabled(); // dokumen 1 halaman
});

test("edit: seret teks memindahkan posisi (x bertambah) dan klik 2× mengubah teks inline", async ({ page }) => {
  await openEdit(page);
  await page.getByRole("button", { name: "Teks", exact: true }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + 100, box.y + 120);
  const txt = page.getByTitle(t.edit.textTitle);
  const t0 = (await txt.boundingBox())!;
  await page.mouse.move(t0.x + t0.width / 2, t0.y + t0.height / 2);
  await page.mouse.down();
  await page.mouse.move(t0.x + t0.width / 2 + 80, t0.y + t0.height / 2 + 30, { steps: 6 });
  await page.mouse.up();
  const t1 = (await txt.boundingBox())!;
  expect(t1.x - t0.x).toBeGreaterThan(60);
  expect(t1.y - t0.y).toBeGreaterThan(20);

  await txt.dblclick();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Disetujui");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/“Disetujui”/)).toBeVisible();

  await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: t.edit.apply }).click()]);
  const [op] = await sentOps(page);
  expect(op).toMatchObject({ type: "text", text: "Disetujui" });
});

test("edit: tarik sudut Block memperbesar ukurannya", async ({ page }) => {
  await openEdit(page);
  await page.getByRole("button", { name: "Block", exact: true }).click();
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 110, { steps: 5 });
  await page.mouse.up();
  const rect = page.getByLabel("Block", { exact: true });
  const r0 = (await rect.boundingBox())!;
  // sudut kanan-bawah: tarik ke luar
  await page.mouse.move(r0.x + r0.width - 2, r0.y + r0.height - 2);
  await page.mouse.down();
  await page.mouse.move(r0.x + r0.width + 50, r0.y + r0.height + 40, { steps: 6 });
  await page.mouse.up();
  const r1 = (await rect.boundingBox())!;
  expect(r1.width - r0.width).toBeGreaterThan(30);
  expect(r1.height - r0.height).toBeGreaterThan(20);
});
