import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createInventoryFixture,
  INVENTORY_TEST,
  purgeInventoryFixture,
} from "./inventory-fixtures";
import { createMapFixture, MAP_TEST, mapAdmin, purgeMapFixture } from "./map-fixtures";
import {
  featureState,
  login,
  mapReady,
  mapView,
  NETWORK_ERROR,
  pixelOf,
  pixelsOf,
  registry,
  rendered,
  sourcePoints,
  stubTiles,
  trackErrors,
} from "./map-helpers";

// Every MapLibre map of the web app (docs/haritalar.md): renders without
// console errors, fits its data, selects features, draws and edits a
// boundary, works from the keyboard and on a phone, survives a failing
// basemap and a browser without WebGL, stays responsive with 5000 trees, and
// does not leak map instances. Seed data plus the parcels of map-fixtures.ts.

const SEED_PARCEL = "c0000000-0000-4000-8000-000000000001";
const APPLICATION = "91200000-0000-4000-8000-000000000301";
const OWNER = "owner@example.com";
const EXPERT = "expert@example.com";
const OPS = "ops@example.com";

test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await createMapFixture();
  await createInventoryFixture(mapAdmin());
});
test.afterAll(async () => {
  await purgeMapFixture();
  await purgeInventoryFixture();
});

test.beforeEach(async ({ page }) => {
  await stubTiles(page);
});

// The parcel-map's slots all lie inside the map's view.
async function expectFitsSlots(map: Locator) {
  const [view, slots] = await Promise.all([mapView(map), sourcePoints(map, "slots")]);
  expect(slots.length).toBeGreaterThan(0);
  const [w, s, e, n] = view.bounds;
  for (const {
    coordinates: [x, y],
  } of slots) {
    expect(x).toBeGreaterThanOrEqual(w);
    expect(x).toBeLessThanOrEqual(e);
    expect(y).toBeGreaterThanOrEqual(s);
    expect(y).toBeLessThanOrEqual(n);
  }
  // Fitted, not the overview of the region.
  expect(view.zoom).toBeGreaterThan(14);
}

async function expectAccessibleControls(map: Locator) {
  await expect(map.getByRole("button", { name: "Yakınlaştır" })).toBeVisible();
  await expect(map.getByRole("button", { name: "Uzaklaştır" })).toBeVisible();
  const label = await map.locator("canvas.maplibregl-canvas").getAttribute("aria-label");
  expect(label?.trim()).toBeTruthy();
  expect(label).not.toBe("Map");
}

async function clickSlot(page: Page, map: Locator, code: string) {
  const slot = (await sourcePoints(map, "slots")).find((s) => s.properties?.code === code)!;
  const px = await pixelOf(map, slot.coordinates, 20);
  await map.click({ position: px });
  return slot.properties!.slotId as string;
}

test.describe("each map renders, fits and labels its controls", () => {
  const cases: { name: string; user: string; path: string; testId: string; slots?: boolean }[] = [
    {
      name: "owner health map",
      user: OWNER,
      path: `/portal/parsel/${SEED_PARCEL}`,
      testId: "parcel-map",
      slots: true,
    },
    {
      name: "expert parcel map",
      user: EXPERT,
      path: `/uzman/parsel/${SEED_PARCEL}`,
      testId: "parcel-map",
      slots: true,
    },
    {
      name: "ops parcel map",
      user: OPS,
      path: `/operasyon/parsel/${SEED_PARCEL}`,
      testId: "parcel-map",
      slots: true,
    },
    {
      name: "ops boundary drawing",
      user: OPS,
      path: "/operasyon/parsel/yeni",
      testId: "boundary-map",
    },
    {
      name: "ops new boundary version",
      user: OPS,
      path: `/operasyon/parsel/${SEED_PARCEL}/sinir`,
      testId: "boundary-map",
    },
    {
      name: "back office gardens map",
      user: OPS,
      path: `/operasyon/basvuru/${APPLICATION}`,
      testId: "gardens-map",
    },
  ];
  for (const c of cases) {
    test(c.name, async ({ page }) => {
      const errors = trackErrors(page);
      await login(page, c.user, c.path);
      await expect(page).toHaveURL(c.path);
      const map = page.getByTestId(c.testId).first();
      await mapReady(map);
      await rendered(map);
      await expectAccessibleControls(map);
      if (c.slots) await expectFitsSlots(map);
      const view = await mapView(map);
      expect(view.canvas.w).toBeGreaterThan(200);
      expect(Math.abs(view.canvas.w - view.container.w)).toBeLessThanOrEqual(2);
      // Tiles answered: no degraded-basemap message.
      await expect(page.getByTestId("map-status")).toHaveCount(0);
      errors.expectNone();
    });
  }
});

test.describe("inventory maps", () => {
  const I = INVENTORY_TEST;

  test("office workspace: renders, selects a slot as feature state, shows codes", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await login(page, I.users.field, `/ofis/parsel/${I.parcel}/envanter/duzenle`);
    const map = page.getByTestId("workspace-map");
    await mapReady(map);
    await expectAccessibleControls(map);
    await expect.poll(async () => (await sourcePoints(map, "slots")).length).toBe(6);
    const slot = (await sourcePoints(map, "slots")).find((s) => s.properties?.code === "S2-3")!;
    await map.click({ position: await pixelOf(map, slot.coordinates, 21) });
    await expect(page.getByTestId("attribute-selected")).toHaveText("1 ağaç seçili");
    expect(await featureState(map, "slots", slot.properties!.id as string)).toMatchObject({
      selected: true,
    });
    // Selection is not in the source data (no resend of every slot).
    expect(slot.properties).not.toHaveProperty("selected");
    await page.getByLabel("Kodları göster").check();
    await rendered(map);
    errors.expectNone();
  });

  test("expert approval map renders without errors", async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, I.users.expert, `/uzman/envanter/${I.session}`);
    const map = page.getByTestId("approval-map");
    await mapReady(map);
    await expectAccessibleControls(map);
    await expect.poll(async () => (await sourcePoints(map, "slots")).length).toBe(6);
    errors.expectNone();
  });

  test("owner boundary card map renders without errors", async ({ page }) => {
    const errors = trackErrors(page);
    await login(page, I.users.owner, `/portal/parsel/${I.parcel}`);
    const map = page.getByTestId("boundary-card").getByTestId("boundary-map");
    await mapReady(map);
    await expectAccessibleControls(map);
    errors.expectNone();
  });
});

test("owner health map: select a tree, feature state, keyboard zoom and pan", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, OWNER, `/portal/parsel/${SEED_PARCEL}`);
  const map = page.getByTestId("parcel-map");
  await mapReady(map);

  const first = await clickSlot(page, map, "S5-12");
  const panel = page.getByTestId("tree-panel");
  await expect(panel.getByRole("heading")).toHaveText("S5-12");
  expect(await featureState(map, "slots", first)).toMatchObject({ selected: true });

  // Selecting another moves the highlight; the data is not resent.
  const second = await clickSlot(page, map, "S5-13");
  await expect(panel.getByRole("heading")).toHaveText("S5-13");
  expect(await featureState(map, "slots", first)).toMatchObject({ selected: false });
  expect(await featureState(map, "slots", second)).toMatchObject({ selected: true });

  // Keyboard: the canvas takes focus; + zooms in, an arrow pans.
  const canvas = map.locator("canvas.maplibregl-canvas");
  await canvas.focus();
  await expect(canvas).toBeFocused();
  const before = await mapView(map);
  await page.keyboard.press("Minus");
  await expect.poll(async () => (await mapView(map)).zoom).toBeLessThan(before.zoom - 0.5);
  const zoomed = await mapView(map);
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await mapView(map)).center[0]).toBeGreaterThan(zoomed.center[0]);

  // The zoom buttons are reachable with Tab and work with Enter.
  const zoomIn = map.getByRole("button", { name: "Yakınlaştır" });
  await zoomIn.focus();
  const z0 = (await mapView(map)).zoom;
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await mapView(map)).zoom).toBeGreaterThan(z0 + 0.5);
  errors.expectNone();
});

test("expert parcel map: a click selects and the panel closes", async ({ page }) => {
  await login(page, EXPERT, `/uzman/parsel/${SEED_PARCEL}`);
  const map = page.getByTestId("parcel-map");
  await mapReady(map);
  const id = await clickSlot(page, map, "S5-12");
  const panel = page.getByTestId("tree-panel");
  await expect(panel.getByRole("heading")).toHaveText("S5-12");
  expect(await featureState(map, "slots", id)).toMatchObject({ selected: true });
  await panel.getByRole("button").first().click();
  await expect(panel).toHaveCount(0);
  await expect.poll(() => featureState(map, "slots", id)).toMatchObject({ selected: false });
});

// A square of about 60 x 60 m near Gaziantep and a bow tie.
const SQUARE: [number, number][] = [
  [37.4, 37.06],
  [37.4007, 37.06],
  [37.4007, 37.0605],
  [37.4, 37.0605],
];

async function hiddenRing(page: Page): Promise<[number, number][]> {
  const value = await page.locator('input[name="boundary"]').inputValue();
  return value ? JSON.parse(value) : [];
}

test("boundary drawing: add, select, drag, delete, keyboard, invalid ring, mode switch", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await login(page, OPS, "/operasyon/parsel/yeni");
  const map = page.getByTestId("boundary-map");
  await mapReady(map);
  const points = page.getByTestId("boundary-points");

  // Add four corners.
  const px = await pixelsOf(map, SQUARE);
  for (const p of px) await map.click({ position: p });
  await expect(points).toHaveText("4 köşe");
  await expect(page.getByTestId("boundary-area")).toContainText("dönüm");
  const drawn = await hiddenRing(page);
  drawn.forEach(([x, y], i) => {
    // A click lands on a whole pixel: within about a metre.
    expect(x).toBeCloseTo(SQUARE[i][0], 4);
    expect(y).toBeCloseTo(SQUARE[i][1], 4);
  });

  // A click on a corner selects it instead of stacking a fifth one on it.
  await map.click({ position: px[2] });
  await expect(points).toHaveText("4 köşe");
  await expect(map).toHaveAttribute("data-selected-vertex", "2");
  await expect(page.getByTestId("vertex-bar")).toContainText("3. köşe seçili");

  // Drag corner 3 outwards: the ring changes, still 4 corners, larger area.
  const areaBefore = await page.getByTestId("boundary-area").textContent();
  const box = (await map.boundingBox())!;
  await page.mouse.move(box.x + px[2].x, box.y + px[2].y);
  await page.mouse.down();
  await page.mouse.move(box.x + px[2].x + 30, box.y + px[2].y - 30, { steps: 5 });
  await page.mouse.up();
  await expect(points).toHaveText("4 köşe");
  await expect.poll(async () => (await hiddenRing(page))[2][0]).toBeGreaterThan(SQUARE[2][0]);
  expect((await hiddenRing(page))[0]).toEqual(drawn[0]);
  await expect(page.getByTestId("boundary-area")).not.toHaveText(areaBefore!);

  // Delete the selected corner with the button.
  await page.getByRole("button", { name: "Seçili köşeyi sil" }).click();
  await expect(points).toHaveText("3 köşe");
  await expect(page.getByTestId("vertex-bar")).toHaveCount(0);

  // Keyboard: Enter puts a corner at the centre; select one and Delete it.
  const canvas = map.locator("canvas.maplibregl-canvas");
  await canvas.focus();
  await page.keyboard.press("Enter");
  await expect(points).toHaveText("4 köşe");
  const center = (await mapView(map)).center;
  const last = (await hiddenRing(page))[3];
  expect(last[0]).toBeCloseTo(center[0], 5);
  expect(last[1]).toBeCloseTo(center[1], 5);
  const px0 = await pixelOf(map, (await hiddenRing(page))[0]);
  await map.click({ position: px0 });
  await expect(map).toHaveAttribute("data-selected-vertex", "0");
  await canvas.focus();
  await page.keyboard.press("Delete");
  await expect(points).toHaveText("3 köşe");
  await page.keyboard.press("Escape");

  // A bow tie is refused with a clear message.
  await page.getByRole("button", { name: "Sınırı temizle" }).click();
  await expect(points).toHaveText("0 köşe");
  const bow = await pixelsOf(map, [SQUARE[0], SQUARE[2], SQUARE[1], SQUARE[3]]);
  for (const p of bow) await map.click({ position: p });
  await expect(
    page.getByRole("status").filter({ hasText: "Sınır kendini kesiyor." }),
  ).toBeVisible();
  await expect(page.getByTestId("boundary-area")).toHaveCount(0);

  // Switching to the location mode keeps the map working (MapLibre's own
  // classes stay on the container) and a click sets the location.
  await page.getByRole("button", { name: "Konum", exact: true }).click();
  await expect(map).toHaveAttribute("data-mode", "position");
  await expect(map).toHaveClass(/maplibregl-map/);
  await rendered(map);
  const mid = (await map.boundingBox())!;
  await map.click({ position: { x: mid.width / 2, y: mid.height / 2 } });
  await expect.poll(() => sourcePoints(map, "draw-position")).toHaveLength(1);
  await expect(points).toHaveText("4 köşe");
  errors.expectNone();
});

test("a new boundary version is saved and shown again after a reload", async ({ page }) => {
  await login(page, OPS, `/operasyon/parsel/${MAP_TEST.empty}/sinir`);
  const map = page.getByTestId("boundary-map");
  await mapReady(map);
  // The previous version is drawn dimmed for orientation.
  await expect
    .poll(() =>
      map.evaluate((el) =>
        Boolean(
          (el as never as { __map: import("maplibre-gl").Map }).__map.getSource("draw-context"),
        ),
      ),
    )
    .toBe(true);

  for (const p of await pixelsOf(map, SQUARE)) await map.click({ position: p });
  await expect(page.getByTestId("boundary-points")).toHaveText("4 köşe");
  const ring = await hiddenRing(page);
  await page.getByRole("button", { name: "Sınırı kaydet" }).click();
  await expect(page).toHaveURL(new RegExp(`/operasyon/parsel/${MAP_TEST.empty}\\?`));

  const { data } = await mapAdmin()
    .from("boundary")
    .select("version, geom::json")
    .eq("parcel_id", MAP_TEST.empty)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  expect(data!.version).toBe(2);
  const stored = (data!.geom as unknown as GeoJSON.Polygon).coordinates[0];
  expect(stored).toHaveLength(5);
  stored.slice(0, 4).forEach(([x, y], i) => {
    expect(x).toBeCloseTo(ring[i][0], 6);
    expect(y).toBeCloseTo(ring[i][1], 6);
  });

  // Reload the boundary page: the saved ring is the new context.
  await page.goto(`/operasyon/parsel/${MAP_TEST.empty}/sinir`);
  await mapReady(map);
  const context = await map.evaluate(async (el) => {
    const m = (el as never as { __map: import("maplibre-gl").Map }).__map;
    const src = m.getSource("draw-context") as import("maplibre-gl").GeoJSONSource;
    const f = (await src.getData()) as GeoJSON.Feature<GeoJSON.Polygon>;
    return f.geometry.coordinates[0];
  });
  expect(context[0][0]).toBeCloseTo(ring[0][0], 6);
  expect(context[2][1]).toBeCloseTo(ring[2][1], 6);
});

test("an empty parcel shows its boundary and a helpful empty state", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, OWNER, `/portal/parsel/${MAP_TEST.empty}`);
  const map = page.getByTestId("parcel-map");
  await mapReady(map);
  await expect(map).toHaveAttribute("data-slot-count", "0");
  await expect(page.getByTestId("map-status-empty")).toHaveText(
    "Bu bahçede henüz ağaç kaydı yok. Envanter tamamlanınca ağaçlar haritada görünür.",
  );
  // Fitted to the boundary, not the overview of the region.
  expect((await mapView(map)).zoom).toBeGreaterThan(14);
  errors.expectNone();
});

test("a basemap that cannot be fetched degrades with a message; the trees still show", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await stubTiles(page, "abort");
  await login(page, OWNER, `/portal/parsel/${SEED_PARCEL}`);
  const map = page.getByTestId("parcel-map");
  await mapReady(map);
  await expect(page.getByTestId("map-status")).toContainText("Altlık harita yüklenemedi");
  await rendered(map);
  const drawn = await map.evaluate(
    (el) =>
      (el as never as { __map: import("maplibre-gl").Map }).__map.queryRenderedFeatures({
        layers: ["slots"],
      }).length,
  );
  expect(drawn).toBeGreaterThan(0);
  // A tree can still be selected.
  await clickSlot(page, map, "S5-12");
  await expect(page.getByTestId("tree-panel").getByRole("heading")).toHaveText("S5-12");
  // Only the browser's own network lines; MapLibre does not log the tiles.
  errors.expectNone([NETWORK_ERROR]);
});

test("a server error for tiles degrades the same way", async ({ page }) => {
  await stubTiles(page, "500");
  await login(page, OPS, "/operasyon/parsel/yeni");
  await mapReady(page.getByTestId("boundary-map"));
  await expect(page.getByTestId("map-status")).toContainText("Altlık harita yüklenemedi");
});

test("without WebGL the page explains it and the rest still works", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type.startsWith("webgl")) return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  const errors = trackErrors(page);
  await login(page, OWNER, `/portal/parsel/${SEED_PARCEL}`);
  await expect(page.getByTestId("map-status")).toContainText("WebGL");
  await expect(page.getByTestId("parcel-map")).not.toHaveAttribute("data-map-ready", "true");
  // The report around the map is intact.
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  errors.expectNone();
});

test("resizing the window resizes the map canvas", async ({ page }) => {
  await login(page, OWNER, `/portal/parsel/${SEED_PARCEL}`);
  const map = page.getByTestId("parcel-map");
  await mapReady(map);
  for (const width of [900, 1400, 700]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(async () => {
        const v = await mapView(map);
        return Math.abs(v.canvas.w - v.container.w);
      })
      .toBeLessThanOrEqual(2);
  }
});

test("5000 trees: loads, selects and filters without stalling", async ({ page }) => {
  const errors = trackErrors(page);
  await login(page, OWNER, "/portal");
  const t0 = Date.now();
  await page.goto(`/portal/parsel/${MAP_TEST.large}`);
  const map = page.getByTestId("parcel-map");
  await mapReady(map);
  const loadMs = Date.now() - t0;
  await expect(map).toHaveAttribute("data-slot-count", "5000");
  expect((await sourcePoints(map, "slots")).length).toBe(5000);

  // Click a tree in the middle; the panel follows quickly.
  const slots = await sourcePoints(map, "slots");
  const target = slots[2550];
  const px = await pixelOf(map, target.coordinates, 20);
  const t1 = Date.now();
  await map.click({ position: px });
  await expect(page.getByTestId("tree-panel").getByRole("heading")).toHaveText(
    target.properties!.code as string,
  );
  const clickMs = Date.now() - t1;

  // Toggle a class filter: the map applies it as a layer filter.
  const t2 = Date.now();
  await page.locator('button[data-state="unassessed"]').click();
  await expect(page.locator('button[data-state="unassessed"]')).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await rendered(map);
  const filterMs = Date.now() - t2;

  // Pan at the overview zoom: frames keep coming.
  const fps = await map.evaluate(async (el) => {
    const m = (el as never as { __map: import("maplibre-gl").Map }).__map;
    m.jumpTo({ zoom: 16 });
    let frames = 0;
    const count = () => frames++;
    m.on("render", count);
    const start = performance.now();
    m.easeTo({ center: [m.getCenter().lng + 0.002, m.getCenter().lat], duration: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    m.off("render", count);
    return (frames * 1000) / (performance.now() - start);
  });
  console.log(
    `maps perf (5000 trees): load ${loadMs} ms, click ${clickMs} ms, filter ${filterMs} ms, pan ${fps.toFixed(0)} fps`,
  );
  // Generous budgets for a shared CI runner with software WebGL.
  expect(loadMs).toBeLessThan(15_000);
  expect(clickMs).toBeLessThan(3_000);
  expect(filterMs).toBeLessThan(3_000);
  expect(fps).toBeGreaterThan(5);
  errors.expectNone();
});

test("navigating between parcels does not leak maps or WebGL contexts", async ({ page }) => {
  await login(page, OWNER, "/portal");
  const open = async (parcelId: string) => {
    await page
      .locator(`[data-parcel-id="${parcelId}"]`)
      .getByRole("link", { name: "Karneyi aç" })
      .click();
    await expect(page).toHaveURL(`/portal/parsel/${parcelId}`);
    await mapReady(page.getByTestId("parcel-map"));
  };
  for (let round = 0; round < 3; round++) {
    for (const id of [SEED_PARCEL, MAP_TEST.empty, MAP_TEST.large]) {
      await open(id);
      const r = await registry(page);
      expect(r.live).toBe(r.canvases);
      expect(r.lost).toBe(0);
      expect(r.created - r.removed).toBe(r.live);
      await page.goBack();
      await expect(page).toHaveURL("/portal");
      await expect.poll(async () => (await registry(page)).live).toBe(0);
    }
  }
  const r = await registry(page);
  // One page visit at a time: every map created was removed again.
  expect(r.created).toBeGreaterThanOrEqual(9);
  expect(r.removed).toBe(r.created);
  expect(r.canvases).toBe(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the health map fits the screen, has finger-sized controls and a tap selects", async ({
    page,
  }) => {
    const errors = trackErrors(page);
    await login(page, OWNER, `/portal/parsel/${SEED_PARCEL}`);
    const map = page.getByTestId("parcel-map");
    await mapReady(map);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scroll).toBeLessThanOrEqual(390);
    const zoomIn = map.getByRole("button", { name: "Yakınlaştır" });
    const size = (await zoomIn.boundingBox())!;
    expect(size.width).toBeGreaterThanOrEqual(44);
    expect(size.height).toBeGreaterThanOrEqual(44);

    await map.scrollIntoViewIfNeeded();
    const slot = (await sourcePoints(map, "slots")).find((s) => s.properties?.code === "S5-12")!;
    const px = await pixelOf(map, slot.coordinates, 20);
    const box = (await map.boundingBox())!;
    await page.touchscreen.tap(box.x + px.x, box.y + px.y);
    await expect(page.getByTestId("tree-panel").getByRole("heading")).toHaveText("S5-12");
    errors.expectNone();
  });

  test("corners are drawn with taps and dragged with a finger", async ({ page }) => {
    await login(page, OPS, "/operasyon/parsel/yeni");
    const map = page.getByTestId("boundary-map");
    await mapReady(map);
    await map.scrollIntoViewIfNeeded();
    const px = await pixelsOf(map, SQUARE);
    const box = (await map.boundingBox())!;
    for (const p of px) await page.touchscreen.tap(box.x + p.x, box.y + p.y);
    await expect(page.getByTestId("boundary-points")).toHaveText("4 köşe");

    // A finger drag on a corner moves it (CDP touch events).
    const before = (await hiddenRing(page))[1];
    const cdp = await page.context().newCDPSession(page);
    const at = (dx: number) => [{ x: box.x + px[1].x + dx, y: box.y + px[1].y }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0) });
    for (const dx of [5, 10, 20, 30]) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(dx) });
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(async () => (await hiddenRing(page))[1][0]).toBeGreaterThan(before[0]);
    await expect(page.getByTestId("boundary-points")).toHaveText("4 köşe");
  });
});
