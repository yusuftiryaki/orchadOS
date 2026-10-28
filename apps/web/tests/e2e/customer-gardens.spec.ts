import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { resolveSupabaseEnv } from "../local-supabase";
import {
  activeMember,
  admin,
  clickOnMap,
  login,
  opsAddonQuote,
  PASSWORD,
  removalFor,
  removeJourneyUsers,
  SEED_ORG,
} from "./billing-helpers";

// Adding and removing gardens during a membership in the browser (IP14-C,
// docs/bahce-yonetimi.md §4.1, §5.1, §11): an active member adds a second
// garden from the home card (locked package, membership band, prorated
// preview); ops issues the add-on quote through the API; the customer
// accepts and pays with the fake card and sees two gardens. Then a removal
// from "Hesabım › Bahçelerim" with the three timings, undone; a removal ops
// opened, which the customer cannot undo; and a removal
// completed by ops, after which the parcel is read-only. Test accounts are
// removed at the end.

const DOMAIN = "customer-gardens.example.test";
const run = Date.now().toString(36);
const EMAIL = `bahce-${run}@${DOMAIN}`;

// About 90 m × 110 m near 37.45 E 37.06 N, away from the member's first garden.
const POSITION: [number, number] = [37.4505, 37.0605];
const RING: [number, number][] = [
  [37.45, 37.06],
  [37.451, 37.06],
  [37.451, 37.061],
  [37.45, 37.061],
];

const env = resolveSupabaseEnv();
const options = { auth: { persistSession: false, autoRefreshToken: false } };

test.describe.configure({ mode: "serial" });

let member: { userId: string; orderId: string; parcelIds: string[] };

// A customer with an owner profile (KVKK notice), a billing profile and one
// active order (activeMember).
test.beforeAll(async () => {
  await removeJourneyUsers(DOMAIN);
  const phone = `+90554${String(Date.now()).slice(-7)}`;
  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    phone: phone.slice(1),
    phone_confirm: true,
  });
  if (created.error) throw created.error;
  const ops = createClient<Database>(env.url, env.anonKey, options);
  await ops.auth.signInWithPassword({ email: "ops@example.com", password: PASSWORD });
  const profile = await ops.rpc("ops_create_owner_profile", {
    p_org_id: SEED_ORG,
    p_user_id: created.data.user.id,
    p_full_name: "Bahçe Müşterisi",
    p_contact_preference: "sms",
    p_kvkk_consent: true,
    p_phone: phone,
    p_kvkk_consent_at: new Date().toISOString(),
    p_kvkk_text_version: "kvkk-v1-taslak",
  });
  if (profile.error) throw profile.error;
  const customer = createClient<Database>(env.url, env.anonKey, options);
  await customer.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  const billing = await customer.rpc("customer_save_billing_profile", {
    p_profile: {
      kind: "individual",
      first_name: "Bahçe",
      last_name: "Müşterisi",
      address: "Test Mah. 1. Sok. No: 2",
      district: "Nizip",
      city: "Gaziantep",
      postal_code: "27700",
    },
  });
  if (billing.error) throw billing.error;
  member = await activeMember(EMAIL);
});

test.afterAll(() => removeJourneyUsers(DOMAIN));

// garden_changes_enabled off (the hosted default, §2): no entry, and the
// wizard opened by its address asks the customer to contact the team instead
// of offering a prorated price ops could not quote.
test("with garden changes closed a member gets no add-garden wizard", async ({ page }) => {
  const setSwitch = async (on: boolean) => {
    const { error } = await admin
      .from("org_billing_setting")
      .update({ garden_changes_enabled: on })
      .eq("org_id", SEED_ORG);
    if (error) throw error;
  };
  await setSwitch(false);
  try {
    await login(page, EMAIL, "/portal");
    await expect(page.getByTestId("membership")).toBeVisible();
    await expect(page.getByTestId("home-add-garden")).toHaveCount(0);
    await page.goto("/portal/basvuru");
    await expect(page.getByRole("link", { name: "Yeni başvuru" })).toHaveCount(0);
    await page.goto("/portal/basvuru/yeni");
    await expect(page.getByTestId("addon-closed")).toHaveText(
      "Ek bahçe için ekibimizle iletişime geçin.",
    );
    await expect(page.getByTestId("member-band")).toHaveCount(0);
    await expect(page.locator('input[name="package_locked"]')).toHaveCount(0);
  } finally {
    await setSwitch(true);
  }
});

test("a member adds a garden, accepts the add-on quote and pays by card", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, EMAIL, "/portal");

  // 1. The membership and the add-garden entries.
  await expect(page.getByTestId("membership")).toContainText("Üyeliğiniz");
  await expect(page.getByTestId("membership-end")).toContainText("Hizmet bitişi:");
  await expect(page.getByTestId("membership-gardens")).toHaveText("1 bahçe hizmette");
  await expect(page.getByTestId("gardens-add")).toBeVisible();
  await expect(page.getByTestId("home-cta")).toHaveCount(0);
  await page.getByTestId("home-add-garden").getByRole("link", { name: "Bahçe ekle" }).click();
  await expect(page).toHaveURL("/portal/basvuru/yeni");

  // 2. The wizard: the band, the account's gardens and the locked package.
  await expect(page.getByTestId("member-band")).toContainText("paketiyle hizmet alır");
  await expect(page.getByTestId("member-band")).toContainText("Hizmet bitişi:");
  await expect(page.getByTestId("account-gardens").getByRole("listitem")).toHaveCount(1);
  const radio = page.locator('input[name="package_locked"]');
  await expect(radio).toBeDisabled();
  await expect(radio).toBeChecked();
  await page.getByRole("button", { name: "Devam edin" }).click();
  await expect(page.getByTestId("application-status")).toHaveText("Taslak");
  await expect(page.getByTestId("package-select")).toBeDisabled();
  await expect(page.getByTestId("member-band")).toBeVisible();
  const applicationId = new URL(page.url()).pathname.split("/").pop()!;
  const draft = await admin
    .from("service_application")
    .select("package_id")
    .eq("id", applicationId)
    .single();
  const order = await admin
    .from("service_order")
    .select("quote_id")
    .eq("id", member.orderId)
    .single();
  const quote = await admin
    .from("quote")
    .select("package_id")
    .eq("id", order.data!.quote_id)
    .single();
  expect(draft.data?.package_id).toBe(quote.data?.package_id);

  // 3. The second garden on the map; the preview is prorated.
  await page.getByRole("link", { name: "+ Bahçe ekle" }).click();
  await page.getByLabel("Bahçe adı").fill("Ek bahçe");
  await page.getByLabel("İlçe").fill("Nizip");
  await page.getByLabel("Alan (dönüm)").fill("12");
  await page.getByLabel("Bahçe üzerindeki yetkiniz").selectOption("title_holder");
  const map = page.getByTestId("boundary-map");
  await clickOnMap(map, [POSITION]);
  await expect(page.getByTestId("position-state")).toHaveText("Yer işaretlendi.");
  await clickOnMap(map, RING);
  await page
    .getByLabel(
      "Bu bahçeyi seçtiğim dayanakla fiilen kullanıyorum. Ekibinizin envanter ve ziyaretler için bahçeye girmesine izin veriyorum ve buna yetkiliyim.",
    )
    .check();
  await page.getByRole("button", { name: "Bahçeyi kaydet" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Bahçe kaydedildi." })).toBeVisible();
  await expect(page.getByTestId("addon-preview")).toContainText("ziyaret hakkı");
  await expect(page.getByTestId("preview-total")).toBeVisible();
  await page.getByRole("button", { name: "Başvuruyu gönder" }).click();
  await expect(page.getByTestId("application-status")).toHaveText("İncelemede");

  // 4. Ops issues the add-on quote (API); the customer accepts and pays.
  const quoteId = await opsAddonQuote(applicationId, member.orderId);
  await page.goto(`/portal/teklif/${quoteId}`);
  await expect(page.getByTestId("quote-addon")).toContainText(
    "Mevcut üyeliğinize ek bahçe teklifi · hizmet bitişi:",
  );
  await expect(page.getByTestId("quote-service-end")).toBeVisible();
  await expect(page.getByTestId("quote-lines")).toContainText("/4");
  // T18 (H19): the breakdown, the remaining windows and the binding total.
  const breakdown = page.getByTestId("quote-breakdown");
  await expect(breakdown).toContainText("Kalan gün / dönemin toplam günü");
  await expect(breakdown).toContainText("Yuvarlanmış ziyaret hakkı");
  await expect(breakdown).toContainText("Aynı bahçenin tam yıllık bedeli");
  await expect(breakdown).toContainText("Yuvarlama: 2,35 → 2; 2,5 → 3.");
  await expect(breakdown).toContainText("Bağlayıcı olan teklifteki toplamdır.");
  await expect(page.getByTestId("quote-windows")).toHaveText(
    /\(\d+\)$|Dönemde ziyaret penceresi kalmadı/,
  );
  await page.getByLabel(/Ön Bilgilendirme Formu'nu okudum/).check();
  await page.getByLabel(/Mesafeli Hizmet Sözleşmesi'ni okudum/).check();
  await page.getByRole("button", { name: "Teklifi kabul et" }).click();
  await expect(page.getByTestId("order-status")).toHaveText("Ödeme bekleniyor");
  await expect(page.getByTestId("order-addon")).toHaveText("Üyeliğinize eklenen bahçe");
  await expect(page.getByTestId("order-revise")).toBeVisible();
  await page.getByTestId("pay-card").click();
  await expect(page).toHaveURL(/\/odeme\/sahte\?/);
  await page.getByRole("button", { name: "Ödemeyi onayla" }).click();
  await expect(page.getByTestId("payment-status")).toHaveText("Başarılı");

  // 5. Two gardens in service.
  await page.goto("/portal");
  await expect(page.getByTestId("parcel-list").locator("[data-parcel-id]")).toHaveCount(2);
  await expect(page.getByTestId("membership-gardens")).toHaveText("2 bahçe hizmette");
});

test("the customer asks to remove a garden from the account page and undoes it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const parcelId = member.parcelIds[0];
  await login(page, EMAIL, "/portal/hesap");
  const section = page.getByTestId("my-gardens");
  await expect(section.locator("tr")).toHaveCount(2);
  await section
    .locator(`tr[data-parcel-id="${parcelId}"]`)
    .getByRole("link", { name: "Hizmetten çıkar" })
    .click();
  await expect(page).toHaveURL(`/portal/parsel/${parcelId}#hizmet`);

  const card = page.getByTestId("service-card");
  await expect(card).toContainText("Hizmet dönemi:");
  await expect(card).toContainText("Cayma hakkının son günü:");
  await card.getByText("Bahçeyi hizmetten çıkar", { exact: true }).click();
  const options = card.getByTestId("removal-options");
  await expect(options.locator("label")).toHaveCount(3);
  await expect(options.locator('label[data-timing="notice"]')).toContainText("30 gün sonra");
  await expect(options.locator('label[data-timing="period_end"]')).toContainText("Dönem sonunda");
  await expect(options.locator('label[data-timing="withdrawal"]')).toContainText(
    "Cayma hakkımı kullanıyorum",
  );
  for (const date of await options.getByTestId("removal-option-date").allTextContents()) {
    expect(date).toMatch(/^Çıkış tarihi: \d{1,2} \S+ \d{4}$/);
  }
  await expect(options).toContainText("en fazla");
  const noticeDate = await options
    .locator('label[data-timing="notice"]')
    .getByTestId("removal-option-date")
    .textContent();

  await card.getByLabel("Neden").selectOption("not_needed");
  await card.getByLabel(/hizmetten çıkacağını/).check();
  await card
    .getByRole("button", { name: "Bahçeyi hizmetten çıkar (raporlarınız silinmez)" })
    .click();
  await expect(page).toHaveURL(`/portal/parsel/${parcelId}?bilgi=cikarma_istendi`);
  await expect(card.getByRole("status")).toContainText("Çıkarma talebiniz alındı.");
  await expect(card.getByTestId("removal-open")).toContainText("Talep edildi");
  await expect(card.getByTestId("removal-effective")).toHaveText(noticeDate!);
  await expect(card.getByTestId("service-state")).toContainText("Çıkış tarihi:");

  await card.getByRole("button", { name: "Talebi geri al" }).click();
  await expect(page).toHaveURL(`/portal/parsel/${parcelId}?bilgi=cikarma_geri_alindi`);
  await expect(card.getByTestId("removal-form")).toBeVisible();
  await expect(card.getByTestId("service-state")).toHaveText("Hizmette");
});

test("a removal ops opened offers no undo to the customer", async ({ page }) => {
  const parcelId = member.parcelIds[0];
  const removalId = await removalFor(EMAIL, PASSWORD, parcelId, { byOps: true });
  await login(page, EMAIL, `/portal/parsel/${parcelId}`);
  const card = page.getByTestId("service-card");
  await expect(card.getByTestId("removal-open")).toContainText("Planlandı");
  await expect(card.getByTestId("removal-by-ops")).toHaveText(
    "Bu çıkarmayı ekibimiz başlattı; değişiklik için bize ulaşın.",
  );
  await expect(card.getByRole("button", { name: "Talebi geri al" })).toHaveCount(0);
  // Ops withdraws it again, so the next test starts from a garden in service.
  const ops = createClient<Database>(env.url, env.anonKey, options);
  await ops.auth.signInWithPassword({ email: "ops@example.com", password: PASSWORD });
  const cancelled = await ops.rpc("ops_cancel_garden_removal", {
    p_removal_id: removalId,
    p_note: "E2E: geri alındı",
  });
  if (cancelled.error) throw cancelled.error;
});

test("a removed garden shows the band and read-only questions and viewers", async ({ page }) => {
  test.setTimeout(90_000);
  const parcelId = member.parcelIds[0];
  await removalFor(EMAIL, PASSWORD, parcelId, { complete: true });
  await login(page, EMAIL, `/portal/parsel/${parcelId}`);
  await expect(page.getByTestId("removed-band")).toContainText(
    "Bu bahçe hizmetten çıkarıldı. Raporlar şu tarihe kadar açık:",
  );
  // The read-only notices, not only the missing forms: the question form is
  // absent anyway on a parcel without findings.
  await expect(page.getByTestId("questions-read-only")).toBeVisible();
  await expect(page.getByTestId("viewers-read-only")).toBeVisible();
  await expect(page.getByTestId("ask-question")).toHaveCount(0);
  await expect(page.getByTestId("invite-viewer")).toHaveCount(0);
  await expect(page.getByTestId("service-card")).toHaveAttribute("data-state", "removed");

  await page.goto("/portal");
  await expect(
    page.locator(`[data-parcel-id="${parcelId}"]`).getByTestId("garden-state"),
  ).toContainText("Hizmet dışı · raporlar şu tarihe kadar açık:");
});
