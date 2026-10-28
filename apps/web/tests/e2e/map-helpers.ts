import { expect, type Locator, type Page } from "@playwright/test";

// Helpers of the map browser tests (maps.spec.ts). The map instance is on its
// container (`__map`); window.__orchadMaps counts the live maps
// (NEXT_PUBLIC_MAP_TEST_HOOKS=1, playwright.config.ts).

type MapEl = HTMLElement & { __map: import("maplibre-gl").Map };

// A 1 x 1 PNG for every basemap tile: the tests do not depend on the tile
// proxy or the network (the proxy has no upstream contact in CI).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function stubTiles(page: Page, mode: "ok" | "abort" | "500" = "ok") {
  await page.unroute("**/harita/karo/**").catch(() => {});
  await page.route("**/harita/karo/**", (route) => {
    if (mode === "abort") return route.abort("internetdisconnected");
    if (mode === "500") return route.fulfill({ status: 500, body: "" });
    return route.fulfill({ status: 200, contentType: "image/png", body: PNG });
  });
}

// Console errors and uncaught exceptions of the page. `allow` drops the
// browser's own network lines (a test that cuts the network expects them).
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return {
    errors,
    expectNone(allow: RegExp[] = []) {
      expect(errors.filter((e) => !allow.some((re) => re.test(e)))).toEqual([]);
    },
  };
}

export const NETWORK_ERROR = /Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_FAILED/;

export async function login(page: Page, email: string, next?: string) {
  await page.goto(next ? `/giris?next=${encodeURIComponent(next)}` : "/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill("orchados-dev");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname !== "/giris");
}

export async function mapReady(map: Locator) {
  await expect(map).toHaveAttribute("data-map-ready", "true", { timeout: 20_000 });
  await expect(map.locator("canvas.maplibregl-canvas")).toBeVisible();
}

// Waits for the next frame of the map (not "idle": that waits for tiles).
export async function rendered(map: Locator) {
  await map.evaluate(async (el) => {
    const m = (el as MapEl).__map;
    m.triggerRepaint();
    await new Promise((resolve) => m.once("render", resolve));
  });
}

export async function mapView(map: Locator) {
  return map.evaluate((el) => {
    const m = (el as MapEl).__map;
    const b = m.getBounds();
    return {
      zoom: m.getZoom(),
      center: m.getCenter().toArray() as [number, number],
      bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] as const,
      canvas: { w: m.getCanvas().clientWidth, h: m.getCanvas().clientHeight },
      container: { w: el.clientWidth, h: el.clientHeight },
    };
  });
}

// Coordinates of every Point feature of a source.
export async function sourcePoints(map: Locator, source: string) {
  return map.evaluate(async (el, id) => {
    const m = (el as MapEl).__map;
    const src = m.getSource(id) as import("maplibre-gl").GeoJSONSource | undefined;
    if (!src) return [];
    const data = (await src.getData()) as GeoJSON.FeatureCollection;
    return data.features.flatMap((f) =>
      f.geometry.type === "Point"
        ? [{ coordinates: f.geometry.coordinates as [number, number], properties: f.properties }]
        : [],
    );
  }, source);
}

// The pixel of a position, after centring the map on it at `zoom`.
export async function pixelOf(map: Locator, lngLat: [number, number], zoom?: number) {
  return map.evaluate(
    async (el, { lngLat, zoom }) => {
      const m = (el as MapEl).__map;
      if (zoom !== undefined) {
        m.jumpTo({ center: lngLat, zoom });
        await new Promise((resolve) => m.once("render", resolve));
      }
      const p = m.project(lngLat);
      return { x: p.x, y: p.y };
    },
    { lngLat, zoom },
  );
}

// Fits the map around positions and returns their pixels.
export async function pixelsOf(map: Locator, points: [number, number][]) {
  return map.evaluate(async (el, pts) => {
    const m = (el as MapEl).__map;
    const lons = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    m.fitBounds(
      [
        [Math.min(...lons) - 0.001, Math.min(...lats) - 0.001],
        [Math.max(...lons) + 0.001, Math.max(...lats) + 0.001],
      ],
      { padding: 60, animate: false },
    );
    await new Promise((resolve) => m.once("render", resolve));
    return pts.map((p) => {
      const px = m.project(p);
      return { x: px.x, y: px.y };
    });
  }, points);
}

export async function featureState(map: Locator, source: string, id: string) {
  return map.evaluate((el, { source, id }) => (el as MapEl).__map.getFeatureState({ source, id }), {
    source,
    id,
  });
}

export async function registry(page: Page) {
  return page.evaluate(() => {
    const r = window.__orchadMaps;
    return {
      created: r?.created ?? 0,
      removed: r?.removed ?? 0,
      live: r?.live.size ?? 0,
      // Canvases in the page and whether their WebGL context is alive.
      canvases: document.querySelectorAll("canvas.maplibregl-canvas").length,
      lost: [...(r?.live ?? [])].filter((m) => {
        const c = m.getCanvas();
        const gl = (c.getContext("webgl2") ??
          c.getContext("webgl")) as WebGLRenderingContext | null;
        return !gl || gl.isContextLost();
      }).length,
    };
  });
}
