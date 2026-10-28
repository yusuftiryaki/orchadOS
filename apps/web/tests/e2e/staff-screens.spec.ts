import AxeBuilder from "@axe-core/playwright";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { resolveSupabaseEnv } from "../local-supabase";
import {
  createExpertRun,
  grantExpertRoles,
  purgeExpertTest,
  type ExpertRun,
} from "./expert-fixtures";

// Office and expert screens (wave 2c of docs/tasarim-sistemi.md): no WCAG A/AA
// violations, no page-level horizontal scroll on a phone, and the review
// workbench shows its keyboard shortcuts. Maps and panorama viewers are
// excluded from axe: their own components are checked on their branches.

const PARCEL = "c0000000-0000-4000-8000-000000000001";
// The scan visit comes from the expert fixtures (processed, reviewable).
const INVENTORY = "e0000000-0000-4000-8000-000000000001";

const env = resolveSupabaseEnv();
const admin = createClient<Database>(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let run: ExpertRun;

test.beforeAll(async () => {
  await grantExpertRoles(admin);
  run = await createExpertRun(admin);
});

test.afterAll(async () => {
  await purgeExpertTest();
});

async function login(page: Page, email: string) {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill("orchados-dev");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/giris"));
}

const screens = (): [string, string[]][] => [
  [
    "ops@example.com",
    ["/ofis", `/ofis/parsel/${PARCEL}`, `/ofis/parsel/${PARCEL}/envanter/duzenle`],
  ],
  [
    "expert@example.com",
    [
      "/uzman",
      "/uzman/sorular",
      `/uzman/parsel/${PARCEL}`,
      `/uzman/ziyaret/${run.session}`,
      `/uzman/ziyaret/${run.session}/ozet`,
      `/uzman/envanter/${INVENTORY}`,
    ],
  ],
];

for (const [index, email] of ["ops@example.com", "expert@example.com"].entries()) {
  test(`no WCAG A/AA violations on ${email}'s office and expert screens`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, email);
    for (const path of screens()[index][1]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .exclude(".maplibregl-map")
        .exclude(".psv-container")
        .analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`),
        path,
      ).toEqual([]);
    }
  });

  test(`${email}'s office and expert screens fit a 360px phone`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await login(page, email);
    for (const path of screens()[index][1]) {
      await page.goto(path);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width, path).toBeLessThanOrEqual(360);
    }
  });
}

test("the review workbench shows its keyboard shortcuts", async ({ page }) => {
  await login(page, "expert@example.com");
  await page.goto(`/uzman/ziyaret/${run.session}`);
  await expect(page.getByTestId("review-page")).toBeVisible();
  for (const key of ["J", "A", "1"]) {
    await expect(page.locator("kbd", { hasText: new RegExp(`^${key}$`) }).first()).toBeVisible();
  }
});
