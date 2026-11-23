import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { t } from "../src/lib/strings";
import { loginAs, minimalPdf } from "./helpers";

const pdf = (name: string, text = "Uji", pages = 1) => ({ name, mimeType: "application/pdf", buffer: minimalPdf(text, pages) });

async function open(page: Page, label: string) {
  await loginAs(page, "e2e-v2d@banksampoerna.com", "user");
  const toggle = page.getByRole("button", { name: t.nav.open });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function download(page: Page, label: string) {
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: label }).click()]);
  return { name: d.suggestedFilename(), data: readFileSync((await d.path())!) };
}

test("OCR: PDF yang sudah bertext → tidak ada halaman diproses", async ({ page }) => {
  await open(page, t.nav.ocr);
  await page.locator('input[type="file"]').setInputFiles(pdf("a.pdf"));
  await expect(page.getByRole("radio", { name: t.ocr.langs["ind+eng"].label })).toBeChecked();
  await page.getByRole("button", { name: t.ocr.action, exact: true }).click();
  await expect(page.getByText(t.ocr.doneTitle)).toBeVisible();
  await expect(page.getByText(t.ocr.nothing)).toBeVisible();
});

test("bandingkan: perbedaan kata ditandai di sisi lama dan baru", async ({ page }) => {
  await open(page, t.nav.compare);
  await expect(page.getByRole("button", { name: t.compare.action, exact: true })).toBeDisabled();
  await page.setInputFiles("#compare-a", pdf("lama.pdf", "Saldo lama"));
  await page.setInputFiles("#compare-b", pdf("baru.pdf", "Saldo baru"));
  await page.getByRole("button", { name: t.compare.action, exact: true }).click();
  await expect(page.getByText(t.compare.summary(1, 1, 1))).toBeVisible();
  await expect(page.locator("del")).toContainText("lama");
  await expect(page.locator("ins")).toContainText("baru");
});

test("bandingkan: dokumen sama → tidak ada perbedaan", async ({ page }) => {
  await open(page, t.nav.compare);
  await page.setInputFiles("#compare-a", pdf("a.pdf", "Sama"));
  await page.setInputFiles("#compare-b", pdf("b.pdf", "Sama"));
  await page.getByRole("button", { name: t.compare.action, exact: true }).click();
  await expect(page.getByText(t.compare.identical)).toBeVisible();
});

test("alur kerja: bersihkan → watermark → kunci, hasil terenkripsi", async ({ page }) => {
  await open(page, t.nav.workflow);
  await page.locator('input[type="file"]').setInputFiles(pdf("laporan.pdf", "Laporan", 2));
  const run = page.getByRole("button", { name: t.workflow.action, exact: true });
  await expect(run).toBeDisabled();
  const add = page.getByLabel(t.workflow.add);
  await add.selectOption({ label: t.workflow.steps.scrub });
  await add.selectOption({ label: t.workflow.steps.watermark });
  await add.selectOption({ label: t.workflow.steps.protect });
  await expect(run).toBeDisabled(); // isian belum lengkap
  await page.getByLabel(t.workflow.textLabel, { exact: true }).fill("RAHASIA");
  await page.getByLabel(t.workflow.passwordLabel, { exact: true }).fill("rahasia-e2e-123");
  await run.click();
  await expect(page.getByText(t.workflow.doneTitle)).toBeVisible();
  await expect(page.getByText(t.workflow.doneInfo(3))).toBeVisible();
  const f = await download(page, t.result.download);
  expect(f.name).toBe("protected_watermark_bersih_laporan.pdf"); // jejak nama tiap langkah
  expect(f.data.includes("/Encrypt")).toBe(true);
});

test("alur kerja: kunci tidak di akhir ditolak; langkah gagal disebut dan berhenti", async ({ page }) => {
  await open(page, t.nav.workflow);
  await page.locator('input[type="file"]').setInputFiles(pdf("a.pdf"));
  const add = page.getByLabel(t.workflow.add);
  await add.selectOption({ label: t.workflow.steps.protect });
  await add.selectOption({ label: t.workflow.steps.scrub });
  await expect(page.getByText(t.workflow.errors["protect-last"])).toBeVisible();
  await expect(page.getByRole("button", { name: t.workflow.action, exact: true })).toBeDisabled();
  await page.getByRole("button", { name: t.workflow.remove(t.workflow.steps.protect) }).click();
  await add.selectOption({ label: t.workflow.steps["remove-pages"] });
  await page.getByLabel(t.workflow.pagesLabel, { exact: true }).fill("9"); // PDF hanya 1 halaman
  await page.getByRole("button", { name: t.workflow.action, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Gagal di langkah 2" })).toContainText(t.workflow.steps["remove-pages"]);
});
