import { expect, test } from "@playwright/test";
import { purgeDemoAttempts } from "../local-db";
import { DEMO_TOUR_READY } from "./global-setup";
import { CLOSED_SITE, DEMO_HOST } from "./site-hosts";

// The pilot's visitor journey (docs/deployment.md › Pilot kaydı açma /
// kapama): landing → "Demoyu dene" on the demo host → "Gerçek hesap aç" →
// /kayit on the main site, open or closed. Three servers of one build
// (playwright.config.ts): the main one with sign-up open, CLOSED_SITE with
// sign-up closed and ORCHADOS_DEMO_URL set, DEMO_HOST a demo deployment of
// CLOSED_SITE.

test("landing on a site with ORCHADOS_DEMO_URL leads to the demo host", async ({ page }) => {
  await page.goto(`${CLOSED_SITE}/`);
  const demo = page.getByTestId("landing-demo");
  await expect(demo).toBeVisible();
  await expect(demo).toHaveAttribute("href", `${DEMO_HOST}/demo`);
  // Sign-up closed: no sign-up call to action, the demo is the primary one.
  const hero = page.locator("section").first();
  await expect(hero.getByRole("link", { name: "Kayıt ol", exact: true })).toHaveCount(0);
  await demo.click();
  await expect(page).toHaveURL(`${DEMO_HOST}/demo`);
  await expect(page.getByTestId("demo-start")).toBeVisible();
});

test("/kayit open: the form", async ({ page }) => {
  await page.goto("/kayit");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kayıt ol");
  await expect(page.locator('input[name="password"]').first()).toBeVisible();
  await expect(page.getByTestId("signup-closed")).toHaveCount(0);
});

test("/kayit closed: no form, the ways forward and back to the demo", async ({ page }) => {
  await page.goto(`${CLOSED_SITE}/kayit`);
  await expect(page.getByTestId("signup-closed")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kayıt yakında");
  await expect(page.locator("form input[name='password']")).toHaveCount(0);
  await expect(page.getByTestId("signup-closed-contact")).toHaveAttribute("href", "/iletisim");
  await expect(page.getByTestId("signup-closed-packages")).toHaveAttribute("href", "/paketler");
  await expect(page.getByTestId("signup-closed-demo")).toHaveAttribute("href", `${DEMO_HOST}/demo`);
  const ways = page.getByRole("region", { name: "Bu arada" });
  await expect(ways.getByRole("link", { name: "Giriş yap" })).toHaveAttribute("href", "/giris");
});

test("a demo host sends its site pages to the main site", async ({ request }) => {
  const res = await request.get(`${DEMO_HOST}/kayit`, { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers().location).toBe(`${CLOSED_SITE}/kayit`);
});

test.describe("demo exit", () => {
  test.skip(!process.env[DEMO_TOUR_READY], "demo tour dataset not loaded (needs uv)");

  test("'Gerçek hesap aç' on a demo host ends the demo and opens the main site's /kayit", async ({
    page,
  }) => {
    await purgeDemoAttempts();
    await page.goto(`${DEMO_HOST}/`);
    await expect(page).toHaveURL(`${DEMO_HOST}/demo`);
    await page.getByTestId("demo-start").click();
    await page.waitForURL((url) => url.origin === DEMO_HOST && url.pathname === "/portal");
    const signup = page.getByTestId("demo-signup");
    await expect(signup).toHaveText("Gerçek hesap aç");
    await signup.click();
    await page.waitForURL(`${CLOSED_SITE}/kayit`);
    await expect(page.getByTestId("signup-closed")).toBeVisible();
    await expect(page.getByTestId("signup-closed-demo")).toHaveAttribute(
      "href",
      `${DEMO_HOST}/demo`,
    );
    // The demo session is over: the demo host's portal is closed again.
    await page.goto(`${DEMO_HOST}/portal`);
    await expect(page).toHaveURL(`${DEMO_HOST}/demo`);
  });
});
