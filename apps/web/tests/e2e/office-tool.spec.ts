import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { bearingDeg, LocalFrame, wrap180 } from "../../src/lib/office/local-frame";
import { purgeParcels } from "../local-db";
import { resolveSupabaseEnv } from "../local-supabase";
import { E2E_DATA_DIR } from "./global-setup";

// Office triangulation tool with the pipeline's synthetic session: click each
// of the 12 trunks in two panoramas, code the rows, export the verification
// list and save. Runs twice: with the panoramas from the local folder source
// and with the same panoramas uploaded to storage (as asset rows and media
// objects, as the pipeline's upload step writes them). The test creates its
// own parcel (no slots) and removes it with everything under it.

const PARCEL = "f5000000-0000-4000-8000-000000000001";
const SESSION = "f5100000-0000-4000-8000-000000000001";
const ORG = "b0000000-0000-4000-8000-000000000001";
const PIPELINE_VERSION = "0.1.0";

interface TruthTree {
  slot_code: string;
  lat: number;
  lon: number;
}
interface SidecarFile {
  path: string;
  sha256: string;
  media_type: string;
  width: number;
  height: number;
}
interface Sidecar {
  panorama_id: string;
  // Kept as written: the digits do not fit a double.
  gps_time_ns: string;
  pose: { lat: number; lon: number; heading_deg: number; sd_h_m: number; quality: string };
  quality_score: number;
  image: SidecarFile;
  preview: SidecarFile;
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
  ? JSON.parse(
      readFileSync(join(run, "panoramas.json"), "utf8").replace(
        /("gps_time_ns"\s*:\s*)(\d+)/g,
        '$1"$2"',
      ),
    ).panoramas
  : [];

// Asset ids of the uploaded panoramas: the full resolution row is the frame's
// id in the tool (and the viewer's data-panorama), the preview its sibling.
const assetId = (variant: "full" | "preview", i: number) =>
  `${variant === "full" ? "f5200000" : "f5300000"}-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
const sidecarByPanorama = new Map<string, Sidecar>(
  sidecars.flatMap((s, i) => [
    [s.panorama_id, s],
    [assetId("full", i), s],
  ]),
);

const env = resolveSupabaseEnv();
const admin = createClient(env.url, env.serviceRoleKey, { auth: { persistSession: false } });

const SET_IDS = {
  local: run ? `local-${Buffer.from(basename(run), "utf8").toString("base64url")}` : "",
  storage: `storage-${Buffer.from(JSON.stringify([SESSION, PIPELINE_VERSION]), "utf8").toString("base64url")}`,
};
type SourceKind = keyof typeof SET_IDS;

function removeParcel() {
  return purgeParcels([PARCEL]);
}

// The run's panoramas as the pipeline uploads them (docs/arayuzler.md):
// media objects org/<org>/parcel/<parcel>/<sha256>, asset rows with pose.
async function uploadPanoramas() {
  for (const [i, s] of sidecars.entries()) {
    for (const variant of ["full", "preview"] as const) {
      const file = variant === "full" ? s.image : s.preview;
      const name = `org/${ORG}/parcel/${PARCEL}/${file.sha256}`;
      const upload = await admin.storage
        .from("media")
        .upload(name, readFileSync(join(run!, file.path)), {
          contentType: file.media_type,
          upsert: true,
        });
      if (upload.error) throw upload.error;
      const { error } = await admin.from("asset").insert({
        id: assetId(variant, i),
        org_id: ORG,
        parcel_id: PARCEL,
        session_id: SESSION,
        kind: "panorama",
        uri: `storage://media/${name}`,
        content_hash: file.sha256,
        mime_type: file.media_type,
        position: `SRID=4326;POINT(${s.pose.lon} ${s.pose.lat})`,
        position_uncertainty_m: s.pose.sd_h_m,
        pose: {
          variant,
          heading_deg: s.pose.heading_deg,
          sd_h_m: s.pose.sd_h_m,
          quality: s.pose.quality,
          gps_time_ns: s.gps_time_ns,
          width_px: file.width,
          height_px: file.height,
        },
        quality_score: s.quality_score,
        pipeline: "orchados-pipeline",
        pipeline_version: PIPELINE_VERSION,
      });
      if (error) throw error;
    }
  }
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
  await uploadPanoramas();
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
  const pano = sidecarByPanorama.get(id!)!;
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

  test.beforeEach(createParcel);
  test.afterAll(removeParcel);

  for (const source of ["storage", "local"] as const) {
    test(`triangulates, codes and saves the 12 synthetic trees (${source})`, async ({ page }) => {
      await triangulateAndSave(page, source);
    });
  }
});

async function triangulateAndSave(page: Page, source: SourceKind) {
  test.setTimeout(240_000);
  await login(page, "ops@example.com", `/ofis/parsel/${PARCEL}`);
  await page.getByRole("link", { name: "Envanter üçgenleme aracı" }).click();

  const chooser = page.getByTestId("office-chooser");
  await expect(chooser.getByLabel("Envanter oturumu")).toHaveValue(SESSION);
  // The storage set belongs to the session and is offered first.
  await expect(chooser.getByLabel("Panorama seti")).toHaveValue(SET_IDS.storage);
  await chooser.getByLabel("Panorama seti").selectOption(SET_IDS[source]);
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

  // The viewers open the preview; zooming in loads the full resolution.
  const viewer = page.getByTestId("viewer-1").getByRole("region");
  type ViewerEl = HTMLElement & { __viewer: import("@photo-sphere-viewer/core").Viewer };
  const shown = () => viewer.evaluate((el) => String((el as ViewerEl).__viewer.config.panorama));
  expect(await shown()).toMatch(/\/2k$/);
  await viewer.evaluate((el) => (el as ViewerEl).__viewer.zoom(80));
  await expect.poll(shown).toMatch(/\/4k$/);

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
  await expect(page.getByTestId("save-state")).toHaveText("Taslak: kaydedilmedi");
  await page.getByLabel(/Önizlemeyi kontrol ettim/).check();
  await page.getByRole("button", { name: "Veritabanına kaydet" }).click();
  await expect(page.getByTestId("save-result")).toContainText("12 yer ve 12 ağaç kaydedildi.");
  await expect(page.getByTestId("save-state")).toHaveText("Veritabanına kaydedildi");

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

  // Every trunk click is kept as a label: two per tree, in the clicked
  // panorama (the asset row with storage; the frame's GPS time locally).
  await expect(page.getByTestId("save-result")).toContainText("24 gövde tıklaması");
  const { data: labels } = await admin
    .from("trunk_label")
    .select("panorama_asset_id, panorama_gps_time_ns, tree_id, labelled_by, unsure")
    .eq("parcel_id", PARCEL);
  expect(labels).toHaveLength(24);
  expect(labels!.every((l) => l.tree_id && l.labelled_by)).toBe(true);
  expect(labels!.filter((l) => l.unsure)).toHaveLength(2);
  if (source === "storage") {
    const fullIds = new Set(sidecars.map((_, i) => assetId("full", i)));
    expect(labels!.every((l) => fullIds.has(l.panorama_asset_id!))).toBe(true);
  } else {
    expect(labels!.every((l) => l.panorama_asset_id === null && l.panorama_gps_time_ns)).toBe(true);
  }

  // A second visit is blocked: the parcel now has an inventory.
  await page.reload();
  await expect(page.getByTestId("existing-inventory")).toContainText("12 yer ve 12 ağaç");
}

test("panorama images are served to office roles only", async ({ page }) => {
  test.skip(!run, "synthetic panoramas missing (needs uv; see global setup)");
  await createParcel();
  // Local set ids encode the run folder relative to LOCAL_PANORAMA_DIR.
  const url = `/ofis/panorama/${SET_IDS.local}/${sidecars[0].panorama_id}/2k`;
  // Storage: a redirect to a URL signed for the user.
  const stored = `/ofis/panorama/${SET_IDS.storage}/${assetId("full", 0)}`;

  await login(page, "field@example.com", "/ofis");
  const ok = await page.request.get(url);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toBe("image/webp");
  expect((await page.request.get(url.replace("/2k", "/8k"))).status()).toBe(404);
  for (const [variant, file] of [
    ["2k", sidecars[0].preview],
    ["4k", sidecars[0].image],
  ] as const) {
    const redirect = await page.request.get(`${stored}/${variant}`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(302);
    expect(redirect.headers()["location"]).toContain(file.sha256);
    const image = await page.request.get(`${stored}/${variant}`);
    expect(image.status()).toBe(200);
    expect((await image.body()).length).toBe(readFileSync(join(run!, file.path)).length);
  }
  await page.getByRole("button", { name: "Çıkış" }).click();
  await page.waitForURL("/giris");

  await login(page, "owner@example.com", "/portal");
  expect((await page.request.get(url)).status()).toBe(403);
  expect((await page.request.get(`${stored}/2k`, { maxRedirects: 0 })).status()).toBe(403);
  await removeParcel();
});
