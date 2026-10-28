import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ageDemoSessions, purgeDemoAttempts, runDemoHousekeeping } from "../local-db";
import { resolveSupabaseEnv } from "../local-supabase";
import { DEMO_TOUR_READY } from "./global-setup";

// The demo tour end to end (docs/demo-turu.md §14): landing → /demo → start →
// the real owner portal with the banner and the ten guided steps, real
// synthetic media from demo-media, watermarked PDFs, no write forms, expiry,
// exit, and a real user who is never signed out by /demo/bitti. Runs on the
// dataset of `pnpm db:demo-tour --profile test` (global setup) with
// ORCHADOS_DEMO_ENABLED=1 (playwright.config.ts).

test.describe.configure({ mode: "serial" });
test.skip(!process.env[DEMO_TOUR_READY], "demo tour dataset not loaded (needs uv)");

const PARCEL_A = "de100000-0000-4000-8000-000000000001";
const REPORT = `/portal/parsel/${PARCEL_A}`;
const MARKER = "orchadOS ornek rapor";

const env = resolveSupabaseEnv();
const admin = createClient(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function startDemo(page: Page, from: "landing" | "demo" = "demo") {
  await purgeDemoAttempts();
  if (from === "landing") {
    await page.goto("/");
    await page.getByTestId("landing-demo").click();
    await expect(page).toHaveURL("/demo");
  } else {
    await page.goto("/demo");
  }
  await page.getByTestId("demo-start").click();
  await page.waitForURL((url) => url.pathname === "/portal");
  await expect(page.getByTestId("demo-banner")).toBeVisible();
}

// The newest visitor account (demo-start names them ziyaretci-<uuid>@…).
async function newestVisitor(): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const visitors = data.users
    .filter((u) => u.email?.startsWith("ziyaretci-"))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  expect(visitors.length).toBeGreaterThan(0);
  return visitors[0].id;
}

async function pdf(request: APIRequestContext, path: string) {
  const res = await request.get(path, { maxRedirects: 0 });
  return { res, body: res.status() === 200 ? await res.body() : Buffer.alloc(0) };
}

const step = (page: Page) => page.getByTestId("guided-tour");

async function expectStep(page: Page, id: string, n: number, targets: string[]) {
  await expect(step(page)).toHaveAttribute("data-step", id, { timeout: 20_000 });
  await expect(page.getByTestId("tour-counter")).toHaveText(`${n} / 10`);
  for (const target of targets) await expect(page.getByTestId(target).first()).toBeAttached();
}

test.afterAll(async () => {
  await purgeDemoAttempts();
});

test("a visitor starts the demo from the landing page and takes the guided tour", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const mirrored: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/storage/v1/object/public/demo-media/")) mirrored.push(r.url());
  });

  await startDemo(page, "landing");
  await expect(page).toHaveURL("/portal?tur=bahceler");
  await expect(page.getByTestId("demo-banner")).toContainText("veriler ve görüntüler sentetik");
  // The demo shell: no billing navigation, no e-mail, no avatar.
  await expect(page.getByRole("navigation", { name: "Hesap" })).toHaveCount(0);
  await expect(page.getByTestId("user-email")).toHaveCount(0);
  await expect(page.getByText("@demo.orchados.invalid")).toHaveCount(0);

  // 1 bahçeler
  await expectStep(page, "bahceler", 1, ["parcel-list"]);
  await expect(page.getByTestId("parcel-list")).toContainText("Örnek Bahçe – Kuzey");
  await page.getByTestId("tour-next").click();

  // 2 gezi: real synthetic panoramas from the public mirror
  await expectStep(page, "gezi", 2, ["tour-viewer", "tour-visit"]);
  await expect(page).toHaveURL(`${REPORT}/gezi?tur=gezi`);
  const viewer = page.getByTestId("tour-viewer");
  await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
  await expect(viewer).not.toHaveAttribute("data-image", "placeholder");
  expect(mirrored.length).toBeGreaterThan(0);
  await page.getByTestId("tour-next").click();

  // 3 harita
  await expectStep(page, "harita", 3, ["parcel-map", "map-controls"]);
  await expect(page).toHaveURL(`${REPORT}?katman=isi&tur=harita`);
  await page.getByTestId("tour-next").click();

  // 4 karne: the dimensions show pests and fruit load
  await expectStep(page, "karne", 4, ["health-score", "dimensions"]);
  await expect(page).toHaveURL(`${REPORT}?tur=karne`);
  const dims = page.getByTestId("dimensions");
  await expect(dims.locator('[data-dimension="pests"]')).toBeVisible();
  await expect(dims.locator('[data-dimension="fruit"]')).not.toContainText(
    "yaz ziyaretinde ölçülür",
  );
  await expect(dims.locator('[data-dimension="structure"]')).toBeVisible();
  await page.getByTestId("tour-next").click();

  // 5 bulgular
  await expectStep(page, "bulgular", 5, ["findings"]);
  await page.getByTestId("tour-next").click();

  // 6 ağaç S3-6: the hash check passes on the mirrored photo
  await expectStep(page, "agac", 6, ["tree-card", "photo-evidence", "hash-check"]);
  await expect(page).toHaveURL(new RegExp(`${REPORT}/agac/[0-9a-f-]{36}\\?tur=agac$`));
  await expect(page.getByTestId("tree-card")).toContainText("S3-6");
  const evidence = page.getByTestId("photo-evidence").first();
  await evidence.locator("summary").click();
  const check = evidence.getByTestId("hash-check");
  await check.getByRole("button").click();
  await expect(check).toHaveAttribute("data-state", "match");
  await page.getByTestId("tour-next").click();

  // 7 ziyaret: the 2025 visit
  await expectStep(page, "ziyaret", 7, ["visit-select", "report-summary"]);
  await expect(page).toHaveURL(new RegExp(`${REPORT}\\?ziyaret=[0-9a-f-]{36}&tur=ziyaret$`));
  await page.getByTestId("tour-next").click();

  // 8 envanter
  await expectStep(page, "envanter", 8, ["inventory-report"]);
  await expect(page).toHaveURL(`${REPORT}/envanter?tur=envanter`);
  await page.getByTestId("tour-next").click();

  // 9 pdf
  await expectStep(page, "pdf", 9, ["report-pdf"]);
  await page.getByTestId("tour-prev").click();
  await expectStep(page, "envanter", 8, ["inventory-report"]);
  await page.keyboard.press("ArrowRight");
  await expectStep(page, "pdf", 9, ["report-pdf"]);
  await page.getByTestId("tour-next").click();

  // 10 son: the closing card on the same page
  await expectStep(page, "son", 10, ["demo-banner"]);
  await expect(page.getByTestId("tour-signup")).toBeVisible();
  await expect(page.getByTestId("tour-packages")).toHaveAttribute("href", "/paketler");
  await page.keyboard.press("Escape");
  await expect(step(page)).toHaveCount(0);
  await expect(page).toHaveURL(REPORT);

  // "Turu başlat" starts again from step 1.
  await page.getByTestId("demo-tour-start").click();
  await expectStep(page, "bahceler", 1, ["parcel-list"]);
  await page.getByTestId("tour-close").click();
  await expect(step(page)).toHaveCount(0);

  // Both PDFs: watermarked samples, detectable by their Info dictionary.
  for (const path of [`${REPORT}/rapor.pdf`, `${REPORT}/envanter/rapor.pdf`]) {
    const { res, body } = await pdf(page.request, path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect(res.headers()["x-orchados-sample"]).toBe("1");
    expect(res.headers()["cache-control"]).toBe("private, max-age=600");
    expect(body.includes(Buffer.from(MARKER, "latin1")), path).toBe(true);
  }

  // No write form anywhere on the parcel page; notices instead.
  await page.goto(REPORT);
  await expect(page.getByTestId("dimensions")).toBeVisible();
  await expect(page.getByTestId("ask-question")).toHaveCount(0);
  await expect(page.getByTestId("invite-viewer")).toHaveCount(0);
  await expect(page.getByTestId("boundary-approve")).toHaveCount(0);
  await expect(page.locator("#sorular textarea")).toHaveCount(0);
  await expect(page.getByTestId("viewers-card")).toContainText("Örnek Hissedar");
  await expect(page.getByTestId("viewers-card").getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("demo-notice").first()).toBeVisible();
  await expect(page.getByTestId("question-threads")).toContainText("Uzman");
  // Billing pages send a visitor back to the gardens.
  await page.goto("/portal/basvuru");
  await expect(page).toHaveURL("/portal");

  // Expiry: past its end and after housekeeping, the PDF route and the pages
  // end the session (never a 403).
  await ageDemoSessions([await newestVisitor()], 4 * 60);
  await runDemoHousekeeping();
  const expired = await pdf(page.request, `${REPORT}/rapor.pdf`);
  expect(expired.res.status()).toBe(302);
  expect(expired.res.headers()["location"]).toBe("/demo/bitti");
  await page.goto(REPORT);
  await expect(page).toHaveURL("/demo?bitti=1");
  await expect(page.getByTestId("demo-ended")).toBeVisible();
  await page.goto("/portal");
  await expect(page).toHaveURL("/giris?next=%2Fportal");
});

test("'Demodan çık' ends the demo and the portal asks for a login again", async ({ page }) => {
  await startDemo(page);
  await page.getByTestId("demo-exit").click();
  await expect(page).toHaveURL("/");
  await expect(page.getByTestId("landing-demo")).toBeVisible();
  await page.goto("/portal");
  await expect(page).toHaveURL("/giris?next=%2Fportal");
});

test("'Gerçek hesap aç' ends the demo and opens sign-up", async ({ page }) => {
  await startDemo(page);
  await page.getByTestId("demo-signup").click();
  await expect(page).toHaveURL("/kayit");
  await expect(page.getByTestId("demo-continue")).toHaveCount(0);
  await page.goto("/portal");
  await expect(page).toHaveURL("/giris?next=%2Fportal");
});

test("a real user stays signed in after /demo/bitti", async ({ page }) => {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill("owner@example.com");
  await page.getByLabel("Parola").fill("orchados-dev");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname !== "/giris");

  await page.goto("/demo/bitti");
  await expect(page).toHaveURL("/demo");
  await expect(page.getByTestId("demo-signed-in")).toBeVisible();
  await expect(page.getByTestId("demo-start")).toHaveCount(0);
  await page.goto("/portal");
  await expect(page).toHaveURL("/portal");
  await expect(page.getByTestId("user-email")).toHaveText("owner@example.com");
  await expect(page.getByTestId("demo-banner")).toHaveCount(0);
});

test("phone size: banner and bottom sheet fit without horizontal scroll", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await startDemo(page);
  await expect(step(page)).toHaveAttribute("data-step", "bahceler", { timeout: 20_000 });

  const banner = await page.getByTestId("demo-banner").boundingBox();
  expect(banner!.height).toBeLessThan(48);
  const sheet = await step(page).boundingBox();
  expect(sheet!.width).toBeGreaterThan(380);
  expect(Math.round(sheet!.y + sheet!.height)).toBeGreaterThanOrEqual(840);
  const noScroll = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await noScroll()).toBe(true);

  for (const n of [2, 3, 4]) {
    await page.getByTestId("tour-next").click();
    await expect(page.getByTestId("tour-counter")).toHaveText(`${n} / 10`, { timeout: 20_000 });
    await expect(page.getByTestId("demo-banner")).toBeVisible();
    expect(await noScroll()).toBe(true);
  }
  await page.getByTestId("demo-exit").click();
  await expect(page).toHaveURL("/");
  await context.close();
});
