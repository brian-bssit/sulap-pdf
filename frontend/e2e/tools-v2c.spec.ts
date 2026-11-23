import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { t } from "../src/lib/strings";
import { loginAs, minimalPdf } from "./helpers";

// PNG 1×1 valid
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const img = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });
const pdf = (name: string, pages = 1) => ({ name, mimeType: "application/pdf", buffer: minimalPdf("Uji", pages) });

async function open(page: Page, label: string) {
  await loginAs(page, "e2e-v2c@banksampoerna.com", "user");
  const toggle = page.getByRole("button", { name: t.nav.open });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function download(page: Page, label: string) {
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: label }).click()]);
  return { name: d.suggestedFilename(), data: readFileSync((await d.path())!) };
}

test("gambar → PDF: urutan bisa diubah, hasil PDF", async ({ page }) => {
  await open(page, t.nav.images);
  await expect(page.getByRole("button", { name: t.images.actionToPdf })).toBeDisabled();
  await page.setInputFiles("#images-file-input", [img("satu.png"), img("dua.png")]);
  await expect(page.getByRole("list").getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: t.images.moveUp("dua.png") }).click();
  await expect(page.getByRole("listitem").first()).toContainText("dua.png");
  await page.getByRole("button", { name: t.images.actionToPdf }).click();
  await expect(page.getByText(t.images.doneTitle)).toBeVisible();
  await expect(page.getByRole("img", { name: t.result.preview })).toBeVisible();
  const f = await download(page, t.result.download);
  expect(f.name).toBe("gambar.pdf");
  expect(f.data.subarray(0, 4).toString()).toBe("%PDF");
});

test("gambar → PDF: file bukan gambar ditolak di klien", async ({ page }) => {
  await open(page, t.nav.images);
  await page.setInputFiles("#images-file-input", { name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
  await expect(page.getByRole("alert").filter({ hasText: t.images.onlyImages })).toBeVisible();
});

test("PDF → gambar: dirender di browser, tanpa request ke server, ZIP valid", async ({ page }) => {
  await open(page, t.nav.images);
  await page.getByRole("radio", { name: new RegExp(t.images.toImages.label) }).check();
  const apiCalls: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/pdf/")) apiCalls.push(r.url()); });
  await page.locator('input[type="file"]').setInputFiles(pdf("laporan.pdf", 3));
  await page.getByRole("button", { name: t.images.actionToImages }).click();
  await expect(page.getByText(t.images.resultTitle(3))).toBeVisible();
  const png = await download(page, t.images.downloadPage(2));
  expect(png.name).toBe("laporan_002.png");
  expect(png.data.subarray(1, 4).toString()).toBe("PNG");
  const zip = await download(page, t.images.downloadAll);
  expect(zip.name).toBe("laporan_gambar.zip");
  expect(zip.data.readUInt16LE(zip.data.length - 22 + 10)).toBe(3); // 3 entri
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/last-images.zip", zip.data);
  expect(apiCalls).toEqual([]); // privasi: tak ada unggahan
});

test("PDF → Word: peringatan tampil dan DOCX terunduh", async ({ page }) => {
  await open(page, t.nav.toWord);
  await page.locator('input[type="file"]').setInputFiles(pdf("laporan.pdf", 2));
  await expect(page.getByRole("note")).toContainText("OCR");
  await page.getByRole("button", { name: t.toWord.action, exact: true }).click();
  await expect(page.getByText(t.toWord.doneTitle)).toBeVisible();
  const f = await download(page, t.result.downloadDocx);
  expect(f.name).toBe("laporan.docx");
  expect(f.data.subarray(0, 2).toString()).toBe("PK");
});
