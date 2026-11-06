import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  ageDemoSessions,
  exhaustDemoCaps,
  purgeDemoAttempts,
  runDemoHousekeeping,
} from "../local-db";
import { resolveSupabaseEnv } from "../local-supabase";
import { DEMO_TOUR_READY } from "./global-setup";
import { collectErrors, COUNT_GL, glContexts, viewerTextures } from "./panorama-helpers";

// The demo tour end to end (docs/demo-turu.md §14): landing → /demo → start →
// the real owner portal with the banner and the twelve guided steps, real
// synthetic media from demo-media, watermarked PDFs, no write forms, expiry,
// exit, and a real user who is never signed out by /demo/bitti. Runs on the
// dataset of `pnpm db:demo-tour --profile test` (global setup) with
// ORCHADOS_DEMO_ENABLED=1 (playwright.config.ts).

test.describe.configure({ mode: "serial" });
test.skip(!process.env[DEMO_TOUR_READY], "demo tour dataset not loaded (needs uv)");

const PARCEL_A = "de100000-0000-4000-8000-000000000001";
const PARCEL_B = "de100000-0000-4000-8000-000000000002";
// Parcel B's done mowing job (docs/demo-turu.md §8.1, dataset version 2).
const MOWING_JOB = "de300000-0000-4000-8000-000000000001";
const REPORT = `/portal/parsel/${PARCEL_A}`;
const DEMO_ORG = "de000000-0000-4000-8000-000000000001";
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
  await expect(page.getByTestId("tour-counter")).toHaveText(`${n} / ${STEPS.length}`);
  for (const target of targets) await expect(page.getByTestId(target).first()).toBeAttached();
}

// The twelve steps in order, with the targets each one outlines.
const STEPS: [string, string[]][] = [
  ["bahceler", ["parcel-list"]],
  ["gezi", ["tour-viewer", "tour-visit"]],
  ["harita", ["parcel-map", "map-controls"]],
  ["karne", ["health-score", "dimensions"]],
  ["bulgular", ["findings"]],
  ["agac", ["tree-card", "photo-evidence", "hash-check"]],
  ["ziyaret", ["visit-select", "parcel-map"]],
  ["envanter", ["inventory-report"]],
  ["hizmet-oneri", ["service-offers"]],
  ["hizmet-sonuc", ["service-request-proof"]],
  ["pdf", ["report-pdf"]],
  ["son", ["demo-banner"]],
];

// After İleri/Geri the keyboard focus is on the new step's heading, and the
// live region outside the card names the step.
async function expectFocusOnStep(page: Page, n: number) {
  await expect(step(page).getByRole("heading")).toBeFocused();
  await expect(page.getByTestId("tour-announcer")).toContainText(`${n} / ${STEPS.length}`);
}

// Both proof columns show a loaded photo from the public demo-media mirror.
async function expectProofPhotos(page: Page) {
  const proof = page.getByTestId("service-request-proof");
  const images = proof.locator("img");
  await expect(images).toHaveCount(2);
  for (const img of await images.all()) {
    await expect(img).toHaveAttribute("src", /\/storage\/v1\/object\/public\/demo-media\//);
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
  }
  await expect(proof).toContainText("Öncesi");
  await expect(proof).toContainText("Sonrası");
}

async function demoRequests(): Promise<number> {
  const { count, error } = await admin
    .from("service_request")
    .select("id", { count: "exact", head: true })
    .eq("org_id", DEMO_ORG);
  if (error) throw error;
  return count ?? 0;
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
  await expectFocusOnStep(page, 2);
  await expect(page).toHaveURL(`${REPORT}/gezi?tur=gezi`);
  const viewer = page.getByTestId("tour-viewer");
  await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
  await expect(viewer).not.toHaveAttribute("data-image", "placeholder");
  expect(mirrored.length).toBeGreaterThan(0);
  await page.getByTestId("tour-next").click();

  // 3 harita
  await expectStep(page, "harita", 3, ["parcel-map", "map-controls"]);
  await expect(page).toHaveURL(`${REPORT}?katman=isi&tur=harita`);
  // Arrow keys on the focused map pan the map; the tour stays on its step.
  await page.locator('[data-testid="parcel-map"] .maplibregl-canvas').focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await expect(step(page)).toHaveAttribute("data-step", "harita");
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
  await expectStep(page, "ziyaret", 7, ["visit-select", "parcel-map"]);
  await expect(page).toHaveURL(new RegExp(`${REPORT}\\?ziyaret=[0-9a-f-]{36}&tur=ziyaret$`));
  await page.getByTestId("tour-next").click();

  // 8 envanter
  await expectStep(page, "envanter", 8, ["inventory-report"]);
  await expect(page).toHaveURL(`${REPORT}/envanter?tur=envanter`);
  await page.getByTestId("tour-next").click();

  // 9 hizmet-oneri: parcel A's mowing card, buyable on any day (in season a
  // request, out of season a pre-request; no request is open), unpriced.
  await expectStep(page, "hizmet-oneri", 9, ["service-offers"]);
  await expect(page).toHaveURL(`${REPORT}?tur=hizmet-oneri`);
  const offer = page.locator(`[data-testid="service-offer"][data-offer-parcel-id="${PARCEL_A}"]`);
  await expect(offer).toHaveCount(1);
  expect(["recommended", "available", "pre_request"]).toContain(
    await offer.getAttribute("data-state"),
  );
  await expect(offer.getByTestId("service-offer-action")).toBeVisible();
  await page.getByTestId("tour-next").click();

  // 10 hizmet-sonuc: B's done job, before and after photos from the mirror
  await expectStep(page, "hizmet-sonuc", 10, ["service-request-proof"]);
  await expect(page).toHaveURL(`/portal/hizmetler/${MOWING_JOB}?tur=hizmet-sonuc`);
  await expect(page.getByTestId("service-request-status")).toContainText("Tamamlandı");
  await expectProofPhotos(page);
  await page.getByTestId("tour-next").click();

  // 11 pdf
  await expectStep(page, "pdf", 11, ["report-pdf"]);
  await page.getByTestId("tour-prev").click();
  await expectStep(page, "hizmet-sonuc", 10, ["service-request-proof"]);
  await expectFocusOnStep(page, 10);
  await page.keyboard.press("ArrowRight");
  await expectStep(page, "pdf", 11, ["report-pdf"]);
  await page.getByTestId("tour-next").click();

  // 12 son: the closing card on the same page
  await expectStep(page, "son", 12, ["demo-banner"]);
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

  // Over the session's caps (demo_hit false): the PDF link goes back to its
  // page with a notice, and the tour shows the placeholder with a notice.
  await exhaustDemoCaps([await newestVisitor()]);
  const capped = await pdf(page.request, `${REPORT}/rapor.pdf`);
  expect(capped.res.status()).toBe(303);
  expect(capped.res.headers()["location"]).toBe(`${REPORT}?hata=demo_pdf_limit`);
  await page.goto(`${REPORT}/envanter/rapor.pdf`);
  await expect(page).toHaveURL(`${REPORT}/envanter?hata=demo_pdf_limit`);
  await expect(page.getByTestId("demo-notice")).toContainText("PDF sınırına ulaşıldı");
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await page.goto(`${REPORT}/gezi`);
  await expect(page.getByTestId("demo-notice")).toContainText("görüntü sınırına ulaşıldı");
  await expect(page.getByTestId("tour-viewer")).toHaveAttribute("data-image", "placeholder");

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

test("services: the request form writes nothing, the done job shows its proof", async ({
  page,
}) => {
  await startDemo(page);
  const before = await demoRequests();

  // The offer card's button opens the real request form, unpriced.
  await page.goto(REPORT);
  const offer = page.locator(`[data-testid="service-offer"][data-offer-parcel-id="${PARCEL_A}"]`);
  await offer.getByTestId("service-offer-action").click();
  await expect(page).toHaveURL(/\/portal\/hizmetler\/yeni\?/);
  await expect(page.getByTestId("service-request-summary")).toContainText(
    "Fiyat teklifle bildirilir",
  );
  await expect(page.getByTestId("demo-notice")).toHaveCount(0);

  // Sending it (in season the two consents first) shows the demo notice
  // with "Gerçek hesap aç"; no row is written.
  for (const name of ["pre_information", "terms"]) {
    const box = page.locator(`input[name="${name}"]`);
    if (await box.count()) await box.check();
  }
  await page.getByTestId("service-request-submit").click();
  await expect(page).toHaveURL(/hata=demo_read_only/);
  const notice = page.getByTestId("demo-notice");
  await expect(notice).toContainText("Demoda talep gönderilmez");
  await expect(notice).toContainText("ot biçme talep edin");
  await expect(page.getByTestId("service-request-error")).toHaveCount(0);
  await expect(notice.getByTestId("demo-notice-signup")).toBeVisible();
  expect(await demoRequests()).toBe(before);

  // Hizmetlerim lists the done job; its page has the amount, the payment and
  // the before / after photos.
  await page.goto("/portal/hizmetler");
  await expect(page.getByText("H-2026-000001")).toBeVisible();
  await page.goto(`/portal/hizmetler/${MOWING_JOB}`);
  await expect(page.getByTestId("service-request-quote")).toContainText("3.000");
  await expect(page.getByTestId("service-request-payment")).toBeVisible();
  await expect(page.getByTestId("service-request-cancel-submit")).toHaveCount(0);
  await expectProofPhotos(page);

  // Parcel B's care row says orchadOS did the mowing before the visit.
  await page.goto(`/portal/parsel/${PARCEL_B}`);
  await expect(page.getByTestId("care-own-work")).toBeVisible();

  // "Gerçek hesap aç" on the notice ends the demo like the banner's button.
  await page.goto(`${REPORT}`);
  await offer.getByTestId("service-offer-action").click();
  for (const name of ["pre_information", "terms"]) {
    const box = page.locator(`input[name="${name}"]`);
    if (await box.count()) await box.check();
  }
  await page.getByTestId("service-request-submit").click();
  await page.getByTestId("demo-notice-signup").click();
  await expect(page).toHaveURL("/kayit");
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

test("phone size: all twelve steps fit, and a closed tour restarts", async ({ browser }) => {
  test.setTimeout(180_000);
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

  for (const [i, [id, targets]] of STEPS.entries()) {
    if (i > 0) await page.getByTestId("tour-next").click();
    await expectStep(page, id, i + 1, targets);
    await expect(page.getByTestId("demo-banner")).toBeVisible();
    expect(await noScroll()).toBe(true);
    // The first target shows between the sticky banner and the bottom sheet
    // ("son" points at the banner itself, visible above).
    if (id === "son") continue;
    const top = (await page.getByTestId("demo-banner").boundingBox())!;
    const card = (await step(page).boundingBox())!;
    const box = (await page.getByTestId(targets[0]).first().boundingBox())!;
    expect(Math.max(box.y, top.y + top.height), id).toBeLessThan(card.y);
    expect(box.y + box.height, id).toBeGreaterThan(top.y + top.height);
  }

  // Closed, then started again from the shell header (the banner has no room
  // for "Turu başlat" on a phone).
  await expect(page.getByTestId("demo-tour-start")).toBeHidden();
  await page.getByTestId("tour-close").click();
  await expect(step(page)).toHaveCount(0);
  await page.getByTestId("demo-tour-start-mobile").click();
  await expectStep(page, "bahceler", 1, ["parcel-list"]);
  await expectFocusOnStep(page, 1);

  await page.getByTestId("demo-exit").click();
  await expect(page).toHaveURL("/");
  await context.close();
});

// ---------------------------------------------------------------------------
// The 360° tour viewer itself (docs/panorama-gezi.md, test matrix): on the
// demo dataset, whose newest visit has 40 panoramas with preview and full
// images in the public demo-media mirror.
// ---------------------------------------------------------------------------

const TOUR = `${REPORT}/gezi`;
const DEMO_MEDIA = "**/storage/v1/object/public/demo-media/**";
type ViewerEl = HTMLElement & { __viewer: import("@photo-sphere-viewer/core").Viewer };

async function openTour(page: Page, query = "") {
  await startDemo(page);
  await page.getByTestId("tour-close").click();
  await page.goto(`${TOUR}${query}`);
  const viewer = page.getByTestId("tour-viewer");
  await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
  return viewer;
}

const yawDeg = (viewer: ReturnType<Page["getByTestId"]>) =>
  viewer.evaluate((el) => ((el as ViewerEl).__viewer.getPosition().yaw * 180) / Math.PI);
const zoomLevel = (viewer: ReturnType<Page["getByTestId"]>) =>
  viewer.evaluate((el) => (el as ViewerEl).__viewer.getZoomLevel());

// Walks along a step button (the keyboard twin of the arrows), preferring a
// panorama not seen yet; returns its id once shown.
async function walkStep(page: Page, seen: Set<string>) {
  const viewer = page.getByTestId("tour-viewer");
  const targets = await page
    .getByTestId("tour-steps")
    .getByRole("button")
    .evaluateAll((buttons) => buttons.map((b) => b.getAttribute("data-target")!));
  const target = targets.find((id) => !seen.has(id)) ?? targets[0];
  await page.locator(`[data-testid="tour-steps"] [data-target="${target}"]`).click();
  await expect(viewer).toHaveAttribute("data-panorama", target);
  await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
  seen.add(target);
  return target;
}

test.describe("360° tour viewer", () => {
  test("loads cleanly; markers, steps, keyboard, zoom, fullscreen and the address", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    const viewer = await openTour(page);
    await expect(viewer).toHaveAttribute("data-image", "preview");
    await expect(page.getByTestId("tour-loading")).toHaveCount(0);
    await expect(page.getByTestId("tour-placeholder")).toHaveCount(0);
    const first = (await viewer.getAttribute("data-panorama"))!;
    // Opening leaves the address alone (the guided tour owns ?tur=).
    await expect(page).toHaveURL(TOUR);

    // Accessible names: the viewer region, its toolbar, the step buttons.
    await expect(page.getByRole("region", { name: "Panorama", exact: true })).toBeVisible();
    await expect(viewer).toHaveAttribute("tabindex", "0");
    for (const name of ["Yakınlaştır", "Uzaklaştır", "Tam ekran", "Sağa dön"]) {
      await expect(viewer.getByRole("button", { name, exact: true })).toBeAttached();
    }
    const steps = page.getByRole("navigation", { name: "Yürü" }).getByRole("button");
    expect(await steps.count()).toBeGreaterThan(1);
    await expect(steps.first()).toHaveAccessibleName(/^(Kuzey|Güney|Doğu|Batı)\S*, \d+ m$/);
    const box = (await steps.first().boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);

    // Markers: one arrow per step button, tree markers with their codes.
    await expect(viewer.locator("[data-arrow]")).toHaveCount(await steps.count());
    expect(await viewer.locator("[data-tree]").count()).toBeGreaterThan(0);

    // Keyboard: arrows turn the view only while the viewer has the focus.
    const before = await yawDeg(viewer);
    await page.locator("h1").click();
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(300);
    await page.keyboard.up("ArrowRight");
    expect(await yawDeg(viewer)).toBeCloseTo(before, 3);
    await viewer.focus();
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(400);
    await page.keyboard.up("ArrowRight");
    await expect.poll(() => yawDeg(viewer)).not.toBeCloseTo(before, 1);
    const zoom = await zoomLevel(viewer);
    await page.keyboard.down("PageUp");
    await page.waitForTimeout(300);
    await page.keyboard.up("PageUp");
    await expect.poll(() => zoomLevel(viewer)).toBeGreaterThan(zoom);

    // Zooming in far enough loads the full resolution.
    await viewer.evaluate((el) => (el as ViewerEl).__viewer.zoom(80));
    await expect(viewer).toHaveAttribute("data-image", "full");
    await viewer.evaluate((el) => (el as ViewerEl).__viewer.zoom(20));

    // Fullscreen from the toolbar, and back.
    await viewer.hover();
    await viewer.getByRole("button", { name: "Tam ekran" }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await page.evaluate(() => document.exitFullscreen());
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);

    // A step button walks there and the address follows.
    const seen = new Set([first]);
    const second = await walkStep(page, seen);
    await expect(page).toHaveURL(`${TOUR}?panorama=${second}`);
    expect(await viewer.locator("[data-arrow]").count()).toBeGreaterThan(0);

    // An arrow marker in the panorama does the same.
    const arrow = await viewer.evaluate(
      (el, done) => {
        const v = (el as ViewerEl).__viewer;
        const plugin = v.getPlugin(
          "markers",
        ) as import("@photo-sphere-viewer/markers-plugin").MarkersPlugin;
        const pick =
          plugin
            .getMarkers()
            .find((m) => m.id.startsWith("pano:") && !done.includes(m.id.slice(5))) ??
          plugin.getMarkers().find((m) => m.id.startsWith("pano:"))!;
        v.rotate({ yaw: (pick.config.position as { yaw: number }).yaw, pitch: -0.3 });
        return pick.id.slice(5);
      },
      [...seen],
    );
    await viewer.locator(`[data-arrow="${arrow}"]`).click();
    await expect(viewer).toHaveAttribute("data-panorama", arrow);
    await expect(viewer).toHaveAttribute("data-loaded", "true");
    await expect(page).toHaveURL(`${TOUR}?panorama=${arrow}`);

    // A tree marker zooms on the tree; its panel opens the tree card; Back
    // returns to this panorama.
    const code = await viewer.locator("[data-tree]").first().getAttribute("data-tree");
    await viewer.evaluate((el, treeCode) => {
      const v = (el as ViewerEl).__viewer;
      const plugin = v.getPlugin(
        "markers",
      ) as import("@photo-sphere-viewer/markers-plugin").MarkersPlugin;
      const marker = plugin
        .getMarkers()
        .find((m) => m.config.html?.includes(`data-tree="${treeCode}"`))!;
      // Zoomed in, neighbouring tree labels no longer overlap.
      v.rotate(marker.config.position as { yaw: number; pitch: number });
      v.zoom(100);
    }, code);
    await viewer.locator(`[data-tree="${code}"]`).click();
    await expect(page.getByTestId("tour-tree")).toContainText(code!);
    await page.getByTestId("tour-tree-card").click();
    await expect(page).toHaveURL(new RegExp(`${REPORT}/agac/[0-9a-f-]{36}$`));
    await expect(page.getByTestId("tree-card")).toContainText(code!);
    await page.goBack();
    await expect(page).toHaveURL(`${TOUR}?panorama=${arrow}`);
    await expect(viewer).toHaveAttribute("data-panorama", arrow);
    await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
    await page.goForward();
    await expect(page.getByTestId("tree-card")).toBeVisible();
    await page.goBack();
    await expect(viewer).toHaveAttribute("data-panorama", arrow);

    // A deep link reopens that panorama after a reload.
    await page.reload();
    await expect(viewer).toHaveAttribute("data-panorama", arrow);
    await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });

    expect(errors).toEqual([]);
  });

  test("a deep link opens an older visit; time travel keeps the spot", async ({ page }) => {
    const errors = collectErrors(page);
    const viewer = await openTour(page);
    const newest = (await viewer.getAttribute("data-panorama"))!;
    const visit = page.getByTestId("tour-visit");
    const options = await visit.locator("option").count();
    expect(options).toBeGreaterThan(1);
    await visit.selectOption({ index: options - 1 });
    await expect(viewer).not.toHaveAttribute("data-panorama", newest);
    await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
    const older = (await viewer.getAttribute("data-panorama"))!;
    await expect(page).toHaveURL(`${TOUR}?panorama=${older}`);

    await page.goto(`${TOUR}?panorama=${older}`);
    await expect(viewer).toHaveAttribute("data-panorama", older);
    await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
    await expect(page.getByTestId("tour-visit")).toHaveValue(String(options - 1));
    // An unknown id opens the newest visit's first panorama, not an error.
    await page.goto(`${TOUR}?panorama=00000000-0000-4000-8000-000000000000`);
    await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
    await expect(page.getByTestId("tour-visit")).toHaveValue("0");
    expect(errors).toEqual([]);
  });

  test("missing, refused and slow images: placeholder or loading notice, never a black box", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await startDemo(page);
    await page.getByTestId("tour-close").click();
    const viewer = page.getByTestId("tour-viewer");

    // A transient failure (an expired link, a dropped connection) is retried.
    let failures = 1;
    await page.route(DEMO_MEDIA, (route) =>
      failures-- > 0 ? route.fulfill({ status: 404, body: "" }) : route.continue(),
    );
    await page.goto(TOUR);
    await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
    await expect(viewer).toHaveAttribute("data-image", "preview");
    await page.unroute(DEMO_MEDIA);

    // Every image 404: the placeholder with its note; arrows and trees stay.
    await page.route(DEMO_MEDIA, (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto(TOUR);
    await expect(viewer).toHaveAttribute("data-image", "placeholder", { timeout: 30_000 });
    await expect(viewer).toHaveAttribute("data-loaded", "true");
    await expect(page.getByTestId("tour-placeholder")).toBeVisible();
    await expect(page.getByTestId("tour-loading")).toHaveCount(0);
    expect(await viewer.locator("[data-arrow]").count()).toBeGreaterThan(0);
    await expect(viewer.locator(".psv-overlay")).toBeHidden();

    // Back online: the next panorama loads its real image.
    await page.unroute(DEMO_MEDIA);
    await walkStep(page, new Set());
    await expect(viewer).toHaveAttribute("data-image", "preview");
    await expect(page.getByTestId("tour-placeholder")).toHaveCount(0);

    // The full resolution failing on zoom keeps the preview, without a notice.
    await page.route(DEMO_MEDIA, (route) => route.abort("failed"));
    await viewer.evaluate((el) => (el as ViewerEl).__viewer.zoom(80));
    await page.waitForTimeout(1500);
    await expect(viewer).toHaveAttribute("data-image", "preview");
    await expect(page.getByTestId("tour-placeholder")).toHaveCount(0);
    await viewer.evaluate((el) => (el as ViewerEl).__viewer.zoom(20));

    // Aborted requests on opening: the placeholder too.
    await page.goto(TOUR);
    await expect(viewer).toHaveAttribute("data-image", "placeholder", { timeout: 30_000 });
    await page.unroute(DEMO_MEDIA);

    // A slow image: the loading notice shows over a live viewer, then goes.
    await page.route(DEMO_MEDIA, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.continue();
    });
    await page.goto(TOUR);
    await expect(page.getByTestId("tour-loading")).toHaveText("Panorama yükleniyor…");
    await expect(viewer).toHaveAttribute("aria-busy", "true");
    await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
    await expect(page.getByTestId("tour-loading")).toHaveCount(0);
    await expect(viewer).toHaveAttribute("data-image", "preview");

    // A slow sign request (time travel to an unsigned visit): the previous
    // panorama stays on screen with the notice until the new one is ready.
    await page.route(
      (url) => url.pathname === TOUR,
      async (route) => {
        if (route.request().method() === "POST") {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        await route.continue();
      },
    );
    const visit = page.getByTestId("tour-visit");
    await visit.selectOption({ index: (await visit.locator("option").count()) - 1 });
    await expect(page.getByTestId("tour-loading")).toBeVisible();
    await expect(viewer).toHaveAttribute("data-loaded", "false");
    await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
    await page.unroute(DEMO_MEDIA);
  });

  test("walking through 24 panoramas and in and out of the tour does not leak", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.addInitScript(COUNT_GL);
    const errors = collectErrors(page);
    const viewer = await openTour(page);
    const textures = () => viewerTextures(viewer);
    const gl = () => glContexts(page);
    const start = await gl();
    const startTextures = await textures();

    const seen = new Set([(await viewer.getAttribute("data-panorama"))!]);
    for (let i = 0; i < 24; i += 1) await walkStep(page, seen);
    expect(seen.size).toBeGreaterThan(20);
    // One viewer for the whole walk: no new context, textures disposed.
    expect((await gl()).created).toBe(start.created);
    expect(await textures()).toBeLessThanOrEqual(startTextures + 1);

    // In and out of the tour (client-side navigation): each viewer releases
    // its context when it goes.
    for (let i = 0; i < 6; i += 1) {
      // The page header leads back to the parcel by its name.
      await page.getByRole("link", { name: "Örnek Bahçe – Kuzey", exact: true }).click();
      await expect(page.getByTestId("dimensions")).toBeVisible();
      await page.goBack();
      await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
    }
    expect((await gl()).live).toBeLessThanOrEqual(start.live);
    expect(errors).toEqual([]);
  });

  test("without WebGL the tour explains itself and the map still works", async ({ page }) => {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        // Canvases probed before they are in the page (the viewer's WebGL
        // check, three.js) get none; the map's canvas, created in place, does.
        if (/webgl/.test(type) && !this.isConnected) return null;
        return (getContext as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof getContext;
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await startDemo(page);
    await page.getByTestId("tour-close").click();
    await page.goto(TOUR);
    await expect(page.getByTestId("tour-unsupported")).toContainText("WebGL");
    await expect(page.getByTestId("tour-viewer")).not.toHaveAttribute("tabindex");
    await expect(page.getByTestId("parcel-map")).toHaveAttribute("data-map-ready", "true");
    expect(errors).toEqual([]);
  });
});

test("the tour opens for the parcel's readers only (seeded roles)", async ({ page }) => {
  for (const [email, title] of [
    ["ops@example.com", "Bu bölüme erişiminiz yok"],
    ["expert@example.com", "Bu bölüme erişiminiz yok"],
    ["customer@example.com", "Sayfa bulunamadı"],
    ["owner@example.com", "Sayfa bulunamadı"],
  ] as const) {
    await page.context().clearCookies();
    await page.goto(`/giris?next=${encodeURIComponent(TOUR)}`);
    await page.getByLabel("E-posta").fill(email);
    await page.getByLabel("Parola").fill("orchados-dev");
    await page.getByRole("button", { name: "Giriş yap" }).click();
    await page.waitForURL((url) => url.pathname !== "/giris");
    if (new URL(page.url()).pathname !== TOUR) await page.goto(TOUR);
    await expect(page.getByRole("heading", { name: title }), email).toBeVisible();
    await expect(page.getByTestId("tour-viewer")).toHaveCount(0);
  }
});

test.describe("360° tour on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("touch drag turns, pinch zooms, steps fit", async ({ page }) => {
    const errors = collectErrors(page);
    const viewer = await openTour(page);
    const noScroll = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noScroll()).toBe(true);
    await viewer.scrollIntoViewIfNeeded();
    const box = (await viewer.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(390);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", points: [number, number][]) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: points.map(([x, y], id) => ({ x, y, id })),
      });

    // One finger drags the view.
    const yaw = await yawDeg(viewer);
    await touch("touchStart", [[cx, cy]]);
    for (let i = 1; i <= 8; i += 1) await touch("touchMove", [[cx - i * 15, cy]]);
    await touch("touchEnd", []);
    await expect.poll(() => yawDeg(viewer)).not.toBeCloseTo(yaw, 1);

    // Two fingers apart zoom in.
    const zoom = await zoomLevel(viewer);
    await touch("touchStart", [
      [cx - 20, cy],
      [cx + 20, cy],
    ]);
    for (let i = 1; i <= 8; i += 1) {
      await touch("touchMove", [
        [cx - 20 - i * 12, cy],
        [cx + 20 + i * 12, cy],
      ]);
    }
    await touch("touchEnd", []);
    await expect.poll(() => zoomLevel(viewer)).toBeGreaterThan(zoom);

    // Step buttons are thumb-sized and walk on tap.
    const steps = page.getByTestId("tour-steps").getByRole("button");
    for (const b of await steps.all()) {
      const r = (await b.boundingBox())!;
      expect(r.height).toBeGreaterThanOrEqual(44);
      expect(r.x + r.width).toBeLessThanOrEqual(390);
    }
    const target = (await steps.first().getAttribute("data-target"))!;
    await steps.first().tap();
    await expect(viewer).toHaveAttribute("data-panorama", target);
    await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
    expect(await noScroll()).toBe(true);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3D world (docs/3d-dunya.md): the demo's newest visit of parcel A has a world
// cloud and LiDAR crown measurements (dataset version 4).
// ---------------------------------------------------------------------------

test.describe("3D world", () => {
  test("turns the panorama into the cloud, shows a tree's measurements and comes back", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.addInitScript(COUNT_GL);
    const errors = collectErrors(page);
    const viewer = await openTour(page);
    const panorama = await viewer.getAttribute("data-panorama");
    const yawBefore = await yawDeg(viewer);

    const enter = page.getByTestId("world-enter");
    await expect(enter).toBeVisible();
    expect((await enter.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await enter.click();

    const world = page.getByRole("region", { name: "3D dünya" });
    await expect(world).toBeVisible();
    await expect(world).toBeFocused();
    await expect(page.getByTestId("world")).toHaveAttribute("data-status", "world", {
      timeout: 60_000,
    });
    await expect(page.getByTestId("world-canvas")).toBeVisible();

    // Dragging the world does not turn the panorama under it.
    const box = (await page.getByTestId("world-canvas").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    expect(Math.abs((await yawDeg(viewer)) - yawBefore)).toBeLessThan(0.5);

    // A tree label opens its measurements.
    // The orbit eases out after the drag: wait until the labels stand still.
    const labelPlaces = () =>
      page
        .getByTestId("world-labels")
        .locator("button")
        .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.transform).join("|"));
    await expect
      .poll(
        async () => {
          const before = await labelPlaces();
          await page.waitForTimeout(300);
          return before === (await labelPlaces());
        },
        { timeout: 15_000 },
      )
      .toBe(true);

    // Only the labels nearest to the camera are shown; pick a shown one.
    const label = page
      .getByTestId("world-labels")
      .locator("button:visible", { hasText: " m" })
      .first();
    await expect(label).toBeVisible();
    const code = (await label.textContent())!.split(" · ")[0];
    await label.click();
    const panel = page.getByTestId("world-tree");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(code);
    await expect(page.getByTestId("world-tree-crown")).toContainText("Boy");
    await expect(page.getByTestId("world-tree-crown")).toContainText("Taç çapı");

    // Colour by height: a legend with the range.
    await page.getByTestId("world-mode").selectOption("height");
    await expect(page.getByTestId("world-legend")).toContainText("m");

    // Growth since the previous LiDAR measurement (2025): a diverging legend
    // and the change in the tree's panel.
    await page.getByTestId("world-mode").selectOption("growth");
    await expect(page.getByTestId("world-legend")).toContainText("Kısalan");
    await expect(page.getByTestId("world-tree-growth")).toContainText("önceki ölçüm");

    // Another visit: the 2025 cloud dissolves in, the measurements follow it.
    const world2 = page.getByTestId("world");
    const visitNow = await world2.getAttribute("data-visit");
    const other = await page
      .getByTestId("world-visit")
      .locator("option")
      .evaluateAll(
        (opts, now) => opts.map((o) => (o as HTMLOptionElement).value).find((v) => v !== now),
        visitNow,
      );
    await page.getByTestId("world-visit").selectOption(other!);
    await expect(world2).toHaveAttribute("data-visit", other!);
    await expect(world2).toHaveAttribute("data-pending", "", { timeout: 60_000 });
    // 2025 has no earlier LiDAR visit: growth is not offered, the photo colours return.
    await expect(page.getByTestId("world-mode").locator('option[value="growth"]')).toHaveCount(0);
    await expect(page.getByTestId("world-tree-growth")).toHaveCount(0);
    await page.getByTestId("world-visit").selectOption(visitNow!);
    await expect(world2).toHaveAttribute("data-visit", visitNow!);

    // Escape closes the tree, then the world; the tour is where it was.
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("world")).toHaveCount(0, { timeout: 10_000 });
    await expect(viewer).toHaveAttribute("data-panorama", panorama!);
    expect(Math.abs((await yawDeg(viewer)) - yawBefore)).toBeLessThan(0.5);

    // Open and close again: no live WebGL context piles up.
    const before = (await glContexts(page)).live;
    for (let i = 0; i < 2; i++) {
      await enter.click();
      await expect(page.getByTestId("world")).toHaveAttribute("data-status", "world", {
        timeout: 60_000,
      });
      await page.getByTestId("world-back").click();
      await expect(page.getByTestId("world")).toHaveCount(0, { timeout: 10_000 });
    }
    expect((await glContexts(page)).live).toBeLessThanOrEqual(before);
    expect(errors).toEqual([]);
  });
});
