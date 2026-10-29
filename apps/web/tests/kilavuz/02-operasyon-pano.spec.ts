import { expect, test } from "@playwright/test";
import { login, shot } from "./helpers";
import { buildOpsFixture, unstick } from "./ops-fixtures";

// Chapter 02: the operations dashboard, its menu and header. The synthetic
// customers of ops-fixtures.ts fill the "Müşteri ve ödeme" queues, the
// co-owner invitation and the parcel list.

test.describe.configure({ mode: "serial" });
test.use({ actionTimeout: 15_000 });

test.beforeAll(async () => {
  test.setTimeout(180_000);
  await buildOpsFixture();
});

test("pano: üst kısım ve başlık", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon");
  await expect(page.getByRole("heading", { name: "Operasyon panosu" })).toBeVisible();
  const sections = page.getByRole("navigation", { name: "Bölümler" });
  const main = page.getByRole("main");
  const billing = page.getByTestId("billing-card");
  await shot(page, "operasyon/01-pano-ust.png", [
    { target: sections.getByRole("link", { name: "Ofis" }), n: 1, at: "below" },
    { target: sections.getByRole("link", { name: "Operasyon" }), n: 2, at: "below" },
    { target: page.getByRole("button", { name: "Çıkış" }), n: 3, at: "below" },
    {
      target: page
        .getByRole("navigation", { name: "Operasyon" })
        .getByRole("link", { name: "Pano" }),
      n: 4,
      at: "right",
    },
    { target: main.getByRole("link", { name: "Ziyaret planla" }), n: 5 },
    { target: main.getByRole("link", { name: "Yeni sahip" }), n: 6, at: "below" },
    { target: main.getByRole("link", { name: "Yeni parsel" }), n: 7, at: "below" },
    { target: billing.getByRole("heading", { name: "Müşteri ve ödeme" }), n: 8 },
    { target: billing.getByText("Son 24 saatte kayıt denemesi"), n: 9 },
    { target: page.getByRole("heading", { name: "Ziyaretler (durumlarına göre)" }), n: 10 },
    { target: page.getByText("Geciken iş yok"), n: 11 },
  ]);
});

test("pano: müşteri ve ödeme kartı", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon");
  const billing = page.getByTestId("billing-card");
  await expect(billing).toBeVisible();
  await unstick(page);
  await shot(
    page,
    "operasyon/02-musteri-odeme-karti.png",
    [
      { target: billing.getByRole("link", { name: /Süresi geçen ödeme/ }), n: 1, at: "right" },
      { target: billing.getByRole("link", { name: /30\+ gün geciken/ }), n: 2, at: "right" },
      { target: billing.getByRole("link", { name: /İncelenecek başvuru/ }), n: 3, at: "right" },
      { target: billing.getByRole("link", { name: /Açık teklif/ }), n: 4, at: "right" },
      { target: billing.getByRole("link", { name: /Ödeme bekleyen sipariş/ }), n: 5, at: "right" },
      {
        target: billing.getByRole("link", { name: /Envanter bekleyen parsel/ }),
        n: 6,
        at: "right",
      },
      { target: billing.getByText("Başarısız iade"), n: 7, at: "right" },
      { target: billing.getByText("Son 24 saatte kayıt denemesi"), n: 8 },
    ],
    { clip: billing },
  );
});

test("pano: menü", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon");
  const nav = page.getByRole("navigation", { name: "Operasyon" });
  await unstick(page);
  await shot(
    page,
    "operasyon/03-menu.png",
    [
      { target: nav.getByText("Saha", { exact: true }), n: 1, at: "right" },
      { target: nav.getByText("Müşteri ve ödeme", { exact: true }), n: 2, at: "right" },
      { target: nav.getByText("Yönetim", { exact: true }), n: 3, at: "right" },
    ],
    { clip: nav },
  );
});

test("pano: hissedar davetleri", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon");
  const panel = page.getByTestId("viewer-invitations");
  const item = panel.locator("li").filter({ hasText: "Örnek Hissedar" });
  await expect(item).toBeVisible();
  await item.getByLabel("İletişim tercihi").selectOption("sms");
  await unstick(page);
  await shot(
    page,
    "operasyon/04-hissedar-davetleri.png",
    [
      { target: item.getByText("Örnek Hissedar"), n: 1, at: "right" },
      { target: item.getByLabel("İletişim tercihi"), n: 2, at: "right" },
      { target: item.getByLabel("Teyit tarihi"), n: 3, at: "right" },
      { target: item.getByLabel("Aydınlatma metni sürümü"), n: 4, at: "right" },
      { target: item.getByLabel("Aydınlatma metni verildi (okundu teyidi)"), n: 5, at: "right" },
      {
        target: item.getByRole("button", { name: "Hesabı aç ve hissedar olarak ekle" }),
        n: 6,
        at: "right",
      },
      { target: item.getByRole("button", { name: "Reddet" }), n: 7, at: "right" },
    ],
    { clip: panel },
  );
});

test("pano: yaklaşan ziyaretler ve parseller", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon");
  const parcels = page.getByTestId("parcel-list");
  await parcels.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 2000);
  await shot(page, "operasyon/05-pano-alt.png", [
    { target: page.getByRole("heading", { name: /Yaklaşan ziyaretler/ }), n: 1 },
    { target: page.getByRole("heading", { name: "Parseller", exact: true }), n: 2 },
    { target: parcels.getByRole("link").first(), n: 3 },
    { target: parcels.locator("tbody tr").first().locator("td").nth(1), n: 4 },
  ]);
});
