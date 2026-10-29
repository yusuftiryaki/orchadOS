import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { clickOnMap } from "../e2e/billing-helpers";
import { IMG_DIR, login, shot } from "./helpers";
import { buildOpsFixture, unstick, type OpsFixture } from "./ops-fixtures";

// Chapter 03: applications, garden verification, quotes, orders with their
// payment plan, payments and the receipt, as ops@ sees them. The states come
// from ops-fixtures.ts; forms are filled for the shot and, except where the
// chapter shows a refusal, not sent.

test.describe.configure({ mode: "serial" });
test.use({ actionTimeout: 15_000 });

let fx: OpsFixture;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fx = await buildOpsFixture();
});

// The innermost panel (section) titled `title`.
const panel = (page: Page, title: string | RegExp) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: title, exact: typeof title === "string" }) })
    .last();

const OPS = "ops@example.com";

test("başvuru listesi", async ({ page }) => {
  await login(page, OPS, "/operasyon/basvuru");
  const list = page.getByTestId("application-list");
  await expect(list).toBeVisible();
  const filters = page.getByTestId("application-filters");
  const row = list.locator("tbody tr").filter({ hasText: "Örnek Müşteri Bir" });
  await shot(page, "basvuru-siparis/01-basvuru-listesi.png", [
    { target: filters.getByRole("link").first(), n: 1, at: "below" },
    { target: filters.getByRole("link", { name: /İncelemede/ }), n: 2, at: "below" },
    { target: row.getByRole("link").first(), n: 3 },
    { target: row.locator("td").nth(6), n: 4, at: "center" },
    { target: list.getByRole("link", { name: "Teklifi aç" }).first(), n: 5 },
  ]);
});

test("başvuru: inceleme", async ({ page }) => {
  await login(page, OPS, `/operasyon/basvuru/${fx.reviewApp}`);
  const gardens = page.getByTestId("application-gardens");
  await expect(gardens).toBeVisible();
  await expect(page.getByTestId("gardens-map")).toBeVisible();
  await page.waitForTimeout(1500);
  const open = gardens.locator("tbody tr").filter({ hasText: "Güney" });
  await unstick(page);
  await shot(
    page,
    "basvuru-siparis/02-basvuru-inceleme.png",
    [
      { target: page.getByTestId("application-facts"), n: 1 },
      { target: gardens, n: 2 },
      { target: open.getByRole("link", { name: "Doğrula" }), n: 3, at: "below" },
      { target: page.getByTestId("gardens-map"), n: 4 },
      { target: page.getByTestId("garden-overlaps"), n: 5 },
      { target: page.getByTestId("quote-preview-section"), n: 6 },
      { target: page.getByRole("heading", { name: "Teklif ver", exact: true }), n: 7 },
      { target: page.getByTestId("reject-application"), n: 8 },
      { target: page.getByTestId("application-internal"), n: 9 },
    ],
    { fullPage: true },
  );
});

test("bahçe doğrulama", async ({ page }) => {
  await login(page, OPS, `/operasyon/basvuru/${fx.reviewApp}/bahce/${fx.reviewGardens.open}`);
  const form = page.getByTestId("verify-garden-form");
  await expect(form).toBeVisible();
  const map = page.getByTestId("boundary-map");
  // Redraw the boundary a little smaller than the customer's.
  const lon = 37.553;
  const lat = 37.057;
  const d = 0.0005;
  await clickOnMap(map, [
    [lon - d, lat - d],
    [lon + d, lat - d],
    [lon + d, lat + d],
    [lon - d, lat + d],
  ]);
  await expect(page.getByTestId("boundary-points")).toHaveText("4 köşe");
  await form.getByLabel("Doğrulama notu (iç)").fill("Güney sınırı yol kenarına çekildi.");
  await unstick(page);
  await shot(
    page,
    "basvuru-siparis/03-bahce-dogrula.png",
    [
      { target: map, n: 1 },
      { target: page.getByTestId("boundary-points"), n: 2, at: "right" },
      { target: form.getByLabel("Doğrulanan alan (dönüm)"), n: 3 },
      { target: form.getByRole("button", { name: /Çizilen alanı kullan/ }), n: 4 },
      { target: form.getByLabel("Doğrulama notu (iç)"), n: 5 },
      { target: form.getByRole("button", { name: "Doğrulamayı kaydet" }), n: 6 },
      { target: page.getByTestId("garden-facts"), n: 7 },
      { target: panel(page, "Tapu ve erişim (kişisel veri)"), n: 8 },
    ],
    { fullPage: true },
  );
});

test("teklif önizlemesi ve indirim", async ({ page }) => {
  await login(page, OPS, `/operasyon/basvuru/${fx.readyApp}`);
  const section = page.getByTestId("quote-preview-section");
  await section.getByLabel("İndirim (%)").fill("10");
  await section.getByRole("button", { name: "Önizlemeyi indirimle hesapla" }).click();
  await page.waitForURL(/indirim=10/);
  const form = page.getByTestId("issue-quote-form");
  await form.getByLabel("İndirim açıklaması").fill("Komşu bahçe indirimi, Deneme Köyü");
  await form.getByLabel("Müşteriye not").fill("Envanter ziyaretini mart başında planlıyoruz.");
  await section.scrollIntoViewIfNeeded();
  await unstick(page);
  await shot(
    page,
    "basvuru-siparis/04-teklif-onizleme.png",
    [
      { target: section.getByLabel("İndirim (%)"), n: 1 },
      { target: section.getByRole("button", { name: "Önizlemeyi indirimle hesapla" }), n: 2 },
      { target: page.getByTestId("quote-preview"), n: 3 },
      { target: form.getByLabel("Hizmet başlangıcı"), n: 4 },
      { target: form.getByLabel("Geçerlilik (gün)"), n: 5 },
      { target: form.getByLabel("İndirim (%)"), n: 6 },
      { target: form.getByLabel("İndirim açıklaması"), n: 7 },
      { target: form.getByLabel("Müşteriye not"), n: 8 },
      { target: form.getByRole("button", { name: "Teklif ver" }), n: 9 },
    ],
    { fullPage: true },
  );
});

test("başvuruyu reddetme: konum nedeni not ister", async ({ page }) => {
  await login(page, OPS, `/operasyon/basvuru/${fx.readyApp}`);
  const reject = page.getByTestId("reject-application");
  await reject.locator("summary").click();
  const form = page.getByTestId("reject-form");
  await form.getByLabel("Neden").selectOption("out_of_service_area");
  await form.getByRole("button", { name: "Başvuruyu reddet" }).click();
  await expect(form.getByRole("alert")).toBeVisible();
  await unstick(page);
  await shot(
    page,
    "basvuru-siparis/05-basvuru-reddet.png",
    [
      { target: form.getByLabel("Neden"), n: 1, at: "right" },
      { target: form.getByLabel("İç not"), n: 2, at: "right" },
      { target: form.getByRole("button", { name: "Başvuruyu reddet" }), n: 3, at: "right" },
      { target: form.getByRole("alert"), n: 4, at: "right" },
    ],
    { clip: reject },
  );
});

test("ek bahçe başvurusu: üyelik, mükerrer kontrolü, ek teklif", async ({ page }) => {
  await login(page, OPS, `/operasyon/basvuru/${fx.addonApp}`);
  await expect(page.getByTestId("addon-section")).toBeVisible();
  await page.waitForTimeout(1500);
  await unstick(page);
  await shot(
    page,
    "basvuru-siparis/06-ek-basvuru.png",
    [
      { target: page.getByTestId("membership"), n: 1 },
      { target: page.getByTestId("gardens-map"), n: 2 },
      { target: page.getByTestId("garden-overlap").first(), n: 3 },
      { target: page.getByTestId("addon-preview-form"), n: 4 },
      { target: page.getByTestId("addon-preview"), n: 5 },
      { target: page.getByTestId("addon-quote-form"), n: 6 },
      { target: panel(page, "Ayrı dönemle teklif ver"), n: 7 },
    ],
    { fullPage: true },
  );
});

test("teklif sayfası", async ({ page }) => {
  await login(page, OPS, `/operasyon/teklif/${fx.quoteId}`);
  await expect(page.getByTestId("quote-facts")).toBeVisible();
  await shot(page, "basvuru-siparis/07-teklif.png", [
    {
      target: page.getByRole("main").getByRole("link", { name: "Başvuru", exact: true }),
      n: 1,
      at: "below",
    },
    { target: page.getByTestId("quote-facts"), n: 2 },
    { target: panel(page, "İç bilgi (müşteri görmez)"), n: 3 },
    { target: page.getByTestId("quote-lines"), n: 4 },
  ]);
});

test("başvurusuz teklif: parsel ve ek teklif", async ({ page }) => {
  await login(page, OPS, `/operasyon/teklif/yeni?ek=${fx.activeOrder}`);
  await expect(page.getByRole("heading", { name: /Ek teklif/ }).first()).toBeVisible();
  await unstick(page);
  await shot(page, "basvuru-siparis/08-ek-teklif-yeni.png", [], { fullPage: true });
  await page.goto(`/operasyon/teklif/yeni?siparis=${fx.activeOrder}`);
  const form = page.getByTestId("parcel-quote-form");
  await expect(form).toBeVisible();
  await unstick(page);
  await shot(
    page,
    "basvuru-siparis/09-yenileme-teklifi.png",
    [
      { target: form.getByText("Parseller", { exact: true }), n: 1 },
      { target: form.getByLabel("Paket"), n: 2 },
      { target: form.getByLabel("Hizmet başlangıcı"), n: 3 },
      { target: form.getByLabel("İlk yıl (envanter ücreti dahil)"), n: 4 },
      { target: form.getByLabel("Geçerlilik (gün)"), n: 5 },
      { target: form.getByRole("button", { name: "Teklif ver" }), n: 6 },
    ],
    { fullPage: true },
  );
});

test("sipariş listesi", async ({ page }) => {
  await login(page, OPS, "/operasyon/siparis");
  const list = page.getByTestId("order-list");
  await expect(list).toBeVisible();
  const late = list.locator("tbody tr").filter({ hasText: "Örnek Müşteri Beş" });
  await unstick(page);
  await shot(
    page,
    "basvuru-siparis/10-siparis-listesi.png",
    [
      { target: page.getByText(/ödeme 30 günden uzun süredir gecikmiş/), n: 1 },
      { target: page.getByRole("link", { name: /Ödeme bekleniyor/ }).first(), n: 2, at: "below" },
      { target: late.getByRole("link").first(), n: 3 },
      { target: late.getByText("Süresi geçti"), n: 4 },
      { target: page.getByTestId("overdue-installments"), n: 5 },
    ],
    { fullPage: true },
  );
});

test("sipariş ayrıntısı: ödeme planı ve havale", async ({ page }) => {
  await login(page, OPS, `/operasyon/siparis/${fx.activeOrder}`);
  const plan = page.getByTestId("order-plan");
  await expect(plan).toBeVisible();
  const manual = page.getByTestId("manual-payment-form");
  await manual.getByLabel("Tutar (TL)").fill("3.780,00");
  await manual.getByLabel("Banka referansı").fill("EFT-KILAVUZ-0002");
  await unstick(page);
  await shot(
    page,
    "basvuru-siparis/11-siparis-ayrinti.png",
    [
      { target: page.getByTestId("order-status"), n: 1, at: "below" },
      { target: page.getByRole("link", { name: "Yenileme teklifi ver" }), n: 2, at: "below" },
      { target: page.getByTestId("order-facts"), n: 3 },
      { target: plan.getByTestId("installment-1"), n: 4 },
      { target: plan.getByTestId("installment-2"), n: 5 },
      { target: manual.getByLabel("Ödeme"), n: 6 },
      { target: manual.getByLabel("Tutar (TL)"), n: 7 },
      { target: manual.getByLabel("Valör tarihi"), n: 8 },
      { target: manual.getByLabel("Banka referansı"), n: 9 },
      { target: manual.getByRole("button", { name: "Havaleyi kaydet" }), n: 10 },
    ],
    { fullPage: true },
  );
});

test("sipariş ayrıntısı: ödemesiz ziyarete izin", async ({ page }) => {
  await login(page, OPS, `/operasyon/siparis/${fx.activeOrder}`);
  const plan = page.getByTestId("order-plan");
  const row = plan.getByTestId("installment-2");
  await row.getByText("Ödemesiz ziyarete izin ver").click();
  const form = page.getByTestId("allow-visit-form-2");
  await form
    .getByLabel("Sahibin talebi (kanal ve tarih)")
    .fill("Portal mesajı, 29.10.2026: ödemeyi ay sonunda yapacağını yazdı.");
  await unstick(page);
  await shot(
    page,
    "basvuru-siparis/12-odemesiz-ziyaret.png",
    [
      { target: plan.getByTestId("installment-1"), n: 1, at: "right" },
      { target: row.getByText("Ödemesiz ziyarete izin ver"), n: 2, at: "below" },
      { target: form.getByLabel("Sahibin talebi (kanal ve tarih)"), n: 3 },
      { target: form.getByRole("button", { name: "İzin ver" }), n: 4 },
    ],
    { clip: plan },
  );
});

test("sipariş ayrıntısı: kalemler, ödemeler, belgeler", async ({ page }) => {
  await login(page, OPS, `/operasyon/siparis/${fx.activeOrder}`);
  const items = page.getByTestId("order-items");
  await items.scrollIntoViewIfNeeded();
  await shot(page, "basvuru-siparis/13-siparis-kalemler.png", [
    { target: items.getByTestId("order-parcel-link").first(), n: 1 },
    { target: items.getByTestId("order-item-state").first(), n: 2 },
    { target: page.getByTestId("order-payments").getByRole("link").first(), n: 3 },
    { target: page.getByTestId("order-contract-documents"), n: 4 },
  ]);
});

test("sipariş ayrıntısı: seyrek işlemler", async ({ page }) => {
  await login(page, OPS, `/operasyon/siparis/${fx.activeOrder}`);
  const withdrawal = page.getByTestId("record-withdrawal");
  await withdrawal.locator("summary").click();
  const remove = page.getByTestId("remove-gardens");
  await remove.locator("summary").click();
  const terminate = page.locator("details").filter({ hasText: "Siparişi feshet" });
  await terminate.locator("summary").click();
  const aside = withdrawal.locator("xpath=..");
  await unstick(page);
  await shot(
    page,
    "basvuru-siparis/14-siparis-islemler.png",
    [
      { target: withdrawal.locator("summary"), n: 1, at: "right" },
      { target: remove.locator("summary"), n: 2, at: "right" },
      { target: terminate.locator("summary"), n: 3, at: "right" },
    ],
    { clip: aside },
  );
});

test("ödeme bekleyen sipariş: süre uzatma ve iptal", async ({ page }) => {
  await login(page, OPS, `/operasyon/siparis/${fx.awaitingOrder}`);
  const extend = page.locator("details").filter({ hasText: "Ödeme süresini uzat" });
  await extend.locator("summary").click();
  const cancel = page.locator("details").filter({ hasText: "Siparişi iptal et" });
  await cancel.locator("summary").click();
  await unstick(page);
  await shot(
    page,
    "basvuru-siparis/15-odeme-bekleyen-siparis.png",
    [
      { target: page.getByTestId("order-status"), n: 1, at: "below" },
      { target: page.getByText("Süresi geçti").first(), n: 2 },
      { target: extend.locator("summary"), n: 3 },
      { target: cancel.locator("summary"), n: 4 },
    ],
    { fullPage: true },
  );
});

test("ödeme listesi ve ayrıntısı", async ({ page }) => {
  await login(page, OPS, "/operasyon/odeme");
  await expect(page.getByRole("heading", { name: "Ödemeler" })).toBeVisible();
  const row = page.locator("tbody tr").filter({ hasText: "Örnek Müşteri Dört" }).first();
  await shot(page, "basvuru-siparis/16-odeme-listesi.png", [
    { target: page.getByRole("link", { name: /Başarılı/ }).first(), n: 1, at: "below" },
    { target: page.getByRole("link", { name: /Havale\/EFT/ }).first(), n: 2, at: "below" },
    { target: row.getByRole("link").first(), n: 3 },
  ]);

  await page.goto(`/operasyon/odeme/${fx.activePayment}`);
  const refund = page.getByTestId("refund-form");
  await expect(refund).toBeVisible();
  await page
    .locator("details")
    .filter({ hasText: "Havale kaydını geri al" })
    .locator("summary")
    .click();
  await unstick(page);
  await shot(
    page,
    "basvuru-siparis/17-odeme-ayrinti.png",
    [
      { target: page.getByTestId("receipt-link"), n: 1, at: "below" },
      { target: page.getByTestId("payment-facts"), n: 2 },
      { target: refund.getByLabel("İade tutarı (TL)"), n: 3 },
      { target: refund.getByLabel("Neden"), n: 4 },
      { target: refund.getByRole("button", { name: "İadeyi iste" }), n: 5 },
      { target: page.getByTestId("void-form"), n: 6 },
    ],
    { fullPage: true },
  );
});

test("makbuz", async ({ page }) => {
  await login(page, OPS, "/operasyon/odeme");
  const response = await page.request.get(`/makbuz/${fx.activePayment}`);
  expect(response.ok()).toBeTruthy();
  const dir = mkdtempSync(join(tmpdir(), "kilavuz-makbuz-"));
  const pdf = join(dir, "makbuz.pdf");
  writeFileSync(pdf, await response.body());
  const out = resolve(IMG_DIR, "basvuru-siparis/18-makbuz");
  execFileSync("pdftoppm", ["-png", "-r", "80", "-f", "1", "-l", "1", "-singlefile", pdf, out]);
});
