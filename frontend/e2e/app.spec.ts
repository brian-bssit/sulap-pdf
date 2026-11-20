import { expect, test } from "@playwright/test";
import { loginAs, minimalPdf } from "./helpers";

test("halaman login tampil dan tak ada akses dashboard tanpa sesi", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SULAP PDF" })).toBeVisible();
  const me = await page.request.get("/api/auth/me");
  expect(me.status()).toBe(401);
});

test("user biasa: dashboard tanpa Admin Panel", async ({ page }) => {
  await loginAs(page, "e2e-user@banksampoerna.com", "user");
  await expect(page.getByText("Compress PDF").first()).toBeVisible();
  await expect(page.getByText("Admin Panel")).toHaveCount(0);
});

test("compress: unggah PDF → hasil terunduh dan valid", async ({ page }) => {
  await loginAs(page, "e2e-user@banksampoerna.com", "user");
  await page.setInputFiles("#compress-file-input", { name: "contoh.pdf", mimeType: "application/pdf", buffer: minimalPdf("Halo Compress") });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Kompres & Download/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("compressed_contoh.pdf");
  await expect(page.getByText("Berhasil dikompresi!")).toBeVisible();
  const { readFileSync } = await import("node:fs");
  expect(readFileSync((await download.path())!).subarray(0, 4).toString()).toBe("%PDF");
});

test("merge: dua PDF → satu hasil terunduh", async ({ page }) => {
  await loginAs(page, "e2e-user@banksampoerna.com", "user");
  await page.getByRole("button", { name: "Merge PDF" }).click();
  await page.setInputFiles("#merge-file-input", [
    { name: "a.pdf", mimeType: "application/pdf", buffer: minimalPdf("A") },
    { name: "b.pdf", mimeType: "application/pdf", buffer: minimalPdf("B") },
  ]);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Gabungkan & Download/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("merged.pdf");
});

test("compress: file bukan PDF ditolak dengan pesan error", async ({ page }) => {
  await loginAs(page, "e2e-user@banksampoerna.com", "user");
  await page.setInputFiles("#compress-file-input", { name: "palsu.pdf", mimeType: "application/pdf", buffer: Buffer.from("bukan pdf") });
  await page.getByRole("button", { name: /Kompres & Download/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Hanya PDF" })).toBeVisible();
});

test("admin: bisa ubah role lewat dropdown; auditor hanya baca", async ({ page }) => {
  await loginAs(page, "e2e-admin@banksampoerna.com", "admin");
  await page.getByText("Admin Panel").click();
  await expect(page.getByLabel("Role untuk e2e-admin@banksampoerna.com")).toBeVisible();

  await loginAs(page, "e2e-auditor@banksampoerna.com", "auditor");
  await page.getByText("Admin Panel").click();
  await expect(page.getByText("Daftar user (hanya baca).")).toBeVisible();
  await expect(page.locator("select")).toHaveCount(0);
  // tab audit terbuka untuk auditor: tabel termuat (bukan 403), memuat login e2e sebelumnya
  await page.getByRole("button", { name: /Audit Logs/ }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("e2e-admin@banksampoerna.com").first()).toBeVisible();
});
