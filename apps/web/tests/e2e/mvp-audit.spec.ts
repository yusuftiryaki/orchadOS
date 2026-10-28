import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import {
  ASSET,
  createPortalFixture,
  PORTAL,
  purgePortalFixture,
  treeId,
} from "../integration/portal-fixture";
import { purgeSessions, purgeViewerInvitations } from "../local-db";
import { resolveSupabaseEnv } from "../local-supabase";

// Features added by the MVP gap audit (docs/mvp-denetimi.md): report card
// dimensions and map layers, photo evidence with the hash check, the 360°
// view direction, co-owner invitations through ops, and the server-side
// close-up list on a scan's visit page.

test.describe.configure({ mode: "serial" });

const SEED_PARCEL = "c0000000-0000-4000-8000-000000000001";
const SEED_ORG = "b0000000-0000-4000-8000-000000000001";
const SCAN = "e2700000-0000-4000-8000-000000000001";
const PHONE = "+905559876501";

async function cleanup() {
  await purgeViewerInvitations([PHONE]);
  await purgeSessions([SCAN]);
}

test.beforeAll(async () => {
  const env = resolveSupabaseEnv();
  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await cleanup();
  await createPortalFixture(admin as never);
  const { error } = await admin.from("session").insert({
    id: SCAN,
    org_id: SEED_ORG,
    parcel_id: SEED_PARCEL,
    kind: "periodic_scan",
    status: "planned",
    planned_date: "2027-04-20",
  });
  if (error) throw error;
});
test.afterAll(async () => {
  await purgePortalFixture();
  await cleanup();
});

const REPORT = `/portal/parsel/${PORTAL.parcelA}`;

async function login(page: Page, email: string, password: string, next: string) {
  await page.goto(`/giris?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname !== "/giris");
}

test("report card dimensions and health map layers", async ({ page }) => {
  await login(page, PORTAL.users.owner, PORTAL.password, REPORT);
  const dims = page.getByTestId("dimensions");
  await expect(dims.locator('[data-dimension="inventory"]')).toContainText(
    "6 yer, 5 ağaç, 1 boş yer, 0 ara ağaç",
  );
  await expect(dims.locator('[data-dimension="structure"]')).toContainText("1 dişi, 0 erkek");
  await expect(dims.locator('[data-dimension="pattern"]')).toContainText("2 ağacın yarısı");
  await expect(dims.locator('[data-dimension="audit"]')).toContainText("2 panorama");

  // Visit selector and "changed in this visit".
  const controls = page.getByTestId("map-controls");
  await expect(controls.getByTestId("changed-count")).toHaveText("2 ağaç değişti");
  await controls.getByTestId("changed-only").check();
  await expect(page.locator('button[data-state="attention"]')).toContainText("(1)");
  await expect(page.locator('button[data-state="healthy"]')).toContainText("(1)");
  await controls.getByTestId("changed-only").uncheck();
  await controls.getByTestId("visit-select").selectOption(PORTAL.visitOld);
  await expect(page.locator('button[data-state="healthy"]')).toContainText("(3)");
  await expect(controls.getByTestId("changed-count")).toContainText("denetim yok");

  // Layers from the URL: heat cells and coverage.
  await page.goto(`${REPORT}?katman=isi,kapsama#harita`);
  await expect(page.getByTestId("layer-heat")).toBeChecked();
  const legend = page.getByTestId("coverage-legend");
  await expect(legend).toContainText("En az iki yönden görüntülendi (1)");
  await expect(legend).toContainText("Görüntü yok (4)");
  const map = page.getByTestId("parcel-map");
  await expect(map).toHaveAttribute("data-map-ready", "true");
  const counts = await map.evaluate(async (el) => {
    const m = (el as HTMLElement & { __map: import("maplibre-gl").Map }).__map;
    const data = async (id: string) =>
      (
        (await (
          m.getSource(id) as import("maplibre-gl").GeoJSONSource
        ).getData()) as GeoJSON.FeatureCollection
      ).features.length;
    // No scan trace for owners (H05, T23).
    return { cells: await data("cells"), trace: m.getSource("coverage-trace") ?? null };
  });
  expect(counts).toEqual({ cells: 2, trace: null });
});

test("photo evidence and the integrity check", async ({ page }) => {
  await login(page, PORTAL.users.owner, PORTAL.password, `${REPORT}/agac/${treeId("S1-1")}`);
  await expect(page.getByTestId("class-timeline").locator("li")).toHaveCount(2);
  const photo = page.locator(`[data-photo-id="${ASSET.cropPubN}"]`);
  await photo.getByText("Kanıt bilgisi").click();
  const evidence = photo.getByTestId("photo-evidence");
  await expect(evidence).toContainText("SHA-256");
  await evidence.getByRole("button", { name: "Bütünlüğü doğrula" }).click();
  await expect(evidence.getByTestId("hash-check")).toHaveAttribute("data-state", "match");
  await expect(evidence).toContainText("Doğrulandı");
});

test("the tour shows where the camera looks", async ({ page }) => {
  await login(page, PORTAL.users.owner, PORTAL.password, `${REPORT}/gezi`);
  const map = page.getByTestId("parcel-map");
  await expect(map).toHaveAttribute("data-map-ready", "true");
  await expect
    .poll(() =>
      map.evaluate(async (el) => {
        const m = (el as HTMLElement & { __map: import("maplibre-gl").Map }).__map;
        const data = (await (
          m.getSource("view") as import("maplibre-gl").GeoJSONSource
        ).getData()) as GeoJSON.FeatureCollection;
        return data.features.length;
      }),
    )
    .toBe(1);
});

test("owner invites a co-owner; ops sees and rejects the invitation", async ({ page }) => {
  await login(page, "owner@example.com", "orchados-dev", `/portal/parsel/${SEED_PARCEL}`);
  const card = page.getByTestId("viewers-card");
  await expect(card).toContainText("Örnek Hissedar");
  const form = card.getByTestId("invite-viewer");
  await form.getByLabel("Ad soyad").fill("E2E Hissedar");
  await form.getByLabel("Telefon").fill("0555 987 65 01");
  await form.getByRole("button", { name: "Hissedar davet et" }).click();
  await expect(page.getByTestId("viewers-card")).toContainText("Davetiniz alındı");
  await expect(page.locator('[data-viewer-status="pending"]')).toContainText("E2E Hissedar");
  await expect(page.locator('[data-viewer-status="pending"]')).toContainText("•• 01");

  await page.context().clearCookies();
  await login(page, "ops@example.com", "orchados-dev", "/operasyon");
  const invitations = page.getByTestId("viewer-invitations");
  const row = invitations.locator("li", { hasText: "E2E Hissedar" });
  await expect(row).toContainText(PHONE);
  await row.getByRole("button", { name: "Reddet" }).click();
  await expect(page.getByText("Davet reddedildi")).toBeVisible();
});

test("ops sees the server-side close-up list of a planned scan", async ({ page }) => {
  await login(page, "ops@example.com", "orchados-dev", `/operasyon/ziyaret/${SCAN}`);
  const list = page.getByTestId("closeup-list");
  await expect(list).toContainText("Yakın plan listesi · 31 ağaç");
  await expect(list.locator('[data-reason="sample"]')).toContainText("31");
});
