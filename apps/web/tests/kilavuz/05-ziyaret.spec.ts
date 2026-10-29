import { expect, test, type Locator, type Page } from "@playwright/test";
import { login, shot } from "./helpers";
import { buildVisitFixture, type VisitFixture } from "./visit-billing-fixtures";

// Chapter 05: visit planning (docs/kilavuz/05-ziyaret-planlama.md). The
// synthetic owners of visit-billing-fixtures.ts give a parcel that can be
// planned, one still in its withdrawal period, a visit the field app could
// not do today and a postponed one; the spec plans two more visits in the
// browser. The scanned visit is the seed's demo scan (in review).

const SCANNED_VISIT = "e1000000-0000-4000-8000-000000000002";

test.describe.configure({ mode: "serial" });

let fx: VisitFixture;

// Element shots scroll the page: the sticky site header would cover the
// element, so it scrolls away with the page during these shots.
async function staticHeader(page: Page) {
  await page.addStyleTag({ content: "header { position: static !important; }" });
}

// Puts an element just under the top of the window.
async function scrollTop(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) throw new Error("no box");
  await page.evaluate((y) => window.scrollBy(0, y - 70), box.y);
}

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fx = await buildVisitFixture();
});

test("ziyaret listesi", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon/ziyaret");
  const filters = page.getByRole("form", { name: "Filtre" });
  await shot(page, "ziyaret/01-ziyaret-listesi.png", [
    { target: page.getByRole("link", { name: "Ziyaret planla" }), n: 1 },
    { target: filters.getByText("Parsel", { exact: true }), n: 2 },
    { target: filters.getByRole("button", { name: "Uygula" }), n: 3 },
    { target: page.getByTestId("visit-status-filter"), n: 4 },
    { target: page.getByTestId("visit-list").locator("tbody tr td a").first(), n: 5 },
    {
      target: page.getByTestId("visit-list").locator("tbody tr td:last-child").first(),
      n: 6,
      at: "right",
    },
  ]);
});

test("ziyaret planla: 3 gün ve sonrası", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon/ziyaret/yeni");
  const form = page.getByTestId("visit-form");
  await form.getByLabel("Parsel").selectOption({ label: fx.parcelName });
  await form.getByLabel("Ziyaret türü").selectOption({ label: "Periyodik tarama" });
  await form.getByLabel("Tarih").fill(fx.farDay);
  await form.getByLabel("Sorumlu saha personeli").selectOption({ label: "field@example.com" });
  await form.getByLabel("Not").fill("Kapı kuzey yolda; anahtar bekçide.");
  await expect(form.getByTestId("visit-confirm")).toContainText("tarihine planlanır");
  await shot(page, "ziyaret/02-ziyaret-planla.png", [
    { target: form.getByLabel("Parsel"), n: 1 },
    { target: form.getByLabel("Ziyaret türü"), n: 2 },
    { target: form.getByLabel("Tarih"), n: 3 },
    { target: form.getByLabel("Sorumlu saha personeli"), n: 4 },
    { target: form.getByLabel("Not"), n: 5 },
    { target: form.getByTestId("visit-season"), n: 6 },
    { target: form.getByTestId("visit-confirm"), n: 7 },
    { target: form.getByRole("button", { name: "Ziyaret planla" }), n: 8 },
  ]);
  await form.getByRole("button", { name: "Ziyaret planla" }).click();
  await page.waitForURL(/\/operasyon\/ziyaret\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("visit-notice")).toContainText("kuyrukta");
  await shot(page, "ziyaret/03-ziyaret-planlandi.png", [
    { target: page.getByText("Ziyaret planlandı; sorumlu"), n: 1 },
    { target: page.getByTestId("visit-detail"), n: 2 },
    { target: page.getByTestId("visit-notice"), n: 3 },
    { target: page.getByRole("heading", { name: "Planı değiştir" }), n: 4 },
    { target: page.getByRole("button", { name: "Ziyareti iptal et" }), n: 5 },
  ]);
  // The postponement form of a visit without a postponement.
  await shot(
    page,
    "ziyaret/07-erteleme-formu.png",
    [
      {
        target: page.getByLabel("Telefonla ya da yazılı gelen ertelemeyi kaydet"),
        n: 1,
        at: "right",
      },
      { target: page.getByLabel("İsteğin zamanı"), n: 2, at: "right" },
      { target: page.getByRole("button", { name: "Ertelemeyi kaydet" }), n: 3, at: "right" },
    ],
    { clip: page.getByTestId("visit-postponement") },
  );
});

test("ziyaret planla: 3 günden yakın", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon/ziyaret/yeni");
  const form = page.getByTestId("visit-form");
  await form.getByLabel("Parsel").selectOption({ label: fx.parcelName });
  await form.getByLabel("Tarih").fill(fx.nearDay);
  await form.getByLabel("Sorumlu saha personeli").selectOption({ label: "field@example.com" });
  const phone = form.getByTestId("visit-phone-notice");
  await expect(phone).toBeVisible();
  await phone.fill(`${new Date().toISOString().slice(0, 10)}T09:30`);
  await shot(page, "ziyaret/04-telefonla-bildirim.png", [
    { target: form.getByLabel("Tarih"), n: 1 },
    { target: phone, n: 2 },
    { target: form.getByRole("button", { name: "Ziyaret planla" }), n: 3 },
  ]);
  await form.getByRole("button", { name: "Ziyaret planla" }).click();
  await page.waitForURL(/\/operasyon\/ziyaret\/[0-9a-f-]{36}/);
  await expect(page.getByTestId("visit-notice")).toContainText("Telefon");
});

test("ziyaret planla: ret mesajı", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon/ziyaret/yeni");
  const form = page.getByTestId("visit-form");
  await form.getByLabel("Parsel").selectOption({ label: fx.waitingParcelName });
  await form.getByLabel("Tarih").fill(fx.withdrawalDay);
  await form.getByRole("button", { name: "Ziyaret planla" }).click();
  const error = form.getByText("cayma süresi sürüyor");
  await expect(error).toBeVisible();
  await shot(page, "ziyaret/05-ret-mesaji.png", [{ target: error, n: 1 }], {
    clip: page.getByTestId("visit-form"),
  });
});

test("ertelenen ziyaret", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await login(page, "ops@example.com", `/operasyon/ziyaret/${fx.postponedVisit}`);
  await shot(page, "ziyaret/06-ertelenen-ziyaret.png", [
    { target: page.getByTestId("visit-detail"), n: 1 },
    { target: page.getByTestId("visit-notice"), n: 2 },
    { target: page.getByRole("button", { name: "Telefonla bildirimi kaydet" }), n: 3 },
    { target: page.getByTestId("visit-postponement").getByText("Sahip telefonla"), n: 4 },
    { target: page.getByRole("main").getByLabel("Tarih", { exact: true }), n: 5 },
    { target: page.getByRole("button", { name: "Değişikliği kaydet" }), n: 6 },
  ]);
});

test("yapılamayan ziyaret", async ({ page }) => {
  await login(page, "ops@example.com", `/operasyon/ziyaret/${fx.blockedVisit}`);
  const panel = page.getByTestId("missed-visits");
  const form = page.getByTestId("missed-visit-form");
  await expect(form.getByTestId("missed-prefill")).toBeVisible();
  await staticHeader(page);
  await shot(
    page,
    "ziyaret/08-yapilamayan-ziyaret.png",
    [
      { target: panel.getByText("Pencere: "), n: 1, at: "right" },
      { target: panel.getByTestId("missed-visit").first(), n: 2, at: "right" },
      {
        target: panel.getByTestId("missed-visit").getByRole("button", { name: "Sonucu kaydet" }),
        n: 3,
        at: "right",
      },
      { target: form.getByTestId("missed-prefill"), n: 4, at: "right" },
      { target: form.getByLabel("Neden"), n: 5, at: "right" },
      { target: form.getByLabel("Önerilen yeni tarih (aynı pencerede)"), n: 6, at: "right" },
      { target: form.getByLabel("Sonuç"), n: 7, at: "right" },
      { target: form.locator("fieldset"), n: 8, at: "right" },
      {
        target: form.getByRole("button", { name: "Yapılamayan ziyareti kaydet" }),
        n: 9,
        at: "right",
      },
    ],
    { clip: panel },
  );

  // Record it: the owner was told by phone the same day, a new day in the
  // same window.
  await form.getByLabel("Bildirim yolu").selectOption({ label: "Telefon" });
  await form.getByLabel("Önerilen yeni tarih (aynı pencerede)").fill(fx.nearDay);
  await form.getByRole("button", { name: "Yapılamayan ziyareti kaydet" }).click();
  await expect(page.getByText("Yapılamayan ziyaret kaydedildi.")).toBeVisible();
  const saved = panel.getByTestId("missed-visit").filter({ hasText: "Sahip kaynaklı" });
  await expect(saved).toContainText("Yeniden planlandı");
  await staticHeader(page);
  await shot(
    page,
    "ziyaret/09-yapilamayan-kaydedildi.png",
    [
      { target: saved.getByTestId("missed-outcome"), n: 1 },
      {
        target: panel.getByTestId("missed-visit").getByRole("button", { name: "Sonucu kaydet" }),
        n: 2,
        at: "right",
      },
    ],
    { clip: panel },
  );

  await shot(
    page,
    "ziyaret/10-saha-kayitlari.png",
    [
      { target: page.getByTestId("field-notice").filter({ hasText: "Levha" }), n: 1, at: "right" },
      { target: page.getByTestId("field-notice").filter({ hasText: "Sözlü" }), n: 2, at: "right" },
      { target: page.getByTestId("field-notice").filter({ hasText: "İtiraz" }), n: 3, at: "right" },
    ],
    { clip: page.getByTestId("field-notices") },
  );
});

test("taranmış ziyaret: yakın plan ve görüntü gizleme", async ({ page }) => {
  await login(page, "ops@example.com", `/operasyon/ziyaret/${SCANNED_VISIT}`);
  await shot(page, "ziyaret/11-taranmis-ziyaret.png", [
    { target: page.getByTestId("visit-locked"), n: 1 },
    { target: page.getByTestId("visit-notices"), n: 2 },
  ]);
  const closeups = page.getByTestId("closeup-list");
  await shot(
    page,
    "ziyaret/12-yakin-plan-listesi.png",
    [
      { target: closeups.locator("tr[data-reason=previous_class]"), n: 1, at: "center" },
      { target: closeups.locator("tr[data-reason=expert_request]"), n: 2, at: "center" },
      { target: closeups.locator("details summary, button").last(), n: 3, at: "center" },
    ],
    { clip: closeups },
  );
  const media = page.getByTestId("media-suppression");
  await page.setViewportSize({ width: 1280, height: 1000 });
  await scrollTop(page, media);
  await shot(page, "ziyaret/13-goruntu-gizleme.png", [
    { target: media.getByRole("heading", { name: "Gizlenen görüntüler" }), n: 1 },
    { target: media.getByLabel("Görüntü kimliği"), n: 2 },
    { target: media.getByRole("button", { name: "Gizle" }).first(), n: 3 },
    { target: media.getByRole("link", { name: "Panoramalar" }), n: 4, at: "below" },
    { target: media.getByTestId("media-gallery").locator("li").first(), n: 5 },
  ]);
});
