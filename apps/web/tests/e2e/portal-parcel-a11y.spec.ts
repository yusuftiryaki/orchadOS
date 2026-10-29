import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import {
  createPortalFixture,
  PORTAL,
  purgePortalFixture,
  treeId,
} from "../integration/portal-fixture";
import { resolveSupabaseEnv } from "../local-supabase";

// The garden pages of the owner portal (docs/tasarim-sistemi.md, wave 2a):
// the report card, a tree card and the inventory report have no WCAG A/AA
// violations and no horizontal scroll, for the owner and the co-owner of a
// garden with published visits (tests/integration/portal-fixture.ts) and
// for a garden without one (the seed parcel). The map canvas is maplibre's
// and left out.

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const env = resolveSupabaseEnv();
  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await createPortalFixture(admin as never);
});
test.afterAll(() => purgePortalFixture());

const SEED_PARCEL = "c0000000-0000-4000-8000-000000000001";
const REPORT = `/portal/parsel/${PORTAL.parcelA}`;

async function login(page: Page, email: string, next: string) {
  await page.goto(`/giris?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill("orchados-dev");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname !== "/giris");
}

async function expectAccessible(page: Page, path: string) {
  if (new URL(page.url()).pathname !== path) await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .exclude(".maplibregl-canvas-container")
    .exclude(".maplibregl-ctrl")
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`),
    path,
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${path}: horizontal scroll`).toBeLessThanOrEqual(0);
}

for (const width of [360, 390, 1440]) {
  test(`the owner's garden pages are accessible at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, PORTAL.users.owner, REPORT);
    await expectAccessible(page, REPORT);
    // Each anchor of "Bu sayfada" has its section.
    const anchors = await page
      .getByRole("navigation", { name: "Bu sayfada" })
      .getByRole("link")
      .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).hash));
    expect(anchors.length).toBeGreaterThan(2);
    for (const hash of anchors) await expect(page.locator(hash)).toHaveCount(1);

    await expectAccessible(page, `${REPORT}/agac/${treeId("S1-1")}`);
    await expectAccessible(page, `${REPORT}/envanter`);
  });
}

test("the co-owner's view and a garden without a published visit are accessible", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, PORTAL.users.viewer, REPORT);
  await expectAccessible(page, REPORT);
  await expect(page.getByTestId("viewers-card")).toHaveCount(0);

  await page.context().clearCookies();
  await login(page, "owner@example.com", `/portal/parsel/${SEED_PARCEL}`);
  await expectAccessible(page, `/portal/parsel/${SEED_PARCEL}`);
  await expect(page.getByTestId("no-results")).toBeVisible();
});
