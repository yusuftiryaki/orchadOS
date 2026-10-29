import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The operations and back office screens after the wave 2b redesign
// (docs/tasarim-sistemi.md): the grouped navigation, the work queues of the
// dashboard, no page-level horizontal scroll on a phone and no axe (WCAG 2 A
// and AA) violations on the main list screens, as ops@example.com.

const PASSWORD = "orchados-dev";

async function login(page: Page, next: string) {
  await page.goto(`/giris?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-posta").fill("ops@example.com");
  await page.getByLabel("Parola").fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname === next);
}

const SCREENS = [
  "/operasyon",
  "/operasyon/sahip",
  "/operasyon/ziyaret",
  "/operasyon/bildirimler",
  "/operasyon/basvuru",
  "/operasyon/siparis",
  "/operasyon/odeme",
  "/operasyon/iade",
  "/operasyon/cikarma",
  "/operasyon/mutabakat",
  "/operasyon/fiyat",
  "/operasyon/ayarlar",
  "/operasyon/personel",
  "/operasyon/kvkk",
  "/operasyon/denetim-kaydi",
];

test("the sidebar groups the screens and marks the current one", async ({ page }) => {
  await login(page, "/operasyon");
  const nav = page.getByRole("navigation", { name: "Operasyon" });
  await expect(nav.getByRole("link", { name: "Pano" })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Siparişler" }).click();
  await page.waitForURL("**/operasyon/siparis");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Siparişler" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Pano" })).not.toHaveAttribute("aria-current");
});

test("the dashboard leads with the work queues and its actions", async ({ page }) => {
  await login(page, "/operasyon");
  await expect(page.getByRole("heading", { level: 1, name: "Operasyon panosu" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ziyaret planla" })).toBeVisible();
  const billing = page.getByTestId("billing-card");
  await expect(billing).toBeVisible();
  // Every queue is listed; only the non-empty ones are links.
  await expect(billing.locator("[data-stat]")).toHaveCount(13);
  for (const queue of await billing.locator("[data-stat]").all()) {
    const value = Number((await queue.innerText()).match(/\d+/)?.[0]);
    const isLink = await queue.evaluate((el) => el.tagName === "A");
    expect(isLink, await queue.innerText()).toBe(value > 0);
  }
});

test("on a phone the menu opens under the header and nothing scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page, "/operasyon");
  const menu = page.getByText("Menü", { exact: true });
  await menu.click();
  const nav = page.getByRole("navigation", { name: "Operasyon" });
  await nav.getByRole("link", { name: "Başvurular" }).click();
  await page.waitForURL("**/operasyon/basvuru");
  for (const path of SCREENS) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("the operations screens have no axe violations", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, "/operasyon");
  for (const path of SCREENS) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .exclude(".maplibregl-map")
      .analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`),
      path,
    ).toEqual([]);
  }
});
