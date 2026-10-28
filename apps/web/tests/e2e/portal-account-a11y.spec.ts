import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Hesabım and its sub-pages (docs/tasarim-sistemi.md, wave 2a): no WCAG A/AA
// violations and no horizontal page scroll on a phone. Read-only: the seeded
// owner (a customer too) is only looked at.

const EMAIL = "owner@example.com";
const PASSWORD = "orchados-dev";
const PAGES = [
  "/portal/hesap",
  "/portal/hesap/izinler",
  "/portal/hesap/fatura",
  "/portal/hesap/sozlesmeler",
];

async function login(page: Page, next: string) {
  await page.goto(`/giris?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-posta").fill(EMAIL);
  await page.getByLabel("Parola").fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname !== "/giris");
}

test("no WCAG A/AA violations on the account pages", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page, PAGES[0]);
  for (const path of PAGES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`),
      path,
    ).toEqual([]);
  }
});

test("the account pages do not scroll sideways at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page, PAGES[0]);
  for (const path of PAGES) {
    await page.goto(path);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, path).toBeLessThanOrEqual(360);
  }
});
