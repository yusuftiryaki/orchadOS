import { expect, test, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { bearingDeg, LocalFrame, wrap180 } from "../../src/lib/office/local-frame";
import { purgeParcels } from "../local-db";
import { login, shot } from "./helpers";

// Chapter 06: the office triangulation tool on the synthetic development
// parcel (scripts/office-dev-data.mjs): list, parcel, chooser, a worked
// example of one tree, a near-parallel warning, all trees but one (S2-3 is
// left out on purpose, so the row fit leaves an empty slot), coding, the
// verification list, saving, the blocked second visit and the inventory
// workspace (attributes, infrastructure, boundary, verification tour).

const OFFICE_DATA_DIR = resolve(import.meta.dirname, "../../.dev-data/office");
const PARCEL = "f9000000-0000-4000-8000-000000000001";
const SESSION = "f9200000-0000-4000-8000-000000000001";
const DRAFT_KEY = `orchados:office:${PARCEL}:${SESSION}`;
const WIDE = { width: 1440, height: 900 };
// Frame of the synthetic orchard (services/pipeline synthetic.py).
const FRAME = new LocalFrame(37.06, 37.38);
// The tree left out of the triangulation: its slot becomes "Boş yer".
const LEFT_OUT = "S2-3";

interface TruthTree {
  slot_code: string;
  lat: number;
  lon: number;
}
interface Sidecar {
  panorama_id: string;
  pose: { lat: number; lon: number; heading_deg: number };
}

function runDir(): string | null {
  const runs = join(OFFICE_DATA_DIR, "runs");
  if (!existsSync(runs)) return null;
  const dir = readdirSync(runs).find((d) => existsSync(join(runs, d, "panoramas.json")));
  return dir ? join(runs, dir) : null;
}

const run = runDir();
const truth: TruthTree[] = run
  ? JSON.parse(readFileSync(join(OFFICE_DATA_DIR, "session/synthetic_truth.json"), "utf8")).trees
  : [];
const sidecars = new Map<string, Sidecar>(
  run
    ? (
        JSON.parse(
          readFileSync(join(run, "panoramas.json"), "utf8").replace(
            /("gps_time_ns"\s*:\s*)(\d+)/g,
            '$1"$2"',
          ),
        ).panoramas as Sidecar[]
      ).map((s) => [s.panorama_id, s])
    : [],
);
const tree = (code: string) => truth.find((t) => t.slot_code === code)!;

type MapEl = HTMLElement & { __map: import("maplibre-gl").Map };
type ViewerEl = HTMLElement & { __viewer: import("@photo-sphere-viewer/core").Viewer };

// Clicks the map at a WGS84 position (zooming there first).
async function clickMap(map: Locator, p: { lat: number; lon: number }, zoom = 20) {
  const point = await map.evaluate(
    async (el, [lat, lon, zoom]) => {
      const m = (el as MapEl).__map;
      m.jumpTo({ center: [lon, lat], zoom });
      await new Promise((resolve) => m.once("render", resolve));
      return m.project([lon, lat]);
    },
    [p.lat, p.lon, zoom],
  );
  await map.click({ position: { x: point.x, y: point.y } });
}

// Shows the whole parcel on the map (as after opening the tool).
async function fitMap(map: Locator) {
  const sw = FRAME.toLatLon({ x: -7, y: 0 });
  const ne = FRAME.toLatLon({ x: 13, y: 26 });
  await map.evaluate(
    async (el, [s, w, n, e]) => {
      const m = (el as MapEl).__map;
      m.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: 24, duration: 0 },
      );
      await new Promise((resolve) => m.once("idle", resolve));
    },
    [sw.lat, sw.lon, ne.lat, ne.lon],
  );
}

// An invisible box over a map position, as a marker target.
async function pinAt(page: Page, map: Locator, p: { lat: number; lon: number }, id: string) {
  await map.evaluate(
    (el, [lat, lon, id]) => {
      const m = (el as MapEl).__map;
      const q = m.project([Number(lon), Number(lat)]);
      const r = el.getBoundingClientRect();
      const pin = document.createElement("div");
      pin.id = String(id);
      pin.style.cssText =
        `position:absolute;left:${r.left + window.scrollX + q.x - 6}px;` +
        `top:${r.top + window.scrollY + q.y - 6}px;width:12px;height:12px;pointer-events:none;`;
      document.body.appendChild(pin);
    },
    [p.lat, p.lon, id] as [number, number, string],
  );
  return page.locator(`#${id}`);
}

async function unpin(page: Page) {
  await page.evaluate(() => document.querySelectorAll("[id^=pin-]").forEach((e) => e.remove()));
}

async function viewerReady(page: Page, n: number) {
  const viewer = page.getByTestId(`viewer-${n}`).getByRole("region");
  await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
  // Textures are drawn on the next frames.
  await page.waitForTimeout(600);
  return viewer;
}

// Turns the viewer towards the trunk of `t` (as the user would by dragging)
// and clicks it, from the panorama's sidecar pose.
async function clickTrunk(page: Page, viewer: Locator, t: TruthTree, turn = true) {
  const id = await viewer.getAttribute("data-panorama");
  const pano = sidecars.get(id!)!;
  const frame = new LocalFrame(pano.pose.lat, pano.pose.lon);
  const p = frame.toLocal(t);
  const d = Math.hypot(p.x, p.y);
  const yawDeg = wrap180(bearingDeg(p) - pano.pose.heading_deg);
  // Synthetic trunks reach 1.4 m; the camera is 2 m up.
  const pitchDeg = (Math.atan2(0.7 - 2.0, d) * 180) / Math.PI;
  const point = await viewer.evaluate(
    async (el, [yawDeg, pitchDeg, turn]) => {
      const v = (el as ViewerEl).__viewer;
      const yaw = ((((yawDeg * Math.PI) / 180) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const pitch = (pitchDeg * Math.PI) / 180;
      if (turn) {
        v.rotate({ yaw, pitch: Math.max(pitch, -0.35) });
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      return v.dataHelper.sphericalCoordsToViewerCoords({ yaw, pitch });
    },
    [yawDeg, pitchDeg, turn ? 1 : 0],
  );
  const box = (await viewer.boundingBox())!;
  expect(point.x, `${t.slot_code} in ${id}`).toBeGreaterThan(0);
  expect(point.x).toBeLessThan(box.width);
  await viewer.click({ position: { x: point.x, y: point.y } });
  await page.waitForTimeout(300);
}

async function triangulate(page: Page, map: Locator, t: TruthTree) {
  await clickMap(map, t);
  for (const n of [1, 2]) await clickTrunk(page, await viewerReady(page, n), t);
  await expect(page.getByTestId("candidate-uncertainty")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.skip(!run || truth.length !== 12, "synthetic panoramas missing (scripts/office-dev-data.mjs)");

test.beforeAll(async () => {
  // A saved inventory, tours, zones and boundary versions of an earlier run go
  // away; the script recreates the parcel without slots.
  await purgeParcels([PARCEL]);
  execFileSync("node", ["scripts/office-dev-data.mjs", "--skip-panoramas", "--reset"], {
    cwd: resolve(import.meta.dirname, "../.."),
    stdio: "inherit",
  });
});

test("ofis aracı: liste, parsel, seçim, üçgenleme, kodlama, kayıt", async ({ page }) => {
  test.setTimeout(900_000);
  await login(page, "ops@example.com", "/ofis");
  await page.evaluate((key) => window.localStorage.removeItem(key), DRAFT_KEY);

  // 01 parcel list
  const parcelLink = page.getByRole("link", { name: "Sentetik Bahçe (üçgenleme, geliştirme)" });
  await expect(parcelLink).toBeVisible();
  await shot(page, "ofis/01-parsel-listesi.png", [{ target: parcelLink, n: 1 }]);

  // 02 parcel page
  await parcelLink.click();
  await page.waitForURL(`**/ofis/parsel/${PARCEL}`);
  const toolLink = page.getByRole("link", { name: "Üçgenleme aracını aç" });
  const editLink = page.getByRole("link", { name: "Envanteri düzenle" });
  await expect(toolLink).toBeVisible();
  await page.waitForTimeout(1000);
  await shot(page, "ofis/02-parsel-sayfasi.png", [
    { target: toolLink, n: 1, at: "below" },
    { target: editLink, n: 2, at: "below" },
  ]);

  // 03 workspace before any saved inventory
  await editLink.click();
  await expect(page.getByText("Bu parselde kayıtlı yer yok")).toBeVisible();
  await shot(page, "ofis/03-duzenle-envanter-yok.png", [
    { target: page.getByRole("link", { name: "Üçgenleme aracını aç" }), n: 1 },
  ]);

  // 04 chooser
  await page.setViewportSize(WIDE);
  await page.goto(`/ofis/parsel/${PARCEL}/envanter`);
  const chooser = page.getByTestId("office-chooser");
  await expect(chooser).toBeVisible();
  await expect(chooser.getByLabel("Envanter oturumu")).toHaveValue(SESSION);
  await shot(page, "ofis/04-oturum-ve-set.png", [
    { target: chooser.getByLabel("Envanter oturumu"), n: 1 },
    { target: chooser.getByLabel("Panorama seti"), n: 2 },
    { target: chooser.getByRole("button", { name: "Üçgenleme aracını aç" }), n: 3 },
  ]);

  // 05 tool, empty
  await chooser.getByRole("button", { name: "Üçgenleme aracını aç" }).click();
  const map = page.getByTestId("office-map");
  await expect(map).toHaveAttribute("data-map-ready", "true", { timeout: 30_000 });
  await fitMap(map);
  const tabs = page.getByRole("tablist", { name: "Adımlar" });
  await shot(page, "ofis/05-arac-acildi.png", [
    { target: map, n: 1, at: "center" },
    { target: tabs.getByRole("tab", { name: "Üçgenleme" }), n: 2 },
    { target: page.getByTestId("save-state"), n: 3 },
    { target: page.getByText("Haritaya tıklayınca panorama burada açılır.").first(), n: 4 },
    { target: page.getByTestId("candidate").getByRole("heading"), n: 5 },
    { target: page.getByText("Klavye kısayolları"), n: 6 },
  ]);

  // 06 map click near S1-1: the two nearest panoramas open towards it
  const first = tree("S1-1");
  await clickMap(map, first);
  const v1 = await viewerReady(page, 1);
  const v2 = await viewerReady(page, 2);
  await shot(page, "ofis/06-haritaya-tiklandi.png", [
    { target: map, n: 1, at: "center" },
    { target: page.getByTestId("viewer-1").locator("code"), n: 2, at: "below" },
    {
      target: page.getByTestId("viewer-1").getByRole("button", { name: "Önceki" }),
      n: 3,
      at: "below",
    },
    { target: v1, n: 4, at: "center" },
    { target: v2, n: 5, at: "center" },
  ]);

  // 07 first trunk click
  await clickTrunk(page, v1, first);
  await expect(page.getByText("Konum için en az iki panoramada gövdeye tıklayın.")).toBeVisible();
  await shot(page, "ofis/07-birinci-tiklama.png", [
    { target: v1, n: 1, at: "center" },
    { target: map, n: 2, at: "center" },
    { target: page.getByRole("list", { name: "Yön çizgileri" }), n: 3 },
  ]);

  // 08 second trunk click: candidate position
  await clickTrunk(page, v2, first);
  const candidate = page.getByTestId("candidate");
  await expect(page.getByTestId("candidate-uncertainty")).toBeVisible();
  await expect(candidate.getByRole("status")).toHaveCount(0);
  await shot(page, "ofis/08-aday-konum.png", [
    { target: v2, n: 1, at: "center" },
    { target: page.getByTestId("candidate-uncertainty"), n: 2 },
    { target: candidate.getByText("Kesişme açısı"), n: 3 },
    { target: candidate.getByRole("button", { name: "Ağacı ekle", exact: true }), n: 4 },
    { target: candidate.getByRole("button", { name: "Çizgileri temizle" }), n: 5, at: "below" },
  ]);
  await candidate.getByRole("button", { name: "Ağacı ekle", exact: true }).click();
  await expect(page.getByTestId("tree-count")).toHaveText("1 ağaç");

  // 09 a poor pair: the two panoramas at the south end of the first lane
  // (0 m and 6.35 m north) both look up the lane at S1-4, 22 m away.
  await clickMap(map, FRAME.toLatLon({ x: 0, y: 2 }));
  const far = tree("S1-4");
  for (const n of [1, 2]) await clickTrunk(page, await viewerReady(page, n), far);
  const warning = candidate.getByRole("status");
  await expect(warning).toContainText("Çizgiler neredeyse paralel");
  await fitMap(map);
  await page.evaluate(() => window.scrollTo(0, 130));
  await shot(page, "ofis/09-uyari-paralel.png", [
    { target: map, n: 1, at: "center" },
    { target: page.getByTestId("candidate-uncertainty"), n: 2 },
    { target: warning, n: 3 },
    { target: candidate.getByRole("button", { name: "Çizgileri temizle" }), n: 4, at: "below" },
  ]);
  await candidate.getByRole("button", { name: "Çizgileri temizle" }).click();
  await expect(page.getByTestId("candidate-uncertainty")).toHaveCount(0);

  // All other trees, except the one left out.
  for (const t of truth) {
    if (t.slot_code === "S1-1" || t.slot_code === LEFT_OUT) continue;
    await triangulate(page, map, t);
    await expect(candidate.getByRole("status")).toHaveCount(0);
    await candidate.getByRole("button", { name: "Ağacı ekle", exact: true }).click();
  }
  await expect(page.getByTestId("tree-count")).toHaveText("11 ağaç");
  await page.evaluate(() => window.scrollTo(0, 0));
  await fitMap(map);
  await shot(page, "ofis/10-agaclar-eklendi.png", [
    { target: map, n: 1, at: "center" },
    { target: page.getByTestId("tree-count"), n: 2 },
    { target: tabs.getByRole("tab", { name: "Üçgenleme" }), n: 3 },
  ]);

  // 11 draft restored after a reload
  await page.reload();
  await expect(
    page.getByText("Bu tarayıcıda kaydedilmiş taslak yüklendi (11 ağaç)."),
  ).toBeVisible();
  await expect(map).toHaveAttribute("data-map-ready", "true", { timeout: 30_000 });
  await fitMap(map);
  await shot(page, "ofis/11-taslak-yuklendi.png", [
    { target: page.getByText("Bu tarayıcıda kaydedilmiş taslak yüklendi"), n: 1 },
    { target: page.getByRole("button", { name: "Taslağı sil" }), n: 2 },
  ]);
  await page.getByRole("button", { name: "Taslağı sil" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(600);
  // A modal dialog sits above the marker layer: no numbers on this one.
  await shot(page, "ofis/12-taslak-sil-onayi.png");
  await dialog.getByRole("button", { name: "Vazgeç" }).last().click();
  await expect(dialog).toHaveCount(0);

  // 13 coding
  await tabs.getByRole("tab", { name: "Kodlama" }).click();
  await page.getByLabel("Başlangıç köşesi").selectOption("sw");
  await page.getByRole("button", { name: "Ağaçlardan tahmin et" }).click();
  const summary = page.getByTestId("layout-summary");
  await expect(summary.locator('[data-key="rows"]')).toHaveText("3");
  await expect(summary.locator('[data-key="slots"]')).toHaveText("12");
  await expect(summary.locator('[data-key="trees"]')).toHaveText("11");
  await expect(summary.locator('[data-key="empty"]')).toHaveText("1");
  await fitMap(map);
  await shot(page, "ofis/13-kodlama.png", [
    { target: page.getByLabel("Başlangıç köşesi"), n: 1 },
    { target: page.getByLabel("Sıra yönü (°, kuzeyden saat yönünde)"), n: 2, at: "right" },
    { target: page.getByRole("button", { name: "Ağaçlardan tahmin et" }), n: 3, at: "below" },
    { target: page.getByRole("button", { name: "+90°" }), n: 4, at: "below" },
    { target: summary, n: 5 },
    { target: page.getByText("Oturtulan sıra yönü"), n: 6 },
    { target: page.getByTestId("slot-table"), n: 7 },
  ]);

  // 14 the empty slot
  const emptyRow = page.getByTestId("slot-table").locator(`tr[data-code="${LEFT_OUT}"]`);
  await expect(emptyRow).toContainText("Boş yer");
  await emptyRow.scrollIntoViewIfNeeded();
  await fitMap(map);
  const emptyPin = await pinAt(page, map, tree(LEFT_OUT), "pin-empty");
  await shot(page, "ofis/14-bos-yer.png", [
    { target: emptyPin, n: 1 },
    { target: emptyRow, n: 2 },
  ]);
  await unpin(page);

  // 15 select a tree, mark "Emin değilim"
  await tabs.getByRole("tab", { name: "Üçgenleme" }).click();
  await clickMap(map, tree("S1-2"), 19);
  const selected = page.getByTestId("selected-tree");
  await expect(selected).toBeVisible();
  await selected.getByLabel("Emin değilim").check();
  await fitMap(map);
  await shot(page, "ofis/15-secili-agac.png", [
    { target: map, n: 1, at: "center" },
    { target: selected.getByText("S1-2"), n: 2, at: "below" },
    { target: selected.getByLabel("Emin değilim"), n: 3 },
    { target: selected.getByRole("button", { name: "Ağacı sil" }), n: 4 },
  ]);

  // 16 delete and undo
  await selected.getByRole("button", { name: "Ağacı sil" }).click();
  await expect(page.getByText("Ağaç taslaktan silindi.")).toBeVisible();
  await shot(page, "ofis/16-silindi-geri-al.png", [
    { target: page.getByText("Ağaç taslaktan silindi."), n: 1 },
    { target: page.getByRole("button", { name: "Geri al" }), n: 2 },
  ]);
  await page.getByRole("button", { name: "Geri al" }).click();
  await expect(page.getByTestId("tree-count")).toHaveText("11 ağaç");

  // 17 verification list and CSV
  await tabs.getByRole("tab", { name: "Doğrulama listesi" }).click();
  const verification = page.getByTestId("verification-table");
  await expect(verification.locator('tr[data-code="S1-2"]')).toContainText("Emin değilim");
  await expect(verification.locator(`tr[data-code="${LEFT_OUT}"]`)).toContainText("Boş yer");
  await fitMap(map);
  await shot(page, "ofis/17-dogrulama-listesi.png", [
    { target: page.getByTestId("verification-count"), n: 1 },
    { target: verification, n: 2 },
    { target: page.getByRole("button", { name: "CSV olarak indir" }), n: 3 },
  ]);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV olarak indir" }).click();
  const csv = readFileSync(await (await download).path(), "utf8");
  expect(csv).toContain("kod,neden,enlem,boylam,belirsizlik_m");
  console.log(`CSV:\n${csv}`);

  // 18 save tab
  await tabs.getByRole("tab", { name: "Kaydet" }).click();
  await page.getByLabel(/Önizlemeyi kontrol ettim/).check();
  await expect(page.getByRole("button", { name: "Veritabanına kaydet" })).toBeEnabled();
  await page.waitForTimeout(400);
  await shot(page, "ofis/18-kaydet.png", [
    { target: page.getByTestId("save-summary"), n: 1 },
    { target: page.getByLabel(/Önizlemeyi kontrol ettim/), n: 2 },
    { target: page.getByRole("button", { name: "Veritabanına kaydet" }), n: 3 },
  ]);
  await page.getByRole("button", { name: "Veritabanına kaydet" }).click();
  const result = page.getByTestId("save-result");
  await expect(result).toContainText("12 yer ve 11 ağaç kaydedildi.");
  await shot(page, "ofis/19-kaydedildi.png", [
    { target: page.getByTestId("save-state"), n: 1, at: "below" },
    { target: result.getByText("kaydedildi", { exact: false }).first(), n: 2 },
    { target: page.getByTestId("open-workspace"), n: 3, at: "below" },
    { target: result.getByRole("link", { name: "Parsel haritasını aç" }), n: 4, at: "below" },
  ]);

  // 20 second visit: blocked
  await page.reload();
  const blocked = page.getByTestId("existing-inventory");
  await expect(blocked).toContainText("12 yer ve 11 ağaç");
  await expect(map).toHaveAttribute("data-map-ready", "true", { timeout: 30_000 });
  await fitMap(map);
  await shot(page, "ofis/20-envanter-zaten-kayitli.png", [
    { target: blocked, n: 1 },
    { target: page.getByTestId("save-state"), n: 2, at: "below" },
  ]);
});

test("envanter düzenleme: özellikler, altyapı, sınır, doğrulama turu", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize(WIDE);
  await login(page, "ops@example.com", "/ofis");
  await page.goto(`/ofis/parsel/${PARCEL}/envanter/duzenle`);
  const map = page.getByTestId("workspace-map");
  await expect(map).toHaveAttribute("data-map-ready", "true", { timeout: 30_000 });
  await fitMap(map);
  const tabs = page.getByRole("tablist", { name: "Envanter işleri" });

  // 21 attributes: row 1 as "Verimli", "Aşılı", "Tek gövde"
  const attrs = page.getByTestId("tree-attributes");
  await attrs.getByTestId("attribute-row").selectOption("1");
  await attrs.getByRole("button", { name: "Görünenlerin hepsini seç" }).click();
  await attrs.getByTestId("bulk-age").selectOption("productive");
  await attrs.getByTestId("bulk-graft").selectOption("grafted");
  await attrs.getByTestId("bulk-stem").selectOption("single");
  await shot(page, "ofis/21-agac-ozellikleri.png", [
    { target: tabs.getByRole("tab", { name: "Ağaç özellikleri" }), n: 1, at: "below" },
    { target: map, n: 2, at: "center" },
    { target: attrs.getByTestId("attribute-row"), n: 3 },
    { target: attrs.getByRole("button", { name: "Görünenlerin hepsini seç" }), n: 4 },
    { target: attrs.getByTestId("attribute-selected"), n: 5 },
    { target: attrs.getByTestId("bulk-age"), n: 6 },
    { target: attrs.getByTestId("bulk-apply"), n: 7, at: "below" },
    { target: attrs.getByTestId("attribute-table"), n: 8 },
  ]);
  await attrs.getByTestId("bulk-apply").click();
  await expect(attrs.getByText("4 ağaç güncellendi.")).toBeVisible();
  await expect(attrs.locator('tr[data-code="S1-1"]')).toContainText("Verimli");
  await shot(page, "ofis/22-ozellik-uygulandi.png", [
    { target: attrs.getByText("4 ağaç güncellendi."), n: 1 },
    { target: attrs.locator('tr[data-code="S1-1"]'), n: 2 },
  ]);

  // 23 infrastructure: a well (point) and an irrigation line (two corners)
  await tabs.getByRole("tab", { name: "Altyapı" }).click();
  const infra = page.getByTestId("infrastructure");
  await infra.getByTestId("zone-kind").selectOption("well");
  await infra.getByLabel("Ad (isteğe bağlı)").fill("Deneme kuyusu");
  await clickMap(map, FRAME.toLatLon({ x: 10.5, y: 2 }), 19);
  await expect(page.getByTestId("workspace-message")).toHaveText("Altyapı eklendi.");
  await infra.getByTestId("zone-kind").selectOption("irrigation_line");
  await infra.getByLabel("Ad (isteğe bağlı)").fill("Deneme sulama hattı");
  await fitMap(map);
  for (const y of [2, 24]) {
    const p = FRAME.toLatLon({ x: -5, y });
    const point = await map.evaluate(
      (el, [lat, lon]) => (el as MapEl).__map.project([lon, lat]),
      [p.lat, p.lon],
    );
    await map.click({ position: { x: point.x, y: point.y } });
  }
  await expect(infra.getByText("2 köşe")).toBeVisible();
  await shot(page, "ofis/23-altyapi.png", [
    { target: infra.getByTestId("zone-kind"), n: 1 },
    { target: infra.getByLabel("Ad (isteğe bağlı)"), n: 2 },
    { target: map, n: 3, at: "center" },
    { target: infra.getByText("2 köşe"), n: 4 },
    { target: infra.getByRole("button", { name: "Çizgiyi kaydet" }), n: 5, at: "below" },
    { target: infra.getByRole("button", { name: "Son köşeyi geri al" }), n: 6, at: "below" },
    { target: infra.getByTestId("zone-list"), n: 7 },
  ]);
  await infra.getByRole("button", { name: "Çizgiyi kaydet" }).click();
  await expect(infra.getByTestId("zone-list")).toContainText("Deneme sulama hattı");

  // 24 boundary: four corners around the trees
  await tabs.getByRole("tab", { name: "Sınır" }).click();
  const editor = page.getByTestId("boundary-editor");
  await fitMap(map);
  for (const [x, y] of [
    [-6.5, 0.5],
    [12.5, 0.5],
    [12.5, 25.5],
    [-6.5, 25.5],
  ]) {
    const p = FRAME.toLatLon({ x, y });
    const point = await map.evaluate(
      (el, [lat, lon]) => (el as MapEl).__map.project([lon, lat]),
      [p.lat, p.lon],
    );
    await map.click({ position: { x: point.x, y: point.y } });
  }
  await expect(editor.getByTestId("boundary-vertices")).toHaveText("4 köşe");
  await shot(page, "ofis/24-sinir-cizimi.png", [
    { target: map, n: 1, at: "center" },
    { target: editor.getByTestId("boundary-vertices"), n: 2 },
    { target: editor.getByTestId("boundary-area"), n: 3, at: "right" },
    { target: editor.getByTestId("boundary-uncertainty"), n: 4 },
    { target: editor.getByRole("button", { name: "Son köşeyi geri al" }), n: 5, at: "below" },
    { target: editor.getByRole("button", { name: "Son sürümden başla" }), n: 6, at: "below" },
    { target: editor.getByTestId("boundary-save"), n: 7 },
    { target: editor.getByTestId("boundary-versions"), n: 8 },
  ]);
  await editor.getByTestId("boundary-save").click();
  await expect(page.getByTestId("workspace-message")).toContainText("Sınır v2 kaydedildi.");
  await expect(editor.getByTestId("boundary-versions")).toContainText("v2");
  await shot(page, "ofis/25-sinir-kaydedildi.png", [
    { target: page.getByTestId("workspace-message"), n: 1 },
    { target: editor.getByTestId("boundary-versions"), n: 2 },
  ]);

  // 26 verification tour
  await tabs.getByRole("tab", { name: "Doğrulama" }).click();
  const create = page.getByTestId("verification-create");
  const candidates = create.getByTestId("candidate-table");
  await expect(candidates.locator('tr[data-code="S1-2"]')).toContainText("Emin değilim");
  await expect(candidates.locator(`tr[data-code="${LEFT_OUT}"]`)).toContainText("Boş yer");
  await candidates.getByLabel(`Not ${LEFT_OUT}`).fill("Dikim izi var mı bakın");
  await create.getByLabel("Planlanan gün").fill("2026-11-05");
  await create.getByRole("heading", { name: "Doğrulama turu" }).click();
  await shot(page, "ofis/26-dogrulama-turu.png", [
    {
      target: candidates.locator("tbody tr").first().locator("input[type=checkbox]").first(),
      n: 1,
    },
    { target: candidates.locator(`tr[data-code="${LEFT_OUT}"]`).getByText("Fidan olabilir"), n: 2 },
    { target: candidates.getByLabel(`Not ${LEFT_OUT}`), n: 3 },
    { target: create.getByLabel("Planlanan gün"), n: 4 },
    { target: create.getByTestId("create-tour"), n: 5, at: "below" },
  ]);
  await create.getByTestId("create-tour").click();
  await expect(page.getByTestId("workspace-message")).toContainText("Doğrulama turu oluşturuldu");
  const tour = page.getByTestId("verification-tour").first();
  await expect(tour).toBeVisible();

  // 27 record a result for S1-2
  const item = tour.locator('tr[data-code="S1-2"]');
  await item.getByLabel("Ağaç var").check();
  await item.getByLabel("Sonuç notu").fill("Gövde yerinde, tek gövde");
  await tour.scrollIntoViewIfNeeded();
  await shot(page, "ofis/27-tur-sonucu.png", [
    { target: tour.getByTestId("tour-progress"), n: 1 },
    { target: item.getByRole("radiogroup"), n: 2, at: "right" },
    { target: item.getByLabel("Sonuç notu"), n: 3, at: "right" },
    { target: item.getByRole("button", { name: "Bakıldı olarak kaydet" }), n: 4 },
    { target: item.getByRole("button", { name: "Bakmadan kapat" }), n: 5 },
  ]);
  await item.getByRole("button", { name: "Bakıldı olarak kaydet" }).click();
  await expect(tour.locator('tr[data-code="S1-2"]')).toHaveAttribute("data-status", "checked");
});
