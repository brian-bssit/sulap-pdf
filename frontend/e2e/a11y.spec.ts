import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { t } from "../src/lib/strings";
import { loginAs, minimalPdf } from "./helpers";

const pdf = (name: string, pages = 1) => ({ name, mimeType: "application/pdf", buffer: minimalPdf("Uji", pages) });

type Screen = { name: string; open: (p: Page) => Promise<void> };
const user = (p: Page) => loginAs(p, "e2e-a11y@banksampoerna.com", "user");
async function nav(p: Page, label: string) {
  const toggle = p.getByRole("button", { name: t.nav.open });
  if (await toggle.isVisible()) await toggle.click(); // layar sempit: menu berupa drawer
  await p.getByRole("button", { name: label }).click();
}

const SCREENS: Screen[] = [
  { name: "login", open: async (p) => { await p.goto("/"); } },
  { name: "kompres (kosong)", open: user },
  {
    name: "kompres (file dipilih + tingkat)",
    open: async (p) => { await user(p); await p.setInputFiles("#compress-file-input", pdf("a.pdf")); await expect(p.getByRole("radio").first()).toBeVisible(); },
  },
  {
    name: "kompres (hasil + pratinjau)",
    open: async (p) => {
      await user(p);
      await p.setInputFiles("#compress-file-input", pdf("a.pdf"));
      await p.getByRole("button", { name: t.compress.action, exact: true }).click();
      await expect(p.getByRole("img", { name: t.result.preview })).toBeVisible();
    },
  },
  {
    name: "gabung (daftar file)",
    open: async (p) => { await user(p); await nav(p, t.nav.merge); await p.setInputFiles("#merge-file-input", [pdf("a.pdf"), pdf("b.pdf")]); await expect(p.getByRole("list")).toBeVisible(); },
  },
  {
    name: "atur halaman",
    open: async (p) => { await user(p); await nav(p, t.nav.rearrange); await p.locator('input[type="file"]').setInputFiles(pdf("a.pdf", 3)); await expect(p.getByLabel(t.rearrange.rotate(1))).toBeAttached(); },
  },
  {
    name: "hapus halaman",
    open: async (p) => { await user(p); await nav(p, t.nav.removePages); await p.locator('input[type="file"]').setInputFiles(pdf("a.pdf", 3)); await expect(p.getByRole("button", { name: /Halaman 1,/ })).toBeVisible(); },
  },
  {
    name: "pisah halaman (opsi)",
    open: async (p) => { await user(p); await nav(p, t.nav.split); await p.locator('input[type="file"]').setInputFiles(pdf("a.pdf", 3)); await expect(p.getByLabel(t.split.rangesLabel)).toBeVisible(); },
  },
  {
    name: "kunci pdf (opsi)",
    open: async (p) => { await user(p); await nav(p, t.nav.security); await p.locator('input[type="file"]').setInputFiles(pdf("a.pdf")); await expect(p.getByLabel(t.lock.passwordLabel, { exact: true })).toBeVisible(); },
  },
  {
    name: "watermark (opsi)",
    open: async (p) => { await user(p); await nav(p, t.nav.watermark); await p.locator('input[type="file"]').setInputFiles(pdf("a.pdf")); await expect(p.getByLabel(t.watermark.textLabel)).toBeVisible(); },
  },
  {
    name: "gambar → pdf (daftar)",
    open: async (p) => {
      await user(p); await nav(p, t.nav.convert);
      await p.getByRole("radio", { name: new RegExp(t.images.toPdf.label) }).check();
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
      await p.setInputFiles("#images-file-input", [{ name: "a.png", mimeType: "image/png", buffer: png }, { name: "b.png", mimeType: "image/png", buffer: png }]);
      await expect(p.getByRole("list")).toBeVisible();
    },
  },
  {
    name: "pdf → gambar (opsi)",
    open: async (p) => { await user(p); await nav(p, t.nav.convert); await p.getByRole("radio", { name: new RegExp(t.images.toImages.label) }).check(); await p.locator('input[type="file"]').setInputFiles(pdf("a.pdf")); await expect(p.getByRole("group", { name: t.images.formatLegend })).toBeVisible(); },
  },
  {
    name: "pdf ke word (peringatan)",
    open: async (p) => { await user(p); await nav(p, t.nav.toWord); await p.locator('input[type="file"]').setInputFiles(pdf("a.pdf")); await expect(p.getByRole("note")).toBeVisible(); },
  },
  {
    name: "ocr (opsi)",
    open: async (p) => { await user(p); await nav(p, t.nav.ocr); await p.locator('input[type="file"]').setInputFiles(pdf("a.pdf")); await expect(p.getByRole("group", { name: t.ocr.langLegend })).toBeVisible(); },
  },
  {
    name: "bandingkan (hasil)",
    open: async (p) => {
      await user(p); await nav(p, t.nav.compare);
      await p.setInputFiles("#compare-a", { name: "a.pdf", mimeType: "application/pdf", buffer: minimalPdf("Saldo lama") });
      await p.setInputFiles("#compare-b", { name: "b.pdf", mimeType: "application/pdf", buffer: minimalPdf("Saldo baru") });
      await p.getByRole("button", { name: t.compare.action, exact: true }).click();
      await expect(p.locator("del")).toBeVisible();
    },
  },
  { name: "konversi dokumen", open: async (p) => { await user(p); await nav(p, t.nav.convert); await expect(p.getByText(t.convert.choose)).toBeVisible(); } },
  {
    name: "edit (dokumen dibuka)",
    open: async (p) => {
      await p.setViewportSize({ width: 1280, height: 1000 });
      await user(p);
      await nav(p, t.nav.edit);
      await p.setInputFiles("#edit-file-input", pdf("a.pdf"));
      await expect.poll(async () => (await p.locator("canvas").boundingBox())?.width ?? 0).toBeGreaterThan(100);
    },
  },
  {
    name: "admin: user",
    open: async (p) => { await loginAs(p, "e2e-a11y-admin@banksampoerna.com", "super_admin"); await nav(p, t.nav.admin); await expect(p.getByRole("table")).toBeVisible(); },
  },
  {
    name: "admin: pengajuan role",
    open: async (p) => {
      await loginAs(p, "e2e-a11y-admin@banksampoerna.com", "super_admin");
      await nav(p, t.nav.admin);
      await p.getByRole("button", { name: new RegExp(t.admin.requests) }).click();
      await expect(p.getByRole("table")).toBeVisible();
    },
  },
  {
    name: "admin: user (IT DCA Officer, form pengajuan)",
    open: async (p) => {
      await loginAs(p, "e2e-a11y-officer@banksampoerna.com", "dca_officer");
      await nav(p, t.nav.admin);
      await expect(p.getByRole("table")).toBeVisible();
      await p.getByLabel(t.admin.userMgmt.roleFor("e2e-a11y@banksampoerna.com")).first().selectOption("auditor");
      await expect(p.getByRole("button", { name: t.admin.userMgmt.submitRequest }).first()).toBeVisible();
    },
  },
  {
    name: "admin: log audit",
    open: async (p) => {
      await loginAs(p, "e2e-a11y-admin@banksampoerna.com", "super_admin");
      await nav(p, t.nav.admin);
      await p.getByRole("button", { name: new RegExp(t.admin.audit) }).click();
      await expect(p.getByRole("table")).toBeVisible();
    },
  },
];

for (const scheme of ["light"] as const) {
  for (const s of SCREENS) {
    test(`axe WCAG 2.1 AA — ${s.name} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await s.open(page);
      await page.waitForTimeout(300); // animasi masuk selesai (kontras dihitung dari warna akhir)
      const { violations } = await new AxeBuilder({ page })
        // Tombol "Sign in with Google" dirender iframe pihak ketiga (GIS) — bukan kode kita.
        .exclude("#google-button")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ") + " :: " + (n.failureSummary ?? "").split("\n")[1]) })),
      ).toEqual([]);
    });
  }
}

test.describe("responsif 360 px (tanpa scroll horizontal halaman)", () => {
  test.use({ viewport: { width: 360, height: 740 } });
  for (const s of SCREENS.filter((x) => !x.name.startsWith("edit"))) {
    test(s.name, async ({ page }) => {
      await s.open(page);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, "lebar dokumen melebihi viewport").toBeLessThanOrEqual(0);
    });
  }
});
