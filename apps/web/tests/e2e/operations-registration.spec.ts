import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { purgeParcels } from "../local-db";
import { resolveSupabaseEnv } from "../local-supabase";

// Operations screens in the browser: ops registers a new owner (portal account
// with a one-time password), their parcel with a rough boundary drawn on the
// map, and plans the first inventory visit; the owner then signs in and sees
// only that parcel. The test removes its parcel and account at the end.

const PASSWORD = "orchados-dev";
const run = Date.now().toString(36);
const OWNER_EMAIL = `e2e-owner-${run}@example.test`;
const PARCEL_NAME = `Tarayıcı Bahçesi ${run}`;

// About 90 m x 110 m near 37.40 E 37.02 N.
const RING: [number, number][] = [
  [37.4, 37.02],
  [37.401, 37.02],
  [37.401, 37.021],
  [37.4, 37.021],
];

const env = resolveSupabaseEnv();
const admin = createClient<Database>(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const dayIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function login(page: Page, email: string, password: string, next: string) {
  await page.goto(`/giris?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname === next);
}

// Clicks the map at each [lon, lat], projected through the map instance.
async function clickOnMap(map: Locator, points: [number, number][]) {
  await expect(map).toHaveAttribute("data-map-ready", "true");
  const pixels = await map.evaluate(async (el, pts) => {
    const m = (el as HTMLElement & { __map: import("maplibre-gl").Map }).__map;
    const lons = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    m.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)],
      ],
      { padding: 80, animate: false },
    );
    // Not "idle": that waits for basemap tiles, which may be unreachable in CI.
    await new Promise((resolve) => m.once("render", resolve));
    return pts.map((p) => m.project(p));
  }, points);
  for (const p of pixels) {
    await map.click({ position: { x: p.x, y: p.y } });
  }
}

let parcelId: string | null = null;
let ownerUserId: string | null = null;

test.afterAll(async () => {
  if (parcelId) await purgeParcels([parcelId]);
  if (ownerUserId) await admin.auth.admin.deleteUser(ownerUserId);
});

test("ops registers an owner and a parcel with its boundary, and plans the inventory visit", async ({
  page,
}) => {
  await login(page, "ops@example.com", PASSWORD, "/operasyon");
  await expect(page.getByRole("heading", { name: "Operasyon panosu" })).toBeVisible();
  await expect(page.getByTestId("visit-counts")).toBeVisible();

  // 1. Owner
  await page.getByRole("main").getByRole("link", { name: "Yeni sahip", exact: true }).click();
  await expect(page).toHaveURL("/operasyon/sahip/yeni");
  const ownerForm = page.getByTestId("owner-form");
  await ownerForm.getByLabel("Ad soyad").fill("Tarayıcı Sahibi");
  await ownerForm
    .getByLabel("Telefon")
    .fill(`0555 ${Math.floor(1_000_000 + Math.random() * 8_999_999)}`);
  await ownerForm.getByLabel("E-posta").fill(OWNER_EMAIL);
  await ownerForm.getByLabel("İletişim tercihi").selectOption("whatsapp");

  // Without consent nothing is stored.
  await ownerForm.getByRole("button", { name: "Sahibi kaydet" }).click();
  await expect(ownerForm.getByRole("alert").first()).toBeVisible();
  await expect(ownerForm.getByText("Gerekli.")).toBeVisible();

  await ownerForm.getByLabel("Aydınlatma metni verildi (okundu teyidi)").check();
  // T21: a registered version is chosen.
  await ownerForm.getByLabel("Aydınlatma metni sürümü").selectOption("kvkk-v2-taslak");
  await ownerForm.getByRole("button", { name: "Sahibi kaydet" }).click();

  const created = page.getByTestId("owner-created");
  await expect(created).toContainText("Portal hesabı açıldı.");
  await expect(page.getByTestId("login-email")).toHaveText(OWNER_EMAIL);
  const oneTimePassword = (await page.getByTestId("one-time-password").textContent())!.trim();
  expect(oneTimePassword).toMatch(/^[A-Za-z0-9]{14}$/);
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  ownerUserId = users.users.find((u) => u.email === OWNER_EMAIL)?.id ?? null;
  expect(ownerUserId).not.toBeNull();

  // 2. Parcel with the boundary drawn on the map
  await created.getByRole("link", { name: "Bu sahibe parsel ekle" }).click();
  await expect(page).toHaveURL(/\/operasyon\/parsel\/yeni\?sahip=/);
  const parcelForm = page.getByTestId("parcel-form");
  await expect(parcelForm.getByLabel("Sahip", { exact: true })).toHaveValue(/[0-9a-f-]{36}/);
  await parcelForm.getByLabel("Parsel adı").fill(PARCEL_NAME);
  await parcelForm.getByLabel(/^İl \(/).fill("Gaziantep");
  await parcelForm.getByLabel(/^İlçe/).fill("Nizip");
  await parcelForm.getByLabel("Tahmini alan (dönüm)").fill("9,5");
  await expect(parcelForm.getByLabel("Tahmini alan (m²)")).toHaveValue("9500");
  await parcelForm.getByLabel("Sulama").selectOption("rainfed");
  await parcelForm.getByLabel("Tahmini ağaç sayısı").fill("120");
  await expect(page.getByTestId("boundary-note")).toHaveText(
    "Fiili kullanım sınırıdır, mülkiyet iddiası değildir.",
  );

  const map = page.getByTestId("boundary-map");
  await clickOnMap(map, RING);
  await expect(page.getByTestId("boundary-points")).toHaveText("4 köşe");
  await expect(page.getByTestId("boundary-area")).toContainText("dönüm");
  // Undo and redo the last corner.
  await page.getByRole("button", { name: "Son köşeyi geri al" }).click();
  await expect(page.getByTestId("boundary-points")).toHaveText("3 köşe");
  await clickOnMap(map, [RING[3]]);
  await expect(page.getByTestId("boundary-points")).toHaveText("4 köşe");

  await parcelForm.getByLabel(/^Ada/).fill("12");
  await parcelForm.getByLabel("Parsel no").fill("34");
  await parcelForm.getByLabel("Yetki dayanağı").selectOption("title_holder");
  await parcelForm.getByLabel("Sahada sınırı gösterecek kişi").fill("Komşu");
  await parcelForm.getByLabel("Bu kişinin telefonu").fill("0532 000 00 99");
  await parcelForm.getByRole("button", { name: "Parseli kaydet" }).click();

  await expect(page).toHaveURL(/\/operasyon\/parsel\/[0-9a-f-]{36}\?bilgi=registered$/);
  parcelId = new URL(page.url()).pathname.split("/").pop()!;
  await expect(page.getByRole("heading", { name: PARCEL_NAME })).toBeVisible();
  await expect(page.getByText("Parsel kaydedildi.")).toBeVisible();
  await expect(page.getByTestId("parcel-status")).toHaveText("Kayıtlı");
  await expect(page.getByTestId("parcel-boundary")).toHaveText("Sınır v1 (sahip beyanı)");
  await expect(page.getByTestId("parcel-private")).toContainText("+905320000099");
  await expect(page.getByTestId("parcel-access")).toContainText("Tarayıcı Sahibi");
  await expect(page.getByTestId("parcel-access")).toContainText("Sahip");

  const { data: boundary } = await admin
    .from("boundary")
    .select("version, source")
    .eq("parcel_id", parcelId);
  expect(boundary).toEqual([{ version: 1, source: "owner_declared" }]);

  // 3. Inventory visit
  await page.getByRole("link", { name: "Ziyaret planla", exact: true }).click();
  const visitForm = page.getByTestId("visit-form");
  await expect(visitForm.getByLabel("Parsel")).toHaveValue(parcelId);
  // A scan visit shows its season.
  await visitForm.getByLabel("Ziyaret türü").selectOption("periodic_scan");
  await visitForm.getByLabel("Tarih").fill(`${new Date().getUTCFullYear() + 1}-01-15`);
  await expect(page.getByTestId("visit-season")).toHaveText(
    "Bu tarihte tarama kış ölçekleriyle değerlendirilir.",
  );
  await visitForm.getByLabel("Ziyaret türü").selectOption("inventory");
  await visitForm.getByLabel("Tarih").fill(dayIn(10));
  await visitForm.getByLabel("Sorumlu saha personeli").selectOption({ label: "field@example.com" });
  await visitForm.getByLabel("Not").fill("Sahip sınırı gösterecek");
  await visitForm.getByRole("button", { name: "Ziyaret planla" }).click();

  await expect(page).toHaveURL(/\/operasyon\/ziyaret\/[0-9a-f-]{36}\?bilgi=planned$/);
  await expect(page.getByTestId("visit-status")).toHaveText("Planlandı");
  await expect(page.getByTestId("visit-detail")).toContainText("field@example.com");

  // Moving the visit before it is captured.
  await page.getByTestId("visit-form").getByLabel("Tarih").fill(dayIn(11));
  await page.getByTestId("visit-form").getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Plan güncellendi.")).toBeVisible();

  await page.getByTestId("visit-detail").getByRole("link", { name: PARCEL_NAME }).click();
  await expect(page.getByTestId("parcel-status")).toHaveText("Envanter planlandı");
  await expect(page.getByTestId("parcel-visits")).toContainText("Envanter");

  // The dashboard lists it among the upcoming visits.
  await page.goto("/operasyon");
  await expect(page.getByTestId("upcoming-visits")).toContainText(PARCEL_NAME);

  // 4. The owner signs in with the one-time password and sees only their parcel.
  await page.getByRole("button", { name: "Çıkış" }).click();
  await login(page, OWNER_EMAIL, oneTimePassword, "/portal");
  // T15 (H30): an owner opened by ops first records the KVKK notice ("okudum",
  // "Kaydet"); the seed org has the co-owner flow on.
  const gate = page.getByTestId("notice-gate");
  await gate.getByLabel("Aydınlatma metnini okudum.").check();
  await gate.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByTestId("notice-gate")).toHaveCount(0);
  await expect(page.getByText(PARCEL_NAME)).toBeVisible();
  await expect(page.getByText("Örnek Bahçe 1")).toHaveCount(0);
});

test("only ops opens the operations screens", async ({ page }) => {
  await login(page, "field@example.com", PASSWORD, "/ofis");
  for (const path of ["/operasyon/sahip", "/operasyon/sahip/yeni", "/operasyon/ziyaret/yeni"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(403);
  }
});
