import { expect, test } from "@playwright/test";
import { t } from "../src/lib/strings";
import { loginAs } from "./helpers";

// Backend e2e berjalan dengan IDLE_TIMEOUT_SECONDS=20 (peringatan muncul ±6 dtk sebelum habis).

test("login di browser kedua menendang sesi pertama (login terbaru menang)", async ({ browser }) => {
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  const email = "e2e-single@banksampoerna.com";
  await loginAs(a, email, "user");
  await expect(a.getByText(t.nav.compress).first()).toBeVisible();

  await loginAs(b, email, "user"); // akun sama, browser lain
  await expect(b.getByText(t.nav.compress).first()).toBeVisible();

  // Sesi A sudah tidak sah: muat ulang → diarahkan ke login dengan alasan yang jelas
  await a.reload();
  await expect(a).toHaveURL(/error=session_replaced/);
  await expect(a.getByRole("alert").filter({ hasText: t.login.errors.session_replaced })).toBeVisible();

  // Sesi B tetap hidup
  expect((await b.request.get("/api/auth/me")).status()).toBe(200);
  await a.context().close();
  await b.context().close();
});

test("tanpa aktivitas: peringatan muncul lalu keluar otomatis dengan pesan idle", async ({ page }) => {
  await loginAs(page, "e2e-idle@banksampoerna.com", "user");
  await expect(page.getByRole("alertdialog", { name: t.idle.title })).toBeVisible({ timeout: 25_000 });
  await expect(page).toHaveURL(/error=session_idle/, { timeout: 25_000 });
  await expect(page.getByRole("alert").filter({ hasText: t.login.errors.session_idle })).toBeVisible();
  expect((await page.request.get("/api/auth/me")).status()).toBe(401);
});

test("'Tetap masuk' menutup peringatan dan memperpanjang sesi", async ({ page }) => {
  await loginAs(page, "e2e-stay@banksampoerna.com", "user");
  const dialog = page.getByRole("alertdialog", { name: t.idle.title });
  await expect(dialog).toBeVisible({ timeout: 25_000 });
  await dialog.getByRole("button", { name: t.idle.stay }).click();
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(5000); // lebih dari sisa waktu peringatan semula
  await expect(page).toHaveURL(/dashboard/);
  expect((await page.request.get("/api/auth/me")).status()).toBe(200);
});
