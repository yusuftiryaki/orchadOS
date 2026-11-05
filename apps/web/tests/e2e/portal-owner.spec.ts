import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addLidarFixture,
  ASSET,
  createPortalFixture,
  FINDING,
  PORTAL,
  purgePortalFixture,
  treeId,
} from "../integration/portal-fixture";
import { resolveSupabaseEnv } from "../local-supabase";

// Owner portal: report card → map → tree card, the 360° tour and a phone-size
// run. The test builds its own parcel with published and unpublished visits
// (tests/integration/portal-fixture.ts) and removes it afterwards.

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const env = resolveSupabaseEnv();
  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await createPortalFixture(admin as never);
  // LiDAR crown values of S1-1 (PUB, OLD) and S1-2 (PUB).
  await addLidarFixture(
    admin as never,
    createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as never,
  );
});
test.afterAll(() => purgePortalFixture());

const REPORT = `/portal/parsel/${PORTAL.parcelA}`;

async function login(page: Page, next?: string) {
  await page.goto(next ? `/giris?next=${encodeURIComponent(next)}` : "/giris");
  await page.getByLabel("E-posta").fill(PORTAL.users.owner);
  await page.getByLabel("Parola").fill(PORTAL.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname !== "/giris");
}

// Clicks the map marker of a slot (through the map instance: no basemap needed).
async function clickSlot(page: Page, code: string) {
  const map = page.getByTestId("parcel-map");
  await expect(map).toHaveAttribute("data-map-ready", "true");
  await map.scrollIntoViewIfNeeded();
  const point = await map.evaluate(async (el, slotCode) => {
    const m = (el as HTMLElement & { __map: import("maplibre-gl").Map }).__map;
    const source = m.getSource("slots") as import("maplibre-gl").GeoJSONSource;
    const data = (await source.getData()) as GeoJSON.FeatureCollection<GeoJSON.Point>;
    const feature = data.features.find((f) => f.properties?.code === slotCode);
    const [lng, lat] = feature!.geometry.coordinates;
    m.jumpTo({ center: [lng, lat], zoom: 20 });
    await new Promise((resolve) => m.once("render", resolve));
    return m.project([lng, lat]);
  }, code);
  await map.click({ position: { x: point.x, y: point.y } });
}

test("owner goes from the garden list to the report card, the map and the tree card", async ({
  page,
}) => {
  await login(page);
  await expect(page).toHaveURL("/portal");
  const garden = page.locator(`[data-parcel-id="${PORTAL.parcelA}"]`);
  await expect(garden).toContainText("Portal Test Bahçesi");
  await expect(garden.getByTestId("last-visit")).toHaveText("1 Eki 2026");
  await expect(garden).toContainText("1 acil bulgu");
  await expect(garden.getByTestId("class-bar")).toBeVisible();
  await garden.getByRole("link", { name: "Karneyi aç" }).click();

  await expect(page).toHaveURL(REPORT);
  const summary = page.getByTestId("report-summary");
  await expect(summary).toContainText("1 Eki 2026 tarihli denetim");
  await expect(summary.getByTestId("tree-count")).toHaveText("5 ağaç");
  await expect(summary.getByTestId("count-healthy")).toContainText("2");
  await expect(summary.getByTestId("count-attention")).toContainText("1");
  await expect(summary.getByTestId("count-problem")).toContainText("1");
  await expect(summary.getByTestId("count-unassessed")).toContainText("1");
  const change = page.getByTestId("report-change");
  await expect(change).toContainText("1 ağaç kötüleşti");
  await expect(change).toContainText("1 ağaç iyileşti");
  await expect(change).toContainText("S1-1");

  // Findings: most severe first; the unpublished one never shows.
  const findings = page.getByTestId("findings").locator("[data-finding-id]");
  await expect(findings).toHaveCount(2);
  await expect(findings.first()).toHaveAttribute("data-finding-id", FINDING.pubTree);
  await expect(page.getByText("Yayımlanmamış bulgu")).toHaveCount(0);
  await expect(page.getByTestId("metrics")).toContainText("Kuru dal");
  await expect(page.getByTestId("visit-history").locator("tbody tr")).toHaveCount(2);

  // Map: tree S1-1 → panel → tree card.
  await clickSlot(page, "S1-1");
  const panel = page.getByTestId("tree-panel");
  await expect(panel.getByRole("heading")).toHaveText("S1-1");
  await expect(panel).toContainText("Dikkat");
  await expect(panel.getByTestId("approval")).toHaveText(/Uzman onaylı/);
  await panel.getByRole("link", { name: "Ağaç karnesini aç" }).click();

  await expect(page).toHaveURL(`${REPORT}/agac/${treeId("S1-1")}`);
  const card = page.getByTestId("tree-card");
  await expect(card.getByRole("heading", { level: 1 })).toHaveText("S1-1");
  await expect(card.getByTestId("tree-class")).toHaveText("Dikkat");
  await expect(card.getByTestId("approval")).toHaveText(/Uzman onaylı/);
  await expect(card.getByTestId("class-history").locator("tbody tr")).toHaveCount(2);
  await expect(card.getByTestId("measurement-history")).toContainText("2 / 3");

  // Photos: the stored crop loads; the missing one is a placeholder.
  const photos = card.getByTestId("photo-history");
  const stored = photos.locator(`[data-photo-id="${ASSET.cropPubN}"] img`);
  await expect(stored).toBeVisible();
  await expect
    .poll(() => stored.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBe(8);
  await expect(photos.locator(`[data-photo-id="${ASSET.cropPubS}"]`)).toContainText("Görüntü yok");
  await expect(photos.locator("[data-visit-id]")).toHaveCount(2);

  // LiDAR: the crown drawn over the crops (PUB with the crown base, OLD
  // without), none over a missing image; the values also in the table.
  const guideOf = (assetId: string) =>
    photos.locator(`[data-photo-id="${assetId}"] [data-testid="crop-guide"]`);
  const guide = guideOf(ASSET.cropPubN);
  await expect(guide).toBeVisible();
  await expect(guide).toHaveAttribute("aria-hidden", "true");
  await expect(guide).toContainText("Boy 4,4 m");
  await expect(guide).toContainText("Taç çapı 4,6 m");
  await expect(guide.locator('[data-guide="base"]')).toHaveCount(1);
  // Real coordinates: the frame aspect must reach the server component as a
  // number (a constant imported from a "use client" module would not).
  const points = await guide
    .locator("polyline")
    .evaluateAll((lines) => lines.map((l) => l.getAttribute("points") ?? ""));
  expect(points.length).toBeGreaterThan(0);
  for (const p of points) {
    expect(p).not.toContain("NaN");
  }
  // The vertical height line sits at the crop centre (x = 0.5).
  expect(await guide.locator('[data-guide="height"]').getAttribute("points")).toMatch(/(^| )0\.5,/);
  await expect(guideOf(ASSET.cropOldN)).toContainText("Boy 4,1 m");
  await expect(guideOf(ASSET.cropOldN).locator('[data-guide="base"]')).toHaveCount(0);
  await expect(guideOf(ASSET.cropPubS)).toHaveCount(0);
  const table = card.getByTestId("measurement-history");
  await expect(table).toContainText("4,4 ± 0,1 m");
  await expect(table).toContainText("38,2 ± 3 m³");
  await expect(table).not.toContainText("Taç tabanı");
  await expect(card).toContainText("Çizim, tarama sırasında ölçülen değerlerden çizilir");
  const toggle = card.getByTestId("crop-guide-toggle");
  await expect(toggle).toHaveText("Ölçüleri gizle");
  await toggle.click();
  await expect(guide).toBeHidden();
  await expect(toggle).toHaveText("Ölçüleri göster");
  await toggle.click();
  await expect(guide).toBeVisible();
});

test("class filter and the parcel-level finding on the map", async ({ page }) => {
  await login(page, `${REPORT}?sinif=problem#harita`);
  const filter = (state: string) => page.locator(`button[data-state="${state}"]`);
  await expect(filter("problem")).toHaveAttribute("aria-pressed", "true");
  await expect(filter("healthy")).toHaveAttribute("aria-pressed", "false");
  await expect(filter("healthy")).toContainText("(3)");

  await page.goto(`${REPORT}?bulgu=${FINDING.pubParcel}#harita`);
  const panel = page.getByTestId("finding-panel");
  await expect(panel).toContainText("Kuyu yanında su birikintisi.");
  await expect(panel).toContainText("Bahçe geneli");
});

test("unpublished results stay hidden on the tree card", async ({ page }) => {
  await login(page, `${REPORT}/agac/${treeId("S1-3")}`);
  const card = page.getByTestId("tree-card");
  await expect(card.getByTestId("tree-class")).toHaveText("Sağlıklı");
  await expect(card).toContainText("Bu ağaç için bulgu yok.");
  // The unpublished class "Kuru" and finding "Kuru ağaç"; "Kuru dal" is a metric name.
  await expect(card).not.toContainText(/\bKuru\b(?! dal)/);
});

test("360° tour opens near the tree and walks to the next panorama", async ({ page }) => {
  await login(page, `${REPORT}/gezi?agac=${treeId("S1-1")}`);
  const viewer = page.getByTestId("tour-viewer");
  await expect(viewer).toHaveAttribute("data-panorama", ASSET.panoPubFull, { timeout: 30_000 });
  // Preview first; the full image comes on zoom.
  await expect(viewer).toHaveAttribute("data-image", "preview", { timeout: 30_000 });

  // Zooming in loads the full-resolution image; the view stays where it was.
  await viewer.evaluate((el) =>
    (el as HTMLElement & { __viewer: import("@photo-sphere-viewer/core").Viewer }).__viewer.zoom(
      80,
    ),
  );
  await expect(viewer).toHaveAttribute("data-image", "full");
  await viewer.evaluate((el) =>
    (el as HTMLElement & { __viewer: import("@photo-sphere-viewer/core").Viewer }).__viewer.zoom(
      20,
    ),
  );

  // Turned towards S1-1, which sits to the south-west of the panorama.
  const yaw = await viewer.evaluate(
    (el) =>
      (
        el as HTMLElement & { __viewer: import("@photo-sphere-viewer/core").Viewer }
      ).__viewer.getPosition().yaw,
  );
  // Heading 90°, tree at azimuth 225° → yaw 135°.
  expect((yaw * 180) / Math.PI).toBeCloseTo(135, 0);
  await expect(viewer.locator('[data-tree="S1-1"]')).toHaveCount(1);

  // Focusing S1-1: its LiDAR values in the panel and the crown drawn on the
  // panorama for that tree only.
  await viewer.locator('[data-tree="S1-1"]').click();
  const crown = page.getByTestId("tour-tree-crown");
  await expect(crown).toContainText("Boy4,4 ± 0,1 m");
  await expect(crown).toContainText("Taç çapı4,6 ± 0,2 m");
  await expect(crown).toContainText("Taç hacmi38,2 ± 3 m³");
  await expect
    .poll(() => markerIds(viewer))
    .toEqual(
      expect.arrayContaining(["crown:height", "crown:bracket", "crown:base", "crown:label:height"]),
    );
  await expect(viewer.locator('[data-crown-label="height"]')).toHaveText("Boy 4,4 m");
  await page.getByTestId("tour-tree-close").click();
  await expect(crown).toHaveCount(0);
  await expect.poll(() => markerIds(viewer)).not.toContain("crown:height");
  // Back at the overview before turning the view (the animation would undo it).
  await expect.poll(() => zoomOf(viewer)).toBeCloseTo(20, 0);

  // The arrow to the panorama 8 m east; its image is missing → placeholder.
  await viewer.evaluate((el) =>
    (el as HTMLElement & { __viewer: import("@photo-sphere-viewer/core").Viewer }).__viewer.rotate({
      yaw: 0,
      pitch: -0.3,
    }),
  );
  await viewer.locator(`[data-arrow="${ASSET.panoPub2}"]`).click();
  await expect(viewer).toHaveAttribute("data-panorama", ASSET.panoPub2);
  await expect(viewer).toHaveAttribute("data-image", "placeholder");
  await expect(page.getByTestId("tour-placeholder")).toBeVisible();

  // Walking returned to the overview zoom.
  expect(await zoomOf(viewer)).toBeCloseTo(20, 0);

  // A tree marker turns to the tree and zooms on it, with its panel.
  await viewer.evaluate((el) =>
    (el as HTMLElement & { __viewer: import("@photo-sphere-viewer/core").Viewer }).__viewer.rotate({
      // S1-2 is south-west of this panorama: azimuth 225°, heading 90°.
      yaw: (100 * Math.PI) / 180,
      pitch: 0,
    }),
  );
  await viewer.locator('[data-tree="S1-2"]').click();
  const panel = page.getByTestId("tour-tree");
  await expect(panel).toContainText("S1-2");
  await expect(panel).toHaveAttribute("data-tree-id", treeId("S1-2"));
  await expect.poll(() => zoomOf(viewer)).toBeGreaterThan(30);
  await expect.poll(() => yawOf(viewer)).toBeCloseTo(135, 0);
  await expect(viewer.locator('[data-tree="S1-2"]')).toHaveAttribute("data-focused", "true");

  // Escape goes back to the overview; the panel closes.
  await page.getByTestId("tour-tree-close").focus();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect.poll(() => zoomOf(viewer)).toBeCloseTo(20, 0);

  // A double click zooms one step towards that point; the overview button
  // comes back.
  const box = (await viewer.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 3);
  await expect.poll(() => zoomOf(viewer)).toBeCloseTo(50, 0);
  await page.getByTestId("tour-overview").click();
  await expect.poll(() => zoomOf(viewer)).toBeCloseTo(20, 0);
  await expect(page.getByTestId("tour-overview")).toHaveCount(0);

  // The focused tree's panel opens the tree card.
  await viewer.evaluate((el) =>
    (el as HTMLElement & { __viewer: import("@photo-sphere-viewer/core").Viewer }).__viewer.rotate({
      yaw: (135 * Math.PI) / 180,
      pitch: 0,
    }),
  );
  await viewer.locator('[data-tree="S1-2"]').click();
  await page.getByTestId("tour-tree-card").click();
  await expect(page).toHaveURL(`${REPORT}/agac/${treeId("S1-2")}`);
});

type ViewerEl = HTMLElement & { __viewer: import("@photo-sphere-viewer/core").Viewer };

function zoomOf(viewer: Locator) {
  return viewer.evaluate((el) => (el as ViewerEl).__viewer.getZoomLevel());
}

function markerIds(viewer: Locator) {
  return viewer.evaluate((el) =>
    (
      (el as ViewerEl).__viewer.getPlugin(
        "markers",
      ) as import("@photo-sphere-viewer/markers-plugin").MarkersPlugin
    )
      .getMarkers()
      .map((m) => m.id),
  );
}

function yawOf(viewer: Locator) {
  return viewer.evaluate((el) => ((el as ViewerEl).__viewer.getPosition().yaw * 180) / Math.PI);
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("report card, map and tree card fit a narrow screen", async ({ page }) => {
    await login(page, REPORT);
    await expect(page.getByTestId("report-summary")).toBeVisible();
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    // Map above the panel; tapping a tree brings the panel into view.
    await clickSlot(page, "S2-1");
    const panel = page.getByTestId("tree-panel");
    await expect(panel.getByRole("heading")).toHaveText("S2-1");
    await expect(panel).toBeInViewport();
    await expect(panel).toContainText("Sorunlu");

    // A finding in the list goes straight to its tree.
    await page.locator(`[data-finding-id="${FINDING.pubTree}"] a`).click();
    await expect(page).toHaveURL(`${REPORT}/agac/${treeId("S2-1")}`);
    await expect(page.getByTestId("tree-findings")).toContainText("kuru dal");
    expect(await overflow()).toBeLessThanOrEqual(0);
  });
});

test("the report card downloads as a PDF", async ({ page }) => {
  await login(page, REPORT);
  await expect(page.getByTestId("report-pdf")).toBeVisible();
  const pdf = await page.request.get(`${REPORT}/rapor.pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-disposition"]).toContain(".pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
