import { expect, test, type Page } from "@playwright/test";
import { clickOnMap, removeJourneyUsers } from "../e2e/billing-helpers";
import { login, shot } from "./helpers";
import { buildOpsFixture, unstick, type OpsFixture } from "./ops-fixtures";

// Chapter 04: owners and parcels as ops@ registers them by phone. A new owner
// (account under OWNER_DOMAIN) is registered in the browser, then their
// parcel with a rough boundary; a boundary dispute is opened on it and a
// second boundary version drawn. The customer account panel is shown on the
// active member of ops-fixtures.ts.

test.describe.configure({ mode: "serial" });
test.use({ actionTimeout: 15_000 });

const OWNER_DOMAIN = "kilavuz-sahip.example.test";
const OWNER_EMAIL = `ornek.sahip@${OWNER_DOMAIN}`;
const PARCEL = "Deneme Bahçesi Sırt";
const OPS = "ops@example.com";

// About 100 m x 110 m.
const LON = 37.62;
const LAT = 37.111;
const RING: [number, number][] = [
  [LON, LAT],
  [LON + 0.0011, LAT],
  [LON + 0.0011, LAT + 0.001],
  [LON, LAT + 0.001],
];

let fx: OpsFixture;
let profileUrl = "";
let parcelUrl = "";

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await removeJourneyUsers(OWNER_DOMAIN);
  fx = await buildOpsFixture();
});

const panel = (page: Page, title: string) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) })
    .last();

test("sahip listesi", async ({ page }) => {
  await login(page, OPS, "/operasyon/sahip");
  const filter = page.getByTestId("owner-filter");
  await filter.getByLabel("Ad, telefon ya da e-posta").fill("Örnek");
  await filter.getByRole("button", { name: "Ara" }).click();
  await expect(page.getByTestId("owner-count")).toContainText("Aramaya uyan");
  const tabs = page.getByTestId("owner-source");
  await shot(page, "sahip-parsel/01-sahip-listesi.png", [
    { target: page.getByRole("main").getByRole("link", { name: "Yeni sahip" }), n: 1, at: "below" },
    { target: page.getByRole("main").locator("p").first(), n: 2 },
    { target: filter.getByLabel("Ad, telefon ya da e-posta"), n: 3 },
    { target: filter.getByRole("button", { name: "Aramayı temizle" }), n: 4, at: "below" },
    { target: tabs.getByRole("link").first(), n: 5, at: "below" },
    { target: page.getByTestId("owner-count"), n: 6, at: "below" },
    { target: page.getByRole("link", { name: "Örnek Müşteri Dört" }), n: 7 },
  ]);
});

test("yeni sahip kaydı ve tek kullanımlık parola", async ({ page }) => {
  await login(page, OPS, "/operasyon/sahip/yeni");
  const form = page.getByTestId("owner-form");
  await form.getByLabel("Ad soyad").fill("Örnek Sahip");
  await form.getByLabel("İletişim tercihi").selectOption("sms");
  await form.getByLabel("Telefon").fill("0555 000 00 21");
  await form.getByLabel("E-posta").fill(OWNER_EMAIL);
  await form.getByLabel("Aydınlatma metni verildi (okundu teyidi)").check();
  await form.getByLabel("Aydınlatma metni sürümü").selectOption("kvkk-v2-taslak");
  await unstick(page);
  await shot(
    page,
    "sahip-parsel/02-sahip-yeni.png",
    [
      { target: form.getByLabel("Ad soyad"), n: 1 },
      { target: form.getByLabel("İletişim tercihi"), n: 2, at: "right" },
      { target: form.getByLabel("Telefon"), n: 3 },
      { target: form.getByLabel("E-posta"), n: 4, at: "right" },
      { target: form.getByLabel("Aydınlatma metni verildi (okundu teyidi)"), n: 5 },
      { target: form.getByLabel("Teyit tarihi"), n: 6 },
      { target: form.getByLabel("Aydınlatma metni sürümü"), n: 7, at: "right" },
      { target: form.getByRole("button", { name: "Sahibi kaydet" }), n: 8 },
    ],
    { fullPage: true },
  );

  await form.getByRole("button", { name: "Sahibi kaydet" }).click();
  const created = page.getByTestId("owner-created");
  await expect(created).toContainText("Portal hesabı açıldı.");
  // The password on the image is this run's; it is never valid elsewhere.
  await shot(page, "sahip-parsel/03-sahip-kaydedildi.png", [
    { target: created.getByText("Portal hesabı açıldı."), n: 1 },
    { target: page.getByTestId("login-email"), n: 2, at: "right" },
    { target: page.getByTestId("one-time-password"), n: 3, at: "right" },
    { target: created.getByText(/WhatsApp kullanmayın/), n: 4 },
    { target: created.getByRole("link", { name: "Bu sahibe parsel ekle" }), n: 5 },
    { target: created.getByRole("link", { name: "Sahip sayfasını aç" }), n: 6, at: "below" },
  ]);
  await created.getByRole("link", { name: "Sahip sayfasını aç" }).click();
  await page.waitForURL(/\/operasyon\/sahip\/[0-9a-f-]{36}$/);
  profileUrl = new URL(page.url()).pathname;
});

test("yeni parsel kaydı", async ({ page }) => {
  await login(page, OPS, profileUrl);
  await page.getByRole("link", { name: "Bu sahibe parsel ekle" }).click();
  await page.waitForURL(/\/operasyon\/parsel\/yeni\?sahip=/);
  const form = page.getByTestId("parcel-form");
  await form.getByLabel("Parsel adı").fill(PARCEL);
  await form.getByLabel(/^İl \(/).fill("Gaziantep");
  await form.getByLabel(/^İlçe/).fill("Nizip");
  await form.getByLabel(/^Köy/).fill("Deneme Köyü");
  await form.getByLabel("Tahmini alan (dönüm)").fill("11");
  await form.getByLabel("Sulama").selectOption("rainfed");
  await form.getByLabel("Tahmini ağaç sayısı").fill("160");
  await clickOnMap(page.getByTestId("boundary-map"), RING);
  await expect(page.getByTestId("boundary-points")).toHaveText("4 köşe");
  await form.getByLabel(/^Ada/).fill("214");
  await form.getByLabel("Parsel no").fill("9");
  await form.getByLabel("Hisseli tapu").selectOption("no");
  await form.getByLabel("Yetki dayanağı").selectOption("title_holder");
  await form.getByLabel(/^Erişim notu/).fill("Kapı köy yolunda; anahtar komşuda.");
  await form.getByLabel(/^Sahada sınırı gösterecek kişi/).fill("Örnek Komşu");
  await form.getByLabel(/^Bu kişinin telefonu/).fill("0555 000 00 22");
  await unstick(page);
  await shot(
    page,
    "sahip-parsel/04-parsel-yeni.png",
    [
      { target: form.getByLabel("Parsel adı"), n: 1 },
      { target: form.getByLabel("Tahmini alan (dönüm)"), n: 2 },
      { target: form.getByLabel("Sahip", { exact: true }), n: 3, at: "right" },
      { target: page.getByTestId("boundary-note"), n: 4 },
      { target: page.getByTestId("boundary-map"), n: 5 },
      { target: page.getByTestId("boundary-area"), n: 6 },
      { target: form.getByLabel("Enlem"), n: 7 },
      { target: form.getByLabel(/^Ada/), n: 8 },
      { target: form.getByLabel(/^Erişim notu/), n: 9 },
      { target: form.getByLabel(/^Sahada sınırı gösterecek kişi/), n: 10 },
      { target: form.getByRole("button", { name: "Parseli kaydet" }), n: 11 },
    ],
    { fullPage: true },
  );
  await form.getByRole("button", { name: "Parseli kaydet" }).click();
  await page.waitForURL(/\/operasyon\/parsel\/[0-9a-f-]{36}/);
  parcelUrl = new URL(page.url()).pathname;
});

test("parsel sayfası", async ({ page }) => {
  await login(page, OPS, parcelUrl);
  await expect(page.getByTestId("parcel-info")).toBeVisible();
  await page.waitForTimeout(1500);
  await unstick(page);
  const actions = page.getByRole("group", { name: "Parsel işlemleri" });
  await shot(
    page,
    "sahip-parsel/05-parsel-sayfasi.png",
    [
      { target: actions.getByRole("link", { name: "Ziyaret planla" }), n: 1 },
      { target: actions.getByRole("link", { name: "Yeni sınır sürümü çiz" }), n: 2, at: "below" },
      { target: actions.getByRole("link", { name: "Düzenle" }), n: 3, at: "below" },
      { target: page.getByTestId("parcel-info"), n: 4 },
      { target: page.getByTestId("parcel-private"), n: 5 },
      { target: page.getByTestId("parcel-service"), n: 6 },
      { target: page.getByTestId("parcel-access"), n: 7 },
      { target: page.getByTestId("parcel-visits"), n: 8 },
      { target: page.getByTestId("boundary-pointers"), n: 9 },
      { target: page.getByTestId("media-suppression"), n: 10 },
      { target: page.getByTestId("parcel-lifecycle-panel"), n: 11, at: "right" },
      { target: page.getByTestId("boundary-dispute-ops"), n: 12, at: "right" },
    ],
    { fullPage: true },
  );
});

test("sınır itirazı", async ({ page }) => {
  await login(page, OPS, parcelUrl);
  const dispute = page.getByTestId("boundary-dispute-ops");
  await dispute
    .getByLabel(/^Not \(itirazın konusu/)
    .fill("Komşu parsel sahibi doğu sınırına itiraz etti (telefonla, 29.10.2026).");
  await unstick(page);
  await shot(
    page,
    "sahip-parsel/06-itiraz-ac.png",
    [
      { target: dispute.getByLabel(/^Not \(itirazın konusu/), n: 1, at: "right" },
      { target: dispute.getByRole("button", { name: "İtirazı aç" }), n: 2, at: "right" },
    ],
    { clip: dispute },
  );
  await dispute.getByRole("button", { name: "İtirazı aç" }).click();
  await expect(dispute.getByText("İtiraz açık")).toBeVisible();
  await dispute.getByText("Kayıtlar").click();
  await unstick(page);
  await shot(
    page,
    "sahip-parsel/07-itiraz-acik.png",
    [
      { target: page.getByText("Sınır itirazı açıldı; yeni tarama ziyareti planlanamaz."), n: 1 },
      { target: dispute.getByText("İtiraz açık"), n: 2, at: "below" },
      { target: dispute.getByLabel("Kapanış notu (isteğe bağlı)"), n: 3, at: "right" },
      { target: dispute.getByRole("button", { name: "İtirazı kapat" }), n: 4, at: "below" },
      { target: dispute.locator("details summary"), n: 5, at: "center" },
    ],
    { fullPage: true },
  );
});

test("yeni sınır sürümü", async ({ page }) => {
  await login(page, OPS, `${parcelUrl}/sinir`);
  const form = page.getByTestId("boundary-form");
  await clickOnMap(page.getByTestId("boundary-map"), [
    [LON - 0.0001, LAT - 0.0001],
    [LON + 0.0012, LAT - 0.0001],
    [LON + 0.0012, LAT + 0.0009],
    [LON + 0.0005, LAT + 0.0012],
    [LON - 0.0001, LAT + 0.001],
  ]);
  await expect(page.getByTestId("boundary-points")).toHaveText("5 köşe");
  await unstick(page);
  await shot(
    page,
    "sahip-parsel/08-sinir-surumu.png",
    [
      { target: panel(page, "Kaba sınır").getByRole("paragraph").first(), n: 1 },
      { target: page.getByRole("button", { name: "Son köşeyi geri al" }), n: 2 },
      { target: page.getByRole("button", { name: "Sınırı temizle" }), n: 3, at: "right" },
      { target: page.getByTestId("boundary-map"), n: 4 },
      { target: page.getByTestId("boundary-area"), n: 5 },
      { target: form.getByRole("button", { name: "Sınırı kaydet" }), n: 6 },
    ],
    { fullPage: true },
  );
  await form.getByRole("button", { name: "Sınırı kaydet" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/sinir"));
  await expect(page.getByTestId("parcel-boundary")).toContainText("Sınır v2");
});

test("parseli düzenleme", async ({ page }) => {
  await login(page, OPS, `${parcelUrl}/duzenle`);
  const form = page.getByTestId("parcel-form");
  await expect(form).toBeVisible();
  await unstick(page);
  await shot(
    page,
    "sahip-parsel/09-parsel-duzenle.png",
    [
      { target: panel(page, "Parsel"), n: 1 },
      { target: panel(page, "Kaba konum"), n: 2 },
      { target: panel(page, "Tapu, yetki ve erişim"), n: 3 },
      { target: form.getByRole("button", { name: "Değişiklikleri kaydet" }), n: 4 },
    ],
    { fullPage: true },
  );
});

test("sahip sayfası: müşteri hesabı", async ({ page }) => {
  await login(page, OPS, `/operasyon/sahip/${fx.activeProfile}`);
  const account = page.getByTestId("customer-account");
  await expect(account).toBeVisible();
  await unstick(page);
  await shot(
    page,
    "sahip-parsel/10-sahip-sayfasi.png",
    [
      { target: page.getByText(/^KVKK aydınlatması/), n: 1, at: "below" },
      { target: page.getByRole("link", { name: "Bu sahibe parsel ekle" }), n: 2, at: "below" },
      { target: page.getByRole("link", { name: "Parsel teklifi ver" }), n: 3, at: "below" },
      { target: page.getByTestId("owner-parcels"), n: 4 },
      { target: page.getByTestId("membership"), n: 5 },
      { target: page.getByTestId("customer-addon-quote"), n: 6, at: "below" },
      { target: panel(page, "Fatura profili"), n: 7 },
      { target: panel(page, "Onay geçmişi"), n: 8 },
      { target: panel(page, "Siparişler"), n: 9 },
      { target: panel(page, "Ödemeler"), n: 10 },
      { target: page.getByTestId("owner-form"), n: 11, at: "right" },
      { target: page.getByTestId("remove-all-gardens"), n: 12, at: "right" },
    ],
    { fullPage: true },
  );
});
