import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "orchados-dev";
const SEED_PARCEL = "c0000000-0000-4000-8000-000000000001";

async function login(page: Page, email: string, next?: string) {
  await page.goto(next ? `/giris?next=${encodeURIComponent(next)}` : "/giris");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
}

test("signed-out users are sent to the login page", async ({ page }) => {
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/giris\?next=%2Fportal$/);
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill("owner@example.com");
  await page.getByLabel("Parola").fill("wrong");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  // Scoped to the form: Next.js adds its own (empty) route announcer alert.
  await expect(page.locator("form").getByRole("alert")).toHaveText("E-posta ya da parola hatalı.");
});

const LANDING: [string, string, string[]][] = [
  ["owner@example.com", "/portal", ["Bahçelerim"]],
  ["viewer@example.com", "/portal", ["Bahçelerim"]],
  ["field@example.com", "/ofis", ["Ofis"]],
  ["expert@example.com", "/uzman", ["Uzman paneli"]],
  ["ops@example.com", "/ofis", ["Ofis", "Operasyon"]],
];

for (const [email, landing, sections] of LANDING) {
  test(`${email} lands on ${landing} and sees the seed parcel`, async ({ page }) => {
    await login(page, email);
    await expect(page).toHaveURL(landing);
    const nav = page.getByRole("navigation", { name: "Bölümler" });
    await expect(nav.getByRole("link")).toHaveText(sections);
    await expect(page.locator(`[data-parcel-id="${SEED_PARCEL}"]`)).toBeVisible();
  });
}

const FORBIDDEN: [string, string[]][] = [
  ["owner@example.com", ["/uzman", "/ofis", "/operasyon"]],
  ["field@example.com", ["/portal", "/uzman", "/operasyon"]],
  ["expert@example.com", ["/portal", "/ofis", `/operasyon/parsel/${SEED_PARCEL}`]],
];

for (const [email, paths] of FORBIDDEN) {
  test(`${email} gets 403 outside its sections`, async ({ page }) => {
    await login(page, email);
    await page.waitForURL((url) => url.pathname !== "/giris");
    for (const path of paths) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(403);
      await expect(page.getByTestId("forbidden")).toBeVisible();
    }
  });
}

test("ops switches between sections", async ({ page }) => {
  await login(page, "ops@example.com");
  await expect(page).toHaveURL("/ofis");
  await page.getByRole("link", { name: "Operasyon" }).click();
  await expect(page).toHaveURL("/operasyon");
  await expect(page.getByRole("link", { name: "Operasyon" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("parcel map: clicking a tree opens its panel", async ({ page }) => {
  await login(page, "owner@example.com", `/portal/parsel/${SEED_PARCEL}`);
  await expect(page).toHaveURL(`/portal/parsel/${SEED_PARCEL}`);
  await expect(page.getByText("Sınır v2 · 310 yer, 302 aktif ağaç")).toBeVisible();

  const map = page.getByTestId("parcel-map");
  await expect(map).toHaveAttribute("data-map-ready", "true");

  // Find the pixel of slot S5-12 through the map instance and click it.
  const point = await map.evaluate(async (el) => {
    const m = (el as HTMLElement & { __map: import("maplibre-gl").Map }).__map;
    const source = m.getSource("slots") as import("maplibre-gl").GeoJSONSource;
    const data = (await source.getData()) as GeoJSON.FeatureCollection<GeoJSON.Point>;
    const feature = data.features.find((f) => f.properties?.code === "S5-12");
    const [lng, lat] = feature!.geometry.coordinates;
    m.jumpTo({ center: [lng, lat], zoom: 20 });
    // Not "idle": that waits for basemap tiles, which may be unreachable in CI.
    await new Promise((resolve) => m.once("render", resolve));
    return m.project([lng, lat]);
  });
  await map.click({ position: { x: point.x, y: point.y } });

  const panel = page.getByTestId("tree-panel");
  await expect(panel.getByRole("heading")).toHaveText("S5-12");
  await expect(panel).toContainText("Değerlendirilmedi");
});

test("unknown or hidden parcels are 404", async ({ page }) => {
  await login(page, "owner@example.com");
  await page.waitForURL("/portal");
  const response = await page.goto("/portal/parsel/00000000-0000-4000-8000-000000000000");
  expect(response?.status()).toBe(404);
});

test("logout ends the session", async ({ page }) => {
  await login(page, "viewer@example.com");
  await expect(page).toHaveURL("/portal");
  await page.getByRole("button", { name: "Çıkış" }).click();
  await expect(page).toHaveURL("/giris");
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/giris/);
});
