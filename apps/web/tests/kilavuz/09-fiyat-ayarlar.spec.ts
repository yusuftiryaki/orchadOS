import { test } from "@playwright/test";
import { login, shot } from "./helpers";

// Chapter 09: packages and price lists, billing settings and staff names
// (docs/kilavuz/09-fiyat-ayarlar-personel.md). Read only: the seed's
// packages, its published list (v1) and its draft (1 January revision), the
// local settings and the seed staff. Nothing is saved or published.

const STANDART = "91200000-0000-4000-8000-000000000001";
const PUBLISHED = "91200000-0000-4000-8000-000000000101";
const DRAFT = "91200000-0000-4000-8000-000000000102";

test("paketler ve fiyatlar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await login(page, "ops@example.com", "/operasyon/fiyat");
  const lists = page.getByTestId("price-lists");
  const packages = page.getByTestId("package-list");
  await shot(page, "fiyat-ayarlar/01-paketler-ve-fiyatlar.png", [
    { target: page.getByRole("button", { name: "Geçerli listeden taslak oluştur" }), n: 1 },
    { target: lists.locator(`tr[data-price-list-id="${PUBLISHED}"] a`), n: 2 },
    { target: lists.getByText("Bugün geçerli"), n: 3 },
    { target: lists.locator(`tr[data-price-list-id="${DRAFT}"] a`), n: 4 },
    { target: page.getByRole("button", { name: "Boş taslak aç" }), n: 5 },
    { target: packages.locator("tbody tr").first().locator("td").first(), n: 6 },
    { target: packages.getByRole("link", { name: /Düzenle/ }).first(), n: 7 },
    { target: page.getByRole("link", { name: "Yeni paket" }), n: 8 },
  ]);
});

test("paket formu", async ({ page }) => {
  await login(page, "ops@example.com", `/operasyon/fiyat/paket/${STANDART}`);
  const form = page.getByTestId("package-form");
  await shot(page, "fiyat-ayarlar/02-paket.png", [
    { target: form.getByLabel("Ad", { exact: true }), n: 1 },
    { target: form.getByLabel("Kod"), n: 2 },
    { target: form.getByLabel("Yıllık ziyaret"), n: 3 },
    { target: form.getByLabel("Sıra"), n: 4 },
    { target: form.getByLabel("Açıklama"), n: 5 },
    { target: form.getByLabel("Envanter dahil"), n: 6 },
    { target: form.getByLabel("Aktif"), n: 7 },
    { target: form.getByRole("button", { name: "Paketi kaydet" }), n: 8 },
  ]);
});

test("yayımlanmış liste", async ({ page }) => {
  await login(page, "ops@example.com", `/operasyon/fiyat/liste/${PUBLISHED}`);
  await shot(page, "fiyat-ayarlar/03-yayimlanmis-liste.png", [
    { target: page.getByText("Yayımlanmış liste değiştirilemez."), n: 1 },
    { target: page.getByTestId("price-list-facts"), n: 2 },
    { target: page.getByRole("button", { name: "Bundan taslak oluştur" }), n: 3 },
    { target: page.getByTestId("price-list-items"), n: 4 },
  ]);
});

test("taslak liste", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1150 });
  await login(page, "ops@example.com", `/operasyon/fiyat/liste/${DRAFT}`);
  const draft = page.getByTestId("price-list-draft");
  await shot(page, "fiyat-ayarlar/04-taslak-liste.png", [
    { target: draft.getByLabel("Geçerlilik başlangıcı"), n: 1 },
    { target: draft.getByLabel("KDV (%)"), n: 2 },
    { target: draft.getByLabel(/Birim fiyat/).first(), n: 3 },
    { target: draft.getByLabel(/Minimum ücret/).first(), n: 4 },
    { target: draft.getByLabel(/Envanter ücreti/).first(), n: 5 },
    { target: draft.getByRole("button", { name: "Taslağı kaydet" }), n: 6 },
    { target: page.getByLabel(/Fiyatları ve başlangıç tarihini kontrol ettim/), n: 7 },
    { target: page.getByRole("button", { name: "Listeyi yayımla" }), n: 8 },
    { target: page.getByText("Taslağı sil").first(), n: 9 },
  ]);
});

test("faturalama ayarları", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon/ayarlar");
  const form = page.getByTestId("settings-form");
  await shot(
    page,
    "fiyat-ayarlar/05-ayarlar.png",
    [
      { target: form.getByLabel("Dışarıdan kayıt açık"), n: 1 },
      { target: form.getByLabel("TCKN zorunlu"), n: 2 },
      { target: page.getByTestId("company-complete"), n: 3 },
      { target: form.getByLabel("IBAN"), n: 4 },
      { target: form.getByLabel("Ödeme süresi (gün)"), n: 5 },
      { target: form.getByLabel("Üyelik boyunca bahçe ekleme ve çıkarma açık"), n: 6 },
      { target: form.getByLabel("Çıkarmada iade"), n: 7 },
      { target: form.getByRole("button", { name: "Ayarları kaydet" }), n: 8 },
      { target: page.getByTestId("fake-payments"), n: 9 },
    ],
    { fullPage: true },
  );
});

test("personel", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon/personel");
  const table = page.getByTestId("staff-table");
  const field = table.locator("tr", { hasText: "field@example.com" });
  await shot(page, "fiyat-ayarlar/06-personel.png", [
    { target: field.getByText("Saha", { exact: true }), n: 1 },
    { target: field.locator("input[name=full_name]"), n: 2 },
    { target: field.locator("input[name=title]"), n: 3 },
    { target: field.getByTestId("staff-missing-title"), n: 4 },
    { target: field.getByRole("button", { name: "Adı ve unvanı kaydet" }), n: 5 },
  ]);
});
