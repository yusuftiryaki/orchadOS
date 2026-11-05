import { expect, test } from "@playwright/test";
import {
  admin,
  clickOnMap,
  E2E_DOMAIN,
  login,
  opsQuote,
  quotedApplication,
  removeJourneyUsers,
  uniquePhone,
  userIdByEmail,
  waitForCode,
} from "./billing-helpers";

// The customer journey in the browser (IP12-D): a brand-new visitor signs up
// (SMS code from the outbox), applies with a garden drawn on the map, ops
// verifies and quotes through the API, the customer fills the billing
// profile, accepts, pays the inventory installment with the fake card,
// downloads the receipt and pays the first visit installment. Then a
// declined card. The build runs with ORCHADOS_PAYMENTS_ENABLED=1 and
// PAYMENT_FAKE_CHECKOUT=1 (playwright.config.ts). Test accounts are removed
// at the end.

const run = Date.now().toString(36);
const EMAIL = `yolculuk-${run}@${E2E_DOMAIN}`;
const PHONE = uniquePhone();
const CUSTOMER_PASSWORD = "fistik-2026";

// About 90 m × 110 m (≈ 1 hectare) near 37.40 E 37.03 N.
const POSITION: [number, number] = [37.4005, 37.0305];
const RING: [number, number][] = [
  [37.4, 37.03],
  [37.401, 37.03],
  [37.401, 37.031],
  [37.4, 37.031],
];

test.describe.configure({ mode: "serial" });

test.beforeAll(() => removeJourneyUsers());
test.afterAll(() => removeJourneyUsers());

let applicationId = "";

test("a new visitor signs up, applies, accepts the quote and pays by card", async ({ page }) => {
  test.setTimeout(180_000);

  // 1. Sign-up
  await page.goto("/kayit");
  await page.getByLabel("Ad soyad").fill("Yolculuk Müşteri");
  await page.getByLabel("Cep telefonu").fill(PHONE.typed);
  await page.getByLabel("E-posta").fill(EMAIL);
  await page.getByLabel("Parola", { exact: true }).fill(CUSTOMER_PASSWORD);
  await page.getByLabel("Parola (tekrar)").fill(CUSTOMER_PASSWORD);
  await page.locator('input[name="kvkk_notice"]').check();
  const sentAfter = new Date(Date.now() - 1000);
  await page.getByRole("button", { name: "Kayıt ol ve kod gönder" }).click();
  await expect(page.getByLabel("SMS kodu")).toBeVisible();
  const code = await waitForCode(PHONE.e164, sentAfter);
  await page.getByLabel("SMS kodu").fill(code);
  await page.getByRole("button", { name: "Doğrula" }).click();
  await page.waitForURL("/portal");

  // 2. The empty portal invites an application.
  const nav = page.getByRole("navigation", { name: "Hesap" });
  await expect(nav.getByRole("link")).toHaveText([
    "Bahçelerim",
    "Başvurularım",
    "Siparişlerim",
    "Ödemelerim",
  ]);
  await expect(page.getByTestId("home-cta")).toContainText("Bahçenizi kaydedin");
  await page.getByRole("link", { name: "Başvuru yapın" }).click();
  await expect(page).toHaveURL("/portal/basvuru/yeni");
  // The first package (Temel) is preselected; this journey takes Standart.
  await page.getByRole("radio", { name: /Standart/ }).check();
  await page.getByRole("button", { name: "Taslağı aç" }).click();
  await expect(page.getByTestId("application-status")).toHaveText("Taslak");
  applicationId = new URL(page.url()).pathname.split("/").pop()!;

  // 3. A garden with its location and rough boundary on the map.
  await page.getByRole("link", { name: "Bahçe ekle", exact: true }).click();
  await page.getByLabel("Bahçe adı").fill("Yolculuk bahçesi");
  // No preselection: the customer chooses the fruit species.
  await expect(page.getByLabel("Meyve türü")).toHaveValue("");
  await page.getByLabel("Meyve türü").selectOption("zeytin");
  await page.getByLabel("İlçe").fill("Nizip");
  await page.getByLabel("Alan (dönüm)").fill("20");
  await page.getByLabel("Bahçe üzerindeki yetkiniz").selectOption("title_holder");
  const map = page.getByTestId("boundary-map");
  await clickOnMap(map, [POSITION]);
  await expect(page.getByTestId("position-state")).toHaveText("Yer işaretlendi.");
  await expect(map).toHaveAttribute("data-mode", "boundary");
  await clickOnMap(map, RING);
  await expect(page.getByTestId("boundary-points")).toHaveText("4 nokta");
  await expect(page.getByTestId("boundary-area")).toBeVisible();
  // Without the entry permission the form refuses and keeps the values.
  await page.getByRole("button", { name: "Bahçeyi kaydet" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "izin vermelisiniz" })).toBeVisible();
  await expect(page.getByLabel("Bahçe adı")).toHaveValue("Yolculuk bahçesi");
  await expect(page.getByLabel("Bahçe üzerindeki yetkiniz")).toHaveValue("title_holder");
  await expect(page.getByLabel("Meyve türü")).toHaveValue("zeytin");
  await expect(page.getByTestId("boundary-points")).toHaveText("4 nokta");
  await page
    .getByLabel(
      "Bu bahçeyi seçtiğim dayanakla fiilen kullanıyorum. Ekibinizin envanter ve ziyaretler için bahçeye girmesine izin veriyorum ve buna yetkiliyim.",
    )
    .check();
  await page.getByRole("button", { name: "Bahçeyi kaydet" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Bahçe kaydedildi." })).toBeVisible();
  await expect(page.getByTestId("garden-table")).toContainText("Yolculuk bahçesi");
  await expect(page.getByTestId("preview-total")).toHaveText("24.480,00 ₺");

  const saved = await admin
    .from("application_garden")
    .select("declared_area_m2, boundary")
    .eq("application_id", applicationId)
    .single();
  expect(saved.data?.declared_area_m2).toBe(20000);
  expect(saved.data?.boundary).not.toBeNull();

  await page.getByRole("button", { name: "Başvuruyu gönder" }).click();
  await expect(page.getByTestId("application-status")).toHaveText("İncelemede");
  await expect(page.getByTestId("application-timeline")).toContainText("Gönderildi");

  // 4. Ops verifies and quotes (API).
  const quoteId = await opsQuote(applicationId);

  // 5. The quote: billing profile first, then the two consents.
  await page.goto("/portal");
  await page.getByTestId("home-quote").getByRole("link", { name: "Teklifi inceleyin" }).click();
  await expect(page).toHaveURL(`/portal/teklif/${quoteId}`);
  await expect(page.getByTestId("quote-total")).toHaveText("24.480,00 ₺");
  await expect(page.getByTestId("quote-note")).toContainText("mart");
  // The payment plan before acceptance (H35): inventory now, then one payment
  // per periodic visit; the total equals the cash price.
  await expect(page.getByTestId("installment-plan").locator("tbody tr")).toHaveCount(5);
  await expect(page.getByTestId("installment-1")).toContainText("Envanter ödemesi");
  await expect(page.getByTestId("installment-1")).toContainText("7.200,00 ₺");
  await expect(page.getByTestId("installment-2")).toContainText("4.320,00 ₺");
  await expect(page.getByTestId("installment-total")).toHaveText("24.480,00 ₺");
  // The sign-up recorded the KVKK notice: no acknowledgement box.
  await expect(page.getByTestId("quote-kvkk")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Teklifi kabul et" })).toBeDisabled();
  await page.getByRole("link", { name: "Fatura bilgilerini girin" }).click();
  await expect(page).toHaveURL(/\/portal\/hesap\/fatura\?geri=/);
  await page.getByLabel("Ad", { exact: true }).fill("Yolculuk");
  await page.getByLabel("Soyad").fill("Müşteri");
  await page.getByLabel("Adres").fill("Cumhuriyet Mah. 5. Sok. No: 6");
  await page.getByLabel("İl", { exact: true }).fill("Gaziantep");
  await page.getByRole("button", { name: "Fatura bilgilerini kaydet" }).click();
  await expect(page).toHaveURL(`/portal/teklif/${quoteId}`);
  await expect(page.getByTestId("quote-billing")).toContainText("Fatura bilgileriniz tamam.");

  await page.getByLabel(/Ön Bilgilendirme Formu'nu okudum/).check();
  await page.getByLabel(/Mesafeli Hizmet Sözleşmesi'ni okudum/).check();
  // T03: the early-performance box is optional and unchecked; accepted without it.
  const early = page.getByTestId("quote-early-performance").getByRole("checkbox");
  await expect(early).not.toBeChecked();
  await page.getByRole("button", { name: "Teklifi kabul et" }).click();
  await expect(page).toHaveURL(/\/portal\/siparis\/[0-9a-f-]{36}\?bilgi=teklif_kabul_edildi$/);
  await expect(page.getByTestId("order-status")).toHaveText("Ödeme bekleniyor");
  await expect(page.getByTestId("bank-reference")).toHaveText(/^S-\d{4}-\d{6}$/);
  const orderUrl = page.url().replace(/\?.*$/, "");
  // T04: the order's filled pre-information and contract are stored, after
  // the redirect (after()); a reload shows them.
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId("order-contracts").locator("tbody tr")).toHaveCount(2, {
      timeout: 1_000,
    });
  }).toPass({ timeout: 30_000 });

  // 6. Card payment of the first installment (the inventory) through the fake checkout.
  await page.getByTestId("pay-card").click();
  await expect(page).toHaveURL(/\/odeme\/sahte\?/);
  await expect(page.getByText("7200.00 TL")).toBeVisible();
  await page.getByRole("button", { name: "Ödemeyi onayla" }).click();
  await expect(page).toHaveURL(/\/portal\/odeme\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("payment-status")).toHaveText("Başarılı");
  await expect(page.getByTestId("payment-result")).toHaveText("Ödemeniz alındı, teşekkür ederiz.");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Ödeme M-\d{4}-\d{6}$/);
  const paymentId = new URL(page.url()).pathname.split("/").pop()!;

  // 7. The receipt.
  const receipt = await page.request.get(`/makbuz/${paymentId}`);
  expect(receipt.status()).toBe(200);
  expect(receipt.headers()["content-type"]).toBe("application/pdf");
  expect(receipt.headers()["cache-control"]).toBe("private, no-store");
  expect(receipt.headers()["content-disposition"]).toMatch(
    /^inline; filename=makbuz-M-\d{4}-\d{6}\.pdf$/,
  );
  expect((await receipt.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // 8. The order is active; the customer pays the first visit installment.
  await page.goto(orderUrl);
  await expect(page.getByTestId("order-status")).toHaveText("Aktif");
  await expect(page.getByTestId("installment-1")).toHaveAttribute("data-status", "paid");
  await expect(page.getByTestId("installment-2")).toHaveAttribute("data-next", "true");
  await page.getByTestId("pay-card").click();
  await expect(page).toHaveURL(/\/odeme\/sahte\?/);
  await expect(page.getByText("4320.00 TL")).toBeVisible();
  await page.getByRole("button", { name: "Ödemeyi onayla" }).click();
  await expect(page).toHaveURL(/\/portal\/odeme\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("payment-status")).toHaveText("Başarılı");
  await page.goto(orderUrl);
  await expect(page.getByTestId("order-status")).toHaveText("Aktif");
  await expect(page.getByTestId("installment-2")).toHaveAttribute("data-status", "paid");
  await expect(page.getByTestId("installment-3")).toHaveAttribute("data-status", "pending");
  await expect(page.getByTestId("installment-3")).toHaveAttribute("data-next", "true");

  // The garden is now a parcel of the customer.
  await page
    .getByRole("navigation", { name: "Hesap" })
    .getByRole("link", { name: "Bahçelerim" })
    .click();
  await expect(page.getByTestId("parcel-list")).toContainText("Yolculuk bahçesi");
});

test("a declined card leaves the order payable; others cannot open the receipt", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const quoteId = await quotedApplication(EMAIL, CUSTOMER_PASSWORD);
  await login(page, EMAIL, "/portal", CUSTOMER_PASSWORD);
  await page.goto(`/portal/teklif/${quoteId}`);
  await page.getByLabel(/Ön Bilgilendirme Formu'nu okudum/).check();
  await page.getByLabel(/Mesafeli Hizmet Sözleşmesi'ni okudum/).check();
  await page.getByRole("button", { name: "Teklifi kabul et" }).click();
  await expect(page.getByTestId("order-status")).toHaveText("Ödeme bekleniyor");
  const orderUrl = page.url().replace(/\?.*$/, "");

  await page.getByTestId("pay-card").click();
  await page.getByRole("button", { name: "Kart reddedildi" }).click();
  await expect(page).toHaveURL(/\/portal\/odeme\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("payment-status")).toHaveText("Başarısız");
  await expect(page.getByTestId("payment-result")).toContainText("Ödeme tamamlanamadı");
  await expect(page.getByTestId("receipt-link")).toHaveCount(0);
  await page.getByRole("link", { name: "Siparişe dön" }).click();
  await expect(page).toHaveURL(orderUrl);
  await expect(page.getByTestId("order-status")).toHaveText("Ödeme bekleniyor");
  await expect(page.getByTestId("pay-card")).toBeVisible();

  // Another user gets 404 for this customer's receipt.
  const userId = await userIdByEmail(EMAIL);
  const paid = await admin
    .from("payment")
    .select("id")
    .eq("customer_user_id", userId)
    .eq("status", "succeeded")
    .limit(1)
    .single();
  await page.context().clearCookies();
  await login(page, "viewer@example.com", "/portal");
  const foreign = await page.request.get(`/makbuz/${paid.data!.id}`);
  expect(foreign.status()).toBe(404);
  // A viewer has no billing pages of its own data either.
  await page.goto("/portal/odeme");
  await expect(page.getByTestId("payment-list")).toHaveCount(0);
});
