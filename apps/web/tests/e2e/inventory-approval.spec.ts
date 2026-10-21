import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { resolveSupabaseEnv } from "../local-supabase";
import {
  createInventoryFixture,
  INVENTORY_TEST as T,
  purgeInventoryFixture,
} from "./inventory-fixtures";

// After the triangulation: the office sets tree attributes and creates the
// verification tour and closes its items, the expert approves the inventory,
// the owner approves the boundary (a viewer cannot). One parcel, built by
// tests/e2e/inventory-fixtures.ts and removed afterwards.

test.describe.configure({ mode: "serial" });

const env = resolveSupabaseEnv();
const admin = createClient<Database>(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test.beforeAll(async () => {
  await createInventoryFixture(admin);
});
test.afterAll(() => purgeInventoryFixture());

const WORKSPACE = `/ofis/parsel/${T.parcel}/envanter/duzenle`;

async function login(page: Page, email: string) {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(T.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname !== "/giris");
}

// Clicks a slot on an inventory map through its map instance (no basemap needed).
async function clickSlot(page: Page, testId: string, code: string, shift = false) {
  const map = page.getByTestId(testId);
  await expect(map).toHaveAttribute("data-map-ready", "true");
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
  await map.click({ position: { x: point.x, y: point.y }, modifiers: shift ? ["Shift"] : [] });
}

test("office sets tree attributes and runs the verification tour", async ({ page }) => {
  await login(page, T.users.field);
  await page.goto(`/ofis/parsel/${T.parcel}`);
  await page.getByRole("link", { name: "Özellikler, altyapı, sınır ve doğrulama" }).click();
  await expect(page).toHaveURL(WORKSPACE);

  // Attributes: row 1 in bulk, then S2-3 picked on the map.
  const attributes = page.getByTestId("tree-attributes");
  await attributes.getByTestId("attribute-row").selectOption("1");
  await attributes.getByRole("button", { name: "Görünenlerin hepsini seç" }).click();
  await expect(attributes.getByTestId("attribute-selected")).toHaveText("2 ağaç seçili");
  await attributes.getByTestId("bulk-age").selectOption("productive");
  await attributes.getByTestId("bulk-graft").selectOption("grafted");
  await attributes.getByTestId("bulk-apply").click();
  await expect(attributes.getByRole("status")).toHaveText("2 ağaç güncellendi.");
  await attributes.getByTestId("attribute-row").selectOption("all");
  await expect(attributes.locator('tr[data-code="S1-1"]')).toContainText("Verimli");
  await expect(attributes.locator('tr[data-code="S1-2"]')).toContainText("Aşılı");

  await attributes.getByRole("button", { name: "Seçimi temizle" }).click();
  await clickSlot(page, "workspace-map", "S2-3");
  await expect(attributes.getByTestId("attribute-selected")).toHaveText("1 ağaç seçili");
  await attributes.getByTestId("bulk-age").selectOption("sapling");
  await attributes.getByTestId("bulk-graft").selectOption("ungrafted");
  await attributes.getByTestId("bulk-apply").click();
  await expect(attributes.locator('tr[data-code="S2-3"]')).toContainText("Fidan");
  await expect(attributes.locator('tr[data-code="S2-3"]')).toContainText("Aşısız");

  // Verification list from the saved inventory.
  await page.getByRole("tab", { name: "Doğrulama" }).click();
  const candidates = page.getByTestId("candidate-table");
  await expect(candidates.locator("tbody tr")).toHaveCount(3);
  await expect(candidates.locator('tr[data-code="S1-3"]')).toContainText("Boş yer");
  await expect(candidates.locator('tr[data-code="S2-1"]')).toContainText("Emin değilim");
  await expect(candidates.locator('tr[data-code="S2-2"]')).toContainText("Belirsizlik yüksek");
  await candidates.locator('tr[data-code="S1-3"]').getByLabel("Fidan olabilir").check();
  await candidates.getByLabel("Not S1-3").fill("Dipte fidan olabilir");
  await page.getByTestId("create-tour").click();
  await expect(page.getByTestId("workspace-message")).toHaveText(
    "Doğrulama turu oluşturuldu: 3 kalem.",
  );

  const tour = page.getByTestId("verification-tour");
  await expect(tour.getByTestId("tour-progress")).toHaveText("0 / 3 kaleme bakıldı");
  await expect(tour.locator('tr[data-code="S1-3"]')).toContainText("Fidan olabilir");
  await expect(tour.locator('tr[data-code="S1-3"]')).toContainText("Dipte fidan olabilir");
  const { data: session } = await admin
    .from("session")
    .select("kind, status")
    .eq("parcel_id", T.parcel)
    .eq("kind", "verification")
    .single();
  expect(session).toEqual({ kind: "verification", status: "planned" });

  // Results entered in the office (the field app's screen comes later).
  const s13 = tour.locator('tr[data-code="S1-3"]');
  await s13.getByLabel("Ağaç var").check();
  await s13.getByRole("textbox").fill("Fidan var, telefonla doğrulandı");
  await s13.getByRole("button", { name: "Bakıldı olarak kaydet" }).click();
  await expect(s13).toHaveAttribute("data-status", "checked");

  const s21 = tour.locator('tr[data-code="S2-1"]');
  await s21.getByLabel("Ağaç var").check();
  await s21.getByRole("button", { name: "Bakıldı olarak kaydet" }).click();
  await expect(s21).toHaveAttribute("data-status", "checked");

  const s22 = tour.locator('tr[data-code="S2-2"]');
  await s22.getByRole("textbox").fill("Panoramada tek gövde görülüyor");
  await s22.getByRole("button", { name: "Bakmadan kapat" }).click();
  await expect(s22).toHaveAttribute("data-status", "closed");
  await expect(tour.getByTestId("tour-progress")).toHaveText("3 / 3 kaleme bakıldı");

  // The sapling found on S1-3 is a new tree of the inventory.
  const { count } = await admin
    .from("tree")
    .select("id", { count: "exact", head: true })
    .eq("slot_id", "f6100000-0000-4000-8000-000000000013")
    .eq("status", "active");
  expect(count).toBe(1);
});

test("expert approves the inventory", async ({ page }) => {
  await login(page, T.users.expert);
  await expect(page).toHaveURL("/uzman");
  const row = page.getByTestId("inventory-queue").locator(`[data-session-id="${T.session}"]`);
  await expect(row).toContainText(T.name);
  await expect(row).toContainText("6"); // slots
  await row.getByRole("link", { name: "İncele" }).click();
  await expect(page).toHaveURL(`/uzman/envanter/${T.session}`);

  const summary = page.getByTestId("inventory-summary");
  await expect(summary.getByTestId("summary-slots")).toContainText("6");
  await expect(summary.getByTestId("summary-trees")).toContainText("6");
  await expect(summary.getByTestId("summary-empty")).toContainText("0");
  await expect(summary.getByTestId("summary-ungrafted")).toContainText("1");
  await expect(summary.getByTestId("summary-age-productive")).toContainText("2");
  await expect(page.getByTestId("coding-checks")).toContainText("Sorun bulunmadı.");
  await expect(page.getByTestId("verification-tours").locator("tbody tr")).toHaveCount(3);

  // The expert corrects one tree before signing.
  const attributes = page.getByTestId("tree-attributes");
  await clickSlot(page, "approval-map", "S2-1");
  await expect(attributes.getByTestId("attribute-selected")).toHaveText("1 ağaç seçili");
  await attributes.getByTestId("bulk-age").selectOption("young");
  await attributes.getByTestId("bulk-apply").click();
  await expect(attributes.locator('tr[data-code="S2-1"]')).toContainText("Genç");

  const approve = page.getByTestId("approve-inventory");
  await expect(approve.getByTestId("approve-submit")).toBeDisabled();
  await approve.getByTestId("approve-confirm").check();
  await approve.getByTestId("approve-submit").click();
  await expect(page.getByTestId("inventory-approved")).toBeVisible();
  await expect(page.getByTestId("approve-inventory")).toHaveCount(0);

  const { data: parcel } = await admin.from("parcel").select("status").eq("id", T.parcel).single();
  expect(parcel?.status).toBe("inventory_done");
  await page.goto("/uzman");
  await expect(page.locator(`[data-session-id="${T.session}"]`)).toHaveCount(0);
});

test("a viewer cannot approve the boundary; the owner does", async ({ page }) => {
  await login(page, T.users.viewer);
  await page.goto(`/portal/parsel/${T.parcel}`);
  let card = page.getByTestId("boundary-card");
  await expect(card.getByTestId("boundary-source")).toContainText("Sürüm 2 · Saha ölçümü");
  await expect(card.getByTestId("boundary-area")).toContainText("500 m²");
  await expect(card.getByTestId("boundary-area")).toContainText("0,5 dönüm");
  await expect(card).toContainText("tapu ya da mülkiyet sınırı değildir");
  await expect(card.getByTestId("boundary-awaiting")).toContainText(
    "Sınırı sadece parsel sahibi onaylayabilir.",
  );
  await expect(card.getByTestId("boundary-approve")).toHaveCount(0);
  await page.getByRole("button", { name: "Çıkış" }).click();
  await page.waitForURL("/giris");

  await login(page, T.users.owner);
  await page.goto(`/portal/parsel/${T.parcel}`);
  card = page.getByTestId("boundary-card");
  await expect(card.getByTestId("boundary-map")).toHaveAttribute("data-map-ready", "true");
  await expect(card).toContainText("Soluk kesikli çizgi");
  // The inventory is approved: its summary is on the card.
  const inventory = page.getByTestId("portal-inventory");
  await expect(inventory).toContainText("Uzman onayı");
  await expect(inventory.getByTestId("summary-trees")).toContainText("6");

  await expect(card.getByTestId("boundary-approve")).toBeDisabled();
  await card.getByTestId("boundary-confirm").check();
  await card.getByTestId("boundary-approve").click();
  await expect(card.getByTestId("boundary-approved")).toContainText("Siz");
  await expect(card.getByTestId("boundary-approved")).toContainText("tarihinde onayladı");

  const { data: boundary } = await admin
    .from("boundary")
    .select("owner_approved_at")
    .eq("parcel_id", T.parcel)
    .eq("version", 2)
    .single();
  expect(boundary?.owner_approved_at).toBeTruthy();
});
