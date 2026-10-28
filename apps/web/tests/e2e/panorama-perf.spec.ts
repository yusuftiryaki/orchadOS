import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { purgeDemoAttempts } from "../local-db";
import { DEMO_TOUR_READY } from "./global-setup";

// Performance probe of the 360° tour on the demo dataset (docs/panorama-gezi.md,
// "Performans"): JS loaded by the tour and by other portal pages, time to the
// first panorama frame, switch latency between panoramas and memory after 20
// switches. Not a gate: runs only with PANORAMA_PERF=1 and writes the numbers
// to PANORAMA_PERF_OUT (JSON) for the before/after table.

test.skip(!process.env.PANORAMA_PERF, "performance probe (PANORAMA_PERF=1)");
test.skip(!process.env[DEMO_TOUR_READY], "demo tour dataset not loaded (needs uv)");

// window.gc() before the memory reading, so heap numbers compare.
test.use({ launchOptions: { args: ["--js-flags=--expose-gc"] } });

const PARCEL_A = "de100000-0000-4000-8000-000000000001";
const TOUR = `/portal/parsel/${PARCEL_A}/gezi`;

type ViewerEl = HTMLElement & { __viewer: import("@photo-sphere-viewer/core").Viewer };

async function startDemo(page: Page) {
  await purgeDemoAttempts();
  await page.goto("/demo");
  await page.getByTestId("demo-start").click();
  await page.waitForURL((url) => url.pathname === "/portal");
  // Close the guided tour so it does not steer the pages.
  await page.getByTestId("tour-close").click();
}

// Bytes of the scripts the page has loaded (raw and gzip), and whether any
// carries the panorama viewer.
async function scripts(page: Page) {
  const urls = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter(
        (e) =>
          e.name.endsWith(".js") || (e as PerformanceResourceTiming).initiatorType === "script",
      )
      .map((e) => e.name),
  );
  let bytes = 0;
  let gzip = 0;
  let viewer = false;
  for (const url of new Set(urls)) {
    const body = await (await page.request.get(url)).body();
    bytes += body.length;
    gzip += gzipSync(body).length;
    const text = body.toString("utf8");
    if (text.includes("psv-container") || text.includes("WebGLRenderer")) viewer = true;
  }
  return {
    count: new Set(urls).size,
    kb: Math.round(bytes / 1024),
    gzipKb: Math.round(gzip / 1024),
    viewer,
  };
}

// Before any page script: records when the tour viewer reports a shown
// panorama (data-loaded="true"), and when the last pointer went down.
const TIMING = () => {
  const w = window as unknown as { __loads: { id: string; t: number }[]; __down: number };
  w.__loads = [];
  w.__down = 0;
  document.addEventListener("pointerdown", () => (w.__down = performance.now()), true);
  new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target as HTMLElement;
      // The first real image of each panorama (not the generated stand-in).
      if (
        el.dataset?.testid === "tour-viewer" &&
        el.dataset.loaded === "true" &&
        el.dataset.image !== "placeholder"
      ) {
        const id = el.dataset.panorama ?? "";
        if (w.__loads.at(-1)?.id !== id) w.__loads.push({ id, t: performance.now() });
      }
    }
  }).observe(document, {
    attributes: true,
    subtree: true,
    attributeFilter: ["data-loaded", "data-image"],
  });
};

const timing = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __loads: { id: string; t: number }[]; __down: number };
    return { loads: w.__loads, down: w.__down };
  });

// Clicks the arrow of the neighbour not yet visited (else the first one) and
// returns the milliseconds from the pointer press to the new panorama shown.
async function walk(page: Page, visited: Set<string>) {
  const viewer = page.getByTestId("tour-viewer");
  const target = await viewer.evaluate(
    (el, seen) => {
      const v = (el as ViewerEl).__viewer;
      const plugin = v.getPlugin(
        "markers",
      ) as import("@photo-sphere-viewer/markers-plugin").MarkersPlugin;
      const arrows = plugin.getMarkers().filter((m) => m.id.startsWith("pano:"));
      const pick = arrows.find((m) => !seen.includes(m.id.slice(5))) ?? arrows[0];
      const position = pick.config.position as { yaw: number; pitch: number };
      v.rotate({ yaw: position.yaw, pitch: -0.3 });
      return pick.id.slice(5);
    },
    [...visited],
  );
  // Let the view settle and the preloads of this view direction run.
  await page.waitForTimeout(600);
  await viewer.locator(`[data-arrow="${target}"]`).click();
  await expect(viewer).toHaveAttribute("data-panorama", target);
  await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  visited.add(target);
  // The real image (the old tour showed the placeholder while signing).
  await expect
    .poll(async () => (await timing(page)).loads.some((l) => l.id === target), { timeout: 60_000 })
    .toBe(true);
  const { loads, down } = await timing(page);
  return Math.round(loads.findLast((l) => l.id === target)!.t - down);
}

const summary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    max: sorted[sorted.length - 1],
    all: values,
  };
};

// Time from navigation start to the first panorama shown.
async function firstFrame(page: Page, url: string) {
  await page.goto(url);
  const viewer = page.getByTestId("tour-viewer");
  await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 60_000 });
  await expect
    .poll(async () => (await timing(page)).loads.length, { timeout: 60_000 })
    .toBeGreaterThan(0);
  const { loads } = await timing(page);
  return Math.round(loads[0].t);
}

test("tour performance probe", async ({ page, browserName }) => {
  test.setTimeout(480_000);
  expect(browserName).toBe("chromium");
  await page.addInitScript(TIMING);
  await startDemo(page);

  // A portal page without the viewer: does it load the viewer code?
  await page.goto(`/portal/parsel/${PARCEL_A}`);
  await expect(page.getByTestId("dimensions")).toBeVisible();
  await page.waitForLoadState("networkidle");
  const reportScripts = await scripts(page);

  const firstFrameMs = await firstFrame(page, TOUR);
  await page.waitForLoadState("networkidle");
  const tourScripts = await scripts(page);
  const firstFrameWarmMs = await firstFrame(page, TOUR);
  await page.waitForTimeout(1000);

  const viewer = page.getByTestId("tour-viewer");
  const visited = new Set<string>([(await viewer.getAttribute("data-panorama"))!]);
  const switches: number[] = [];
  for (let i = 0; i < 20; i += 1) switches.push(await walk(page, visited));
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as unknown as { gc?: () => void }).gc?.());
  const memory = await viewer.evaluate((el) => {
    const v = (el as ViewerEl).__viewer as unknown as {
      renderer: { renderer: { info: { memory: { textures: number; geometries: number } } } };
    };
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return {
      textures: v.renderer.renderer.info.memory.textures,
      geometries: v.renderer.renderer.info.memory.geometries,
      heapMb: heap ? Math.round(heap.usedJSHeapSize / 1024 / 102.4) / 10 : null,
      canvases: document.querySelectorAll("canvas").length,
    };
  });

  // A mobile-like network: 4G (9 Mbit/s down, 60 ms latency), cold cache.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 60,
    downloadThroughput: (9 * 1024 * 1024) / 8,
    uploadThroughput: (3 * 1024 * 1024) / 8,
  });
  const firstFrame4gMs = await firstFrame(page, TOUR);
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
  const visited4g = new Set<string>([(await viewer.getAttribute("data-panorama"))!]);
  const switches4g: number[] = [];
  for (let i = 0; i < 8; i += 1) switches4g.push(await walk(page, visited4g));

  const result = {
    reportScripts,
    tourScripts,
    firstFrameMs,
    firstFrameWarmMs,
    switchMs: summary(switches),
    afterSwitches: memory,
    distinctPanoramas: visited.size,
    firstFrame4gMs,
    switch4gMs: summary(switches4g),
  };
  console.log(JSON.stringify(result, null, 2));
  if (process.env.PANORAMA_PERF_OUT) {
    writeFileSync(process.env.PANORAMA_PERF_OUT, JSON.stringify(result, null, 2));
  }
});
