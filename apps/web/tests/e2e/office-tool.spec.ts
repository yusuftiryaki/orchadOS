import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { bearingDeg, LocalFrame, wrap180 } from "../../src/lib/office/local-frame";
import { resolveSupabaseEnv } from "../local-supabase";
import { E2E_DATA_DIR } from "./global-setup";

// Office triangulation tool with the pipeline's synthetic session: click each
// of the 12 trunks in two panoramas, code the rows, export the verification
// list and save. The test creates its own parcel (no slots) and removes it.

const PARCEL = "f5000000-0000-4000-8000-000000000001";
const SESSION = "f5100000-0000-4000-8000-000000000001";
const ORG = "b0000000-0000-4000-8000-000000000001";

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
  const runs = join(E2E_DATA_DIR, "runs");
  if (!existsSync(runs)) return null;
  const dir = readdirSync(runs).find((d) => existsSync(join(runs, d, "panoramas.json")));
  return dir ? join(runs, dir) : null;
}

const run = runDir();
const truth: TruthTree[] = run
  ? JSON.parse(readFileSync(join(E2E_DATA_DIR, "session/synthetic_truth.json"), "utf8")).trees
  : [];
const sidecars: Sidecar[] = run
  ? JSON.parse(readFileSync(join(run, "panoramas.json"), "utf8")).panoramas
  : [];

const env = resolveSupabaseEnv();
const admin = createClient(env.url, env.serviceRoleKey, { auth: { persistSession: false } });

async function removeParcel() {
  await admin.from("tree").delete().eq("parcel_id", PARCEL);
  await admin.from("slot").delete().eq("parcel_id", PARCEL);
  await admin.from("boundary").delete().eq("parcel_id", PARCEL);
  await admin.from("session").delete().eq("parcel_id", PARCEL);
  await admin.from("parcel").delete().eq("id", PARCEL);
}

async function createParcel() {
  await removeParcel();
  // Boundary around the synthetic orchard (frame origin 37.06 N 37.38 E).
  const frame = new LocalFrame(37.06, 37.38);
  const ring = [
    [-6, 1],
    [12, 1],
    [12, 25],
    [-6, 25],
    [-6, 1],
  ].map(([x, y]) => frame.toLatLon({ x, y }));
  const steps = [
    admin.from("parcel").insert({ id: PARCEL, org_id: ORG, name: "Üçgenleme e2e" }),
    admin.from("boundary").insert({
      org_id: ORG,
      parcel_id: PARCEL,
      version: 1,
      geom: `SRID=4326;POLYGON((${ring.map((p) => `${p.lon} ${p.lat}`).join(", ")}))`,
      source: "field_survey",
    }),
    admin.from("session").insert({
      id: SESSION,
      org_id: ORG,
      parcel_id: PARCEL,
      kind: "inventory",
      status: "processed",
      started_at: "2026-10-18T09:00:00Z",
    }),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) throw error;
  }
}

async function login(page: Page, email: string, next: string) {
  await page.goto(`/giris?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill("orchados-dev");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname === next);
}

// Clicks the map at a WGS84 position (zooming there first).
async function clickMap(map: Locator, lat: number, lon: number) {
  const point = await map.evaluate(
    async (el, [lat, lon]) => {
      const m = (el as HTMLElement & { __map: import("maplibre-gl").Map }).__map;
      m.jumpTo({ center: [lon, lat], zoom: 20 });
      await new Promise((resolve) => m.once("render", resolve));
      return m.project([lon, lat]);
    },
    [lat, lon],
  );
  await map.click({ position: { x: point.x, y: point.y } });
}

// Clicks the trunk of `tree` in a panorama viewer, from the sidecar pose.
async function clickTrunk(viewer: Locator, tree: TruthTree) {
  const id = await viewer.getAttribute("data-panorama");
  const pano = sidecars.find((s) => s.panorama_id === id)!;
  const frame = new LocalFrame(pano.pose.lat, pano.pose.lon);
  const p = frame.toLocal(tree);
  const d = Math.hypot(p.x, p.y);
  const yawDeg = wrap180(bearingDeg(p) - pano.pose.heading_deg);
  // Synthetic trunks reach 1.4 m; the camera is 2 m up.
  const pitchDeg = (Math.atan2(0.7 - 2.0, d) * 180) / Math.PI;
  const point = await viewer.evaluate(
    (el, [yawDeg, pitchDeg]) => {
      const v = (el as HTMLElement & { __viewer: import("@photo-sphere-viewer/core").Viewer })
        .__viewer;
      const yaw = ((((yawDeg * Math.PI) / 180) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return v.dataHelper.sphericalCoordsToViewerCoords({ yaw, pitch: (pitchDeg * Math.PI) / 180 });
    },
    [yawDeg, pitchDeg],
  );
  const box = (await viewer.boundingBox())!;
  expect(point.x, `${tree.slot_code} in ${id}`).toBeGreaterThan(0);
  expect(point.x).toBeLessThan(box.width);
  await viewer.click({ position: { x: point.x, y: point.y } });
}

test.describe("office triangulation tool", () => {
  test.skip(
    !run || truth.length !== 12,
    "synthetic panoramas missing (needs uv; see global setup)",
  );

  test.beforeAll(createParcel);
  test.afterAll(removeParcel);

  test("triangulates, codes and saves the 12 synthetic trees", async ({ page }) => {
    test.setTimeout(240_000);
    await login(page, "ops@example.com", `/ofis/parsel/${PARCEL}`);
    await page.getByRole("link", { name: "Envanter üçgenleme aracı" }).click();

    const chooser = page.getByTestId("office-chooser");
    await expect(chooser.getByLabel("Envanter oturumu")).toHaveValue(SESSION);
    await chooser.getByRole("button", { name: "Aracı aç" }).click();

    const map = page.getByTestId("office-map");
    await expect(map).toHaveAttribute("data-map-ready", "true", { timeout: 30_000 });

    for (const tree of truth) {
      await clickMap(map, tree.lat, tree.lon);
      for (const n of [1, 2]) {
        const viewer = page.getByTestId(`viewer-${n}`).getByRole("region");
        await expect(viewer).toHaveAttribute("data-loaded", "true", { timeout: 30_000 });
        await clickTrunk(viewer, tree);
      }
      await expect(page.getByTestId("candidate-uncertainty")).toBeVisible();
      await page.getByRole("button", { name: "Ağacı ekle" }).click();
    }
    await expect(page.getByTestId("tree-count")).toHaveText("12 ağaç");

    // Positions against the synthetic truth.
    const draft = await page.evaluate(
      (key) => JSON.parse(window.localStorage.getItem(key)!),
      `orchados:office:${PARCEL}:${SESSION}`,
    );
    const frame = new LocalFrame(37.06, 37.38);
    const nearest = (p: { lat: number; lon: number }) => {
      const q = frame.toLocal(p);
      return truth
        .map((t) => ({ t, d: Math.hypot(frame.toLocal(t).x - q.x, frame.toLocal(t).y - q.y) }))
        .sort((a, b) => a.d - b.d)[0];
    };
    for (const tr of draft.trees) expect(nearest(tr).d).toBeLessThan(0.3);

    // Coding: rows run north, numbering from the south-west corner.
    await page.getByRole("tab", { name: "Kodlama" }).click();
    await page.getByLabel("Başlangıç köşesi").selectOption("sw");
    await page.getByLabel("Sıra yönü (°, kuzeyden saat yönünde)").fill("0");
    const summary = page.getByTestId("layout-summary");
    await expect(summary.locator('[data-key="rows"]')).toHaveText("3");
    await expect(summary.locator('[data-key="slots"]')).toHaveText("12");
    await expect(summary.locator('[data-key="empty"]')).toHaveText("0");
    const rows = await page
      .getByTestId("slot-table")
      .locator("tbody tr")
      .evaluateAll((trs) =>
        trs.map((tr) => [tr.getAttribute("data-code"), tr.getAttribute("data-tree")]),
      );
    for (const [code, treeId] of rows) {
      const tr = draft.trees.find((x: { id: string }) => x.id === treeId);
      expect(nearest(tr).t.slot_code).toBe(code);
    }

    // Mark one tree as unsure: it lands on the verification list.
    await page.getByRole("tab", { name: "Üçgenleme" }).click();
    const s22 = truth.find((t) => t.slot_code === "S2-2")!;
    await clickMap(map, s22.lat, s22.lon);
    await expect(page.getByTestId("selected-tree")).toBeVisible();
    await page.getByLabel("Emin değilim").check();

    await page.getByRole("tab", { name: "Doğrulama listesi" }).click();
    const verification = page.getByTestId("verification-table");
    await expect(verification.locator('tr[data-code="S2-2"]')).toContainText("Emin değilim");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "CSV olarak indir" }).click();
    const csv = readFileSync(await (await download).path(), "utf8");
    expect(csv).toContain("kod,neden,enlem,boylam,belirsizlik_m");
    expect(csv).toMatch(/S2-2,Emin değilim,37\.06/);

    // Save after confirming the preview.
    await page.getByRole("tab", { name: "Kaydet" }).click();
    await page.getByLabel(/Önizlemeyi kontrol ettim/).check();
    await page.getByRole("button", { name: "Veritabanına kaydet" }).click();
    await expect(page.getByTestId("save-result")).toContainText("12 yer ve 12 ağaç kaydedildi.");

    const { data: slots } = await admin
      .from("slot")
      .select("code, tree(first_seen_session_id)")
      .eq("parcel_id", PARCEL);
    expect(slots?.map((s) => s.code).sort()).toEqual(truth.map((t) => t.slot_code).sort());
    expect(slots?.every((s) => s.tree[0]?.first_seen_session_id === SESSION)).toBe(true);
    const { data: parcel } = await admin
      .from("parcel")
      .select("numbering_origin_corner, row_azimuth_deg")
      .eq("id", PARCEL)
      .single();
    expect(parcel).toEqual({ numbering_origin_corner: "sw", row_azimuth_deg: 0 });

    // A second visit is blocked: the parcel now has an inventory.
    await page.reload();
    await expect(page.getByTestId("existing-inventory")).toContainText("12 yer ve 12 ağaç");
  });
});

test("panorama images are served to office roles only", async ({ page }) => {
  test.skip(!run, "synthetic panoramas missing (needs uv; see global setup)");
  // Set ids encode the run folder relative to LOCAL_PANORAMA_DIR.
  const setId = Buffer.from(basename(run!), "utf8").toString("base64url");
  const url = `/ofis/panorama/${setId}/${sidecars[0].panorama_id}/2k`;

  await login(page, "field@example.com", "/ofis");
  const ok = await page.request.get(url);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("image/webp");
  expect((await page.request.get(url.replace("/2k", "/8k"))).status()).toBe(404);
  await page.getByRole("button", { name: "Çıkış" }).click();
  await page.waitForURL("/giris");

  await login(page, "owner@example.com", "/portal");
  expect((await page.request.get(url)).status()).toBe(403);
});
