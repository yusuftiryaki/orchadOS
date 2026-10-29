import { expect, test, type Page } from "@playwright/test";
import { login, shot } from "./helpers";
import { buildRefundFixture, type RefundFixture } from "./visit-billing-fixtures";

// Chapter 08: refunds, garden removals, the 8A reconciliation, KVKK
// requests, notifications and the audit log
// (docs/kilavuz/08-iade-cikarma-mutabakat-kvkk.md). The synthetic owners of
// visit-billing-fixtures.ts give each state; nothing is changed here.

test.describe.configure({ mode: "serial" });

let fx: RefundFixture;

test.beforeAll(async () => {
  test.setTimeout(300_000);
  fx = await buildRefundFixture();
});

const wide = (page: Page, height = 800) => page.setViewportSize({ width: 1600, height });

test("iadeler", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon/iade");
  const list = page.getByTestId("refund-list");
  const manual = list.locator("tr[data-status=requested]").first();
  await shot(page, "iade-cikarma/01-iadeler.png", [
    { target: page.getByRole("navigation", { name: "İade durumu" }), n: 1 },
    { target: manual.locator("td a").first(), n: 2 },
    { target: manual.getByText("Örnek Sahip Hemen"), n: 3 },
    { target: manual.getByText("Sistem"), n: 4 },
    { target: manual.getByText("İstendi", { exact: true }), n: 5 },
    { target: manual.getByLabel("Banka referansı"), n: 6 },
    { target: manual.getByRole("button", { name: "Havale iadesi yapıldı" }), n: 7 },
    { target: manual.getByText("Vazgeç", { exact: true }), n: 8 },
  ]);

  await page.goto("/operasyon/iade?durum=failed");
  const failed = page.getByTestId("refund-list").locator("tr[data-status=failed]").first();
  await failed.getByText("Sonucu elle kaydet").click();
  await expect(
    failed.getByLabel("Sağlayıcı referansı (kartta başarılı için zorunlu)"),
  ).toBeVisible();
  await shot(page, "iade-cikarma/02-basarisiz-iade.png", [
    { target: failed.getByText("provider_error"), n: 1 },
    { target: failed.getByRole("button", { name: /^İşle/ }), n: 2 },
    { target: failed.getByLabel("Sağlayıcı referansı (kartta başarılı için zorunlu)"), n: 3 },
    { target: failed.getByRole("button", { name: "Başarılı" }), n: 4 },
    { target: failed.getByRole("button", { name: "Başarısız" }), n: 5 },
  ]);
});

test("bahçe çıkarma listesi", async ({ page }) => {
  await wide(page);
  await login(page, "ops@example.com", "/operasyon/cikarma");
  const list = page.getByTestId("removal-list");
  const blocked = list.locator("tr[data-blocked]").first();
  await shot(page, "iade-cikarma/03-cikarma-listesi.png", [
    { target: page.getByTestId("removal-filters"), n: 1 },
    { target: list.locator("tbody tr td").first(), n: 2 },
    { target: list.locator("tbody tr td a").first(), n: 3, at: "below" },
    { target: blocked.getByText("Engelli"), n: 4, at: "below" },
    { target: list.locator("thead th").nth(6), n: 5, at: "below" },
    { target: list.locator("thead th").nth(8), n: 6, at: "below" },
  ]);
});

test("çıkarma talebi", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1440 });
  await login(page, "ops@example.com", `/operasyon/cikarma/${fx.requestedRemoval}`);
  await shot(page, "iade-cikarma/04-cikarma-talebi.png", [
    { target: page.getByTestId("removal-calendar"), n: 1 },
    { target: page.getByTestId("removal-facts").getByText("Müşterinin seçtiği zaman"), n: 2 },
    { target: page.getByRole("heading", { name: "İade hesabı" }), n: 3 },
    { target: page.getByTestId("removal-context"), n: 4 },
    { target: page.getByTestId("removal-access-scope"), n: 5 },
    { target: page.getByLabel("Çıkış günü"), n: 6 },
    { target: page.getByLabel("Erişim süresi (gün)"), n: 7 },
    { target: page.getByText("Herkesin erişimini kaldır", { exact: true }), n: 8 },
    { target: page.getByTestId("removal-not-due"), n: 9 },
    { target: page.getByRole("button", { name: "Çıkarmayı iptal et" }), n: 10 },
  ]);
});

test("ops'un açtığı çıkarma (devir)", async ({ page }) => {
  await login(page, "ops@example.com", `/operasyon/cikarma/${fx.scheduledRemoval}`);
  const facts = page.getByTestId("removal-facts");
  await shot(page, "iade-cikarma/05-cikarma-devir.png", [
    { target: page.getByTestId("removal-calendar").getByText("Erişim sonu"), n: 1 },
    { target: facts.getByText("Neden", { exact: true }), n: 2 },
    { target: facts.getByText("Bildirim kuralı"), n: 3 },
    { target: facts.getByText("Sahip'in yazılı onayı", { exact: true }), n: 4 },
    { target: page.getByTestId("schedule-hint"), n: 5 },
  ]);
});

test("engelli çıkarma", async ({ page }) => {
  test.skip(!fx.blockedRemoval, "blocked removal not made");
  await page.setViewportSize({ width: 1280, height: 1200 });
  await login(page, "ops@example.com", `/operasyon/cikarma/${fx.blockedRemoval}`);
  await shot(page, "iade-cikarma/06-cikarma-engelli.png", [
    { target: page.getByTestId("removal-blocked"), n: 1 },
    { target: page.getByTestId("removal-pending-orders"), n: 2 },
    { target: page.getByLabel("Bahçenin bugün hizmetten çıkacağını biliyorum."), n: 3 },
    { target: page.getByRole("button", { name: "Hemen tamamla" }), n: 4 },
  ]);
});

test("tamamlanan çıkarma", async ({ page }) => {
  await login(page, "ops@example.com", `/operasyon/cikarma/${fx.completedRemoval}`);
  const refunds = page.getByTestId("removal-refunds");
  await refunds.scrollIntoViewIfNeeded();
  await shot(page, "iade-cikarma/07-cikarma-tamamlandi.png", [
    { target: page.getByRole("heading", { name: "Açılan iadeler" }), n: 1 },
    { target: page.getByRole("link", { name: "İadeler sayfasını aç" }), n: 2 },
    { target: refunds.locator("tbody tr").first(), n: 3 },
  ]);
});

test("ziyaret mutabakatı", async ({ page }) => {
  await wide(page);
  await login(page, "ops@example.com", "/operasyon/mutabakat");
  const row = page.getByTestId("reconciliation-list").locator("tbody tr").first();
  await shot(page, "iade-cikarma/08-mutabakat.png", [
    { target: page.getByRole("navigation", { name: "Görev durumu" }), n: 1 },
    { target: row.getByText("Dönem sonunda çıkış"), n: 2 },
    { target: page.getByTestId("reconciliation-list").locator("thead th").nth(7), n: 3 },
    { target: page.getByTestId("reconciliation-list").locator("thead th").nth(9), n: 4 },
    { target: row.locator("select"), n: 5 },
    { target: row.locator("input[name=note]"), n: 6 },
    { target: row.getByRole("button", { name: "Kapat" }), n: 7 },
  ]);
});

test("kvkk talepleri", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon/kvkk");
  const row = page.getByTestId("kvkk-request-table").locator("tbody tr").first();
  await shot(page, "iade-cikarma/09-kvkk.png", [
    { target: page.getByRole("navigation", { name: "Başvuru durumu" }), n: 1 },
    { target: row.locator("td").nth(2), n: 2 },
    { target: row.getByText(/gün kaldı/), n: 3, at: "below" },
    { target: row.getByLabel("Durum"), n: 4 },
    { target: row.getByRole("button", { name: "Durumu kaydet" }), n: 5 },
  ]);
});

test("bildirimler", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon/bildirimler");
  const table = page.getByTestId("notification-table");
  const first = table
    .locator("tbody tr")
    .filter({ has: page.locator("td a") })
    .first();
  await shot(page, "iade-cikarma/10-bildirimler.png", [
    { target: page.getByTestId("notification-status-filter"), n: 1 },
    { target: first.locator("td a"), n: 2 },
    { target: first.getByTestId("masked-phone"), n: 3 },
    { target: first.locator("td").nth(3), n: 4 },
    { target: first.getByText("Bekliyor"), n: 5 },
  ]);
  await page.goto("/operasyon/bildirimler?durum=failed");
  const failed = page.getByTestId("notification-table").locator("tbody tr").first();
  await shot(page, "iade-cikarma/11-bildirim-basarisiz.png", [
    { target: failed.getByText("Başarısız", { exact: true }), n: 1 },
    { target: failed.getByText("Sağlayıcı hatası"), n: 2 },
    { target: failed.getByRole("button", { name: "Yeniden kuyruğa al" }), n: 3 },
  ]);
});

test("denetim kaydı", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon/denetim-kaydi?tur=garden_removal");
  const filter = page.getByTestId("audit-filter");
  const row = page.getByTestId("audit-log").locator("tbody tr").first();
  await shot(page, "iade-cikarma/12-denetim-kaydi.png", [
    { target: filter.getByLabel("Kayıt türü"), n: 1 },
    { target: filter.getByLabel("Kayıt kimliği"), n: 2 },
    { target: filter.getByLabel("Eylem öneki"), n: 3 },
    { target: filter.getByRole("button", { name: "Uygula" }), n: 4 },
    { target: row.locator("td").nth(1).getByText("Operasyon"), n: 5 },
    { target: row.getByText("Bahçe hizmetten çıkarıldı"), n: 6 },
    { target: row.locator("td").last().locator("*").first(), n: 7 },
  ]);
});
