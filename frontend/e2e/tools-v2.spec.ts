import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { t } from "../src/lib/strings";
import { loginAs, minimalPdf } from "./helpers";

const pdf = (name: string, pages = 1) => ({ name, mimeType: "application/pdf", buffer: minimalPdf("Uji", pages) });

async function open(page: Page, label: string) {
  await loginAs(page, "e2e-v2@banksampoerna.com", "user");
  const toggle = page.getByRole("button", { name: t.nav.open });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("button", { name: label }).click();
}

async function download(page: Page, label: string = t.result.download) {
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: label }).click()]);
  return { name: d.suggestedFilename(), data: readFileSync((await d.path())!) };
}

test("split: ambil rentang → satu PDF", async ({ page }) => {
  await open(page, t.nav.split);
  await page.locator('input[type="file"]').setInputFiles(pdf("laporan.pdf", 5));
  await expect(page.getByRole("button", { name: t.split.action, exact: true })).toBeDisabled(); // rentang kosong
  await page.getByLabel(t.split.rangesLabel).fill("1-2,5");
  await page.getByRole("button", { name: t.split.action, exact: true }).click();
  await expect(page.getByText(t.split.doneTitle)).toBeVisible();
  const f = await download(page);
  expect(f.name).toBe("laporan_ekstrak.pdf");
  expect(f.data.subarray(0, 4).toString()).toBe("%PDF");
});

test("split: rentang salah → pesan server tampil", async ({ page }) => {
  await open(page, t.nav.split);
  await page.locator('input[type="file"]').setInputFiles(pdf("a.pdf", 2));
  await page.getByLabel(t.split.rangesLabel).fill("9");
  await page.getByRole("button", { name: t.split.action, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "di luar batas" })).toBeVisible();
});

test("split: per N halaman → ZIP", async ({ page }) => {
  await open(page, t.nav.split);
  await page.locator('input[type="file"]').setInputFiles(pdf("a.pdf", 5));
  await page.getByRole("radio", { name: new RegExp(t.split.everyN.label) }).check();
  await page.getByLabel(t.split.everyNLabel).fill("2");
  await page.getByRole("button", { name: t.split.action, exact: true }).click();
  await expect(page.getByText(t.split.doneTitle)).toBeVisible();
  const f = await download(page, t.result.downloadFile);
  expect(f.name).toBe("a_bagian.zip");
  expect(f.data.subarray(0, 2).toString()).toBe("PK");
});

test("kunci lalu buka: password salah ditolak, benar berhasil", async ({ page }) => {
  await open(page, t.nav.security);
  await page.locator('input[type="file"]').setInputFiles(pdf("a.pdf"));
  const action = page.getByRole("button", { name: t.lock.actionProtect, exact: true });
  await page.getByLabel(t.lock.passwordLabel, { exact: true }).fill("pendek");
  await expect(action).toBeDisabled(); // < 8 karakter
  await page.getByLabel(t.lock.passwordLabel, { exact: true }).fill("rahasia-e2e-123");
  await action.click();
  await expect(page.getByText(t.lock.protectedTitle)).toBeVisible();
  const locked = await download(page);
  expect(locked.name).toBe("protected_a.pdf");
  expect(locked.data.includes("/Encrypt")).toBe(true);

  await page.getByRole("button", { name: t.common.processAnother }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "locked.pdf", mimeType: "application/pdf", buffer: locked.data });
  await page.getByRole("radio", { name: new RegExp(t.lock.unlock.label) }).check();
  await page.getByLabel(t.lock.passwordLabel, { exact: true }).fill("salah-salah-1");
  await page.getByRole("button", { name: t.lock.actionUnlock, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Password salah" })).toBeVisible();
  await page.getByLabel(t.lock.passwordLabel, { exact: true }).fill("rahasia-e2e-123");
  await page.getByRole("button", { name: t.lock.actionUnlock, exact: true }).click();
  await expect(page.getByText(t.lock.unlockedTitle)).toBeVisible();
  const open_ = await download(page);
  expect(open_.data.includes("/Encrypt")).toBe(false);
});

test("watermark lalu nomor halaman", async ({ page }) => {
  await open(page, t.nav.watermark);
  await page.locator('input[type="file"]').setInputFiles(pdf("a.pdf", 2));
  const run = page.getByRole("button", { name: t.watermark.actionWatermark, exact: true });
  await expect(run).toBeDisabled();
  await page.getByLabel(t.watermark.textLabel).fill("RAHASIA");
  await run.click();
  await expect(page.getByText(t.watermark.doneTitle)).toBeVisible();
  await expect(page.getByRole("img", { name: t.result.preview })).toBeVisible(); // pdf.js merender hasil
  await expect(page.getByText(t.result.previewUnavailable)).toHaveCount(0);
  expect((await download(page)).name).toBe("watermark_a.pdf");

  await page.getByRole("button", { name: t.common.processAnother }).click();
  await page.locator('input[type="file"]').setInputFiles(pdf("b.pdf", 2));
  await page.getByRole("radio", { name: new RegExp(t.watermark.numbers.label) }).check();
  await page.getByLabel(t.watermark.formatLabel).selectOption("n_of_total");
  await page.getByRole("button", { name: t.watermark.actionNumbers, exact: true }).click();
  await expect(page.getByText(t.watermark.doneTitle)).toBeVisible();
  expect((await download(page)).name).toBe("nomor_b.pdf");
});
