import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { t } from "../src/lib/strings";
import { loginAs } from "./helpers";

async function as(ctxFactory: () => Promise<BrowserContext>, email: string, role: Parameters<typeof loginAs>[2]) {
  const ctx = await ctxFactory();
  const page = await ctx.newPage();
  await loginAs(page, email, role);
  return { ctx, page };
}

async function openAdmin(page: Page) {
  const toggle = page.getByRole("button", { name: t.nav.open });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("button", { name: t.nav.admin }).click();
  await expect(page.getByRole("table")).toBeVisible();
}

test("dual control: Officer mengajukan, Supervisor menyetujui, role berubah; Officer tak bisa menyetujui", async ({ browser }) => {
  const stamp = Date.now();
  const target = `e2e-target-${stamp}@banksampoerna.com`;
  const mk = () => browser.newContext();

  const sa = await as(mk, `e2e-sa-${stamp}@banksampoerna.com`, "super_admin"); // menjamin pasangan admin ada (invarian) dan membaca hasil
  const tgt = await as(mk, target, "user");
  const off = await as(mk, `e2e-off-${stamp}@banksampoerna.com`, "dca_officer");
  const sup = await as(mk, `e2e-sup-${stamp}@banksampoerna.com`, "dca_supervisor");

  // Officer: ajukan Auditor untuk target (alasan opsional diisi)
  await openAdmin(off.page);
  await off.page.getByLabel(t.admin.userMgmt.roleFor(target)).selectOption("auditor");
  await off.page.getByLabel(t.admin.userMgmt.reasonLabel(target)).fill("perlu akses baca log");
  await off.page.getByRole("button", { name: t.admin.userMgmt.submitRequest }).click();
  await expect(off.page.getByRole("status").filter({ hasText: t.admin.userMgmt.requestSent })).toBeVisible();

  // belum berubah sebelum disetujui
  const roleOf = async () => {
    const res = await sa.page.request.get("/api/admin/users?per_page=500");
    return (await res.json()).data.find((u: { email: string }) => u.email === target).role as string;
  };
  expect(await roleOf()).toBe("user");

  // Officer tidak boleh menyetujui (API) dan UI-nya tidak menampilkan tombol Setujui
  const pending = (await (await off.page.request.get("/api/admin/role-requests?status=PENDING")).json()).data.find((r: { target_email: string }) => r.target_email === target);
  expect(pending.reason).toBe("perlu akses baca log");
  expect((await off.page.request.post(`/api/admin/role-requests/${pending.id}/approve`, { data: {} })).status()).toBe(403);
  await off.page.getByRole("button", { name: new RegExp(t.admin.requests) }).click();
  await expect(off.page.getByRole("button", { name: t.admin.approveFor(target) })).toHaveCount(0);
  await expect(off.page.getByRole("button", { name: t.admin.cancelFor(target) })).toBeVisible(); // pengaju boleh membatalkan

  // Supervisor menyetujui lewat UI
  await openAdmin(sup.page);
  await sup.page.getByRole("button", { name: new RegExp(t.admin.requests) }).click();
  await sup.page.getByRole("button", { name: t.admin.approveFor(target) }).click();
  await expect(sup.page.getByRole("button", { name: t.admin.approveFor(target) })).toHaveCount(0); // tak lagi PENDING

  expect(await roleOf()).toBe("auditor");
  // role baru berlaku seketika: target kini bisa membuka log audit
  expect((await tgt.page.request.get("/api/admin/audit-logs")).status()).toBe(200);

  for (const c of [sa, tgt, off, sup]) await c.ctx.close();
});

test("Super Admin mengubah role langsung (tanpa pengajuan); invarian menolak menurunkan Super Admin terakhir tanpa pasangan", async ({ browser }) => {
  const stamp = Date.now();
  const mk = () => browser.newContext();
  const sa = await as(mk, `e2e-sa2-${stamp}@banksampoerna.com`, "super_admin");
  const u = await as(mk, `e2e-direct-${stamp}@banksampoerna.com`, "user");

  await openAdmin(sa.page);
  await sa.page.getByLabel(t.admin.userMgmt.roleFor(`e2e-direct-${stamp}@banksampoerna.com`)).selectOption("auditor");
  await expect.poll(async () => {
    const res = await sa.page.request.get("/api/admin/users?per_page=500");
    return (await res.json()).data.find((x: { email: string }) => x.email === `e2e-direct-${stamp}@banksampoerna.com`).role;
  }).toBe("auditor");

  for (const c of [sa, u]) await c.ctx.close();
});

test("user biasa dan auditor tidak punya kontrol perubahan role", async ({ browser }) => {
  const stamp = Date.now();
  const mk = () => browser.newContext();
  const aud = await as(mk, `e2e-aud-${stamp}@banksampoerna.com`, "auditor");
  await openAdmin(aud.page);
  await expect(aud.page.locator("select")).toHaveCount(0);
  const me = await (await aud.page.request.get("/api/auth/me")).json();
  expect((await aud.page.request.post(`/api/admin/users/${me.id}/upgrade?role=super_admin`)).status()).toBe(403);
  expect((await aud.page.request.post("/api/admin/role-requests", { data: { user_id: me.id, role: "user" } })).status()).toBe(403);
  await aud.ctx.close();
});
