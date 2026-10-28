import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { purgeBillingUsers, purgeParcels } from "../local-db";
import { resolveSupabaseEnv } from "../local-supabase";

// The back office in the browser, as ops@ (IP12-E, docs/musteri-yonetimi.md
// §11). A fresh customer and their submitted application are created through
// the API; ops verifies the garden and issues a quote, the customer accepts it
// (API), ops records the bank transfer (order active, parcel link), requests
// and completes a transfer refund, and finds these in the audit log. Then a
// price list is published from a copy of v1 (dated years ahead, never in
// force) and the settings are saved (and put back). The customer's rows and
// parcel are removed at the end.

const PASSWORD = "orchados-dev";
const ORG = "b0000000-0000-4000-8000-000000000001";
const STANDARD = "91200000-0000-4000-8000-000000000001";
const run = Date.now().toString(36);
const EMAIL = `e2e-bo-${run}@back-office-e2e.example.test`;
const NAME = `Arayüz Müşterisi ${run}`;
const GARDEN = `Arayüz Bahçesi ${run}`;

const env = resolveSupabaseEnv();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(env.url, env.serviceRoleKey, options);

const istanbulToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

function check<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}

async function signedIn(email: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(env.url, env.anonKey, options);
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

async function login(page: Page, email: string, next: string) {
  await page.goto(`/giris?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname === next);
}

let customerId: string | null = null;
let customer: SupabaseClient<Database>;
let applicationNumber = "";

test.beforeAll(async () => {
  const phone = `+90555${String(Date.now()).slice(-7)}`;
  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    phone: phone.slice(1),
    phone_confirm: true,
  });
  if (created.error) throw created.error;
  customerId = created.data.user.id;

  const ops = await signedIn("ops@example.com");
  check(
    await ops.rpc("ops_create_owner_profile", {
      p_org_id: ORG,
      p_user_id: customerId,
      p_full_name: NAME,
      p_contact_preference: "sms",
      p_kvkk_consent: true,
      p_phone: phone,
      p_kvkk_consent_at: new Date().toISOString(),
      p_kvkk_text_version: "kvkk-v1-taslak",
    }),
  );
  customer = await signedIn(EMAIL);
  // T15: the customer records the KVKK notice in the portal (an ops-opened
  // owner is otherwise stopped by the first-login notice screen).
  check(
    await customer.rpc("customer_set_consent", {
      p_kind: "kvkk_notice",
      p_granted: true,
      p_text_version: "kvkk-v2-taslak",
    }),
  );
  check(
    await customer.rpc("customer_save_billing_profile", {
      p_profile: {
        kind: "individual",
        first_name: "Arayüz",
        last_name: "Müşterisi",
        address: "Test Mah. 1. Sok. No: 2",
        district: "Nizip",
        city: "Gaziantep",
        postal_code: "27700",
      },
    }),
  );
  const application = check(
    await customer.rpc("customer_create_application", { p_package_id: STANDARD }),
  );
  check(
    await customer.rpc("customer_save_application_garden", {
      p_application_id: application,
      p_garden: {
        name: GARDEN,
        province: "Gaziantep",
        district: "Nizip",
        village: "Test",
        declared_area_m2: 21000,
        irrigation: "rainfed",
        estimated_tree_count: 300,
        lon: 37.8,
        lat: 37.01,
        position_uncertainty_m: 30,
        boundary: [
          [37.799, 37.0095],
          [37.801, 37.0095],
          [37.801, 37.0105],
          [37.799, 37.0105],
        ],
      },
      p_detail: {
        authorization_basis: "title_holder",
        deed_block: "101",
        deed_parcel: "7",
        is_shared_deed: false,
        entry_permission: true,
      },
    }),
  );
  applicationNumber = check(
    await customer.rpc("customer_submit_application", { p_application_id: application }),
  );
});

test.afterAll(async () => {
  if (!customerId) return;
  const parcels = check(
    await admin.from("parcel_access").select("parcel_id").eq("user_id", customerId),
  ).map((p) => p.parcel_id);
  await purgeBillingUsers([customerId]);
  if (parcels.length) await purgeParcels(parcels);
  await admin.auth.admin.deleteUser(customerId);
});

test("ops takes an application to an active order and refunds part of the transfer", async ({
  page,
}) => {
  await login(page, "ops@example.com", "/operasyon");
  await expect(page.getByTestId("billing-card")).toBeVisible();

  // 1. Application → garden verification.
  await page.getByRole("link", { name: "Başvurular" }).click();
  await page.getByRole("link", { name: applicationNumber }).click();
  await expect(page.getByRole("heading", { name: `Başvuru ${applicationNumber}` })).toBeVisible();
  await expect(page.getByText("Önizleme için önce her bahçenin alanını doğrulayın.")).toBeVisible();
  await page.getByTestId("application-gardens").getByRole("link", { name: "Doğrula" }).click();
  await expect(page.getByRole("heading", { name: `Bahçe: ${GARDEN}` })).toBeVisible();
  await page.getByLabel("Doğrulanan alan (dönüm)").fill("20");
  await page.getByLabel("Doğrulama notu (iç)").fill("Uydu görüntüsüyle ölçüldü");
  await page.getByRole("button", { name: "Doğrulamayı kaydet" }).click();
  await expect(page.getByText("Bahçe alanı doğrulandı.")).toBeVisible();

  // 2. Preview (20 dönüm standard, first year with the inventory fee: 24.480 TL) and the quote.
  await expect(page.getByTestId("quote-preview-total")).toHaveText("24.480,00 ₺");
  await page.getByTestId("issue-quote-form").getByRole("button", { name: "Teklif ver" }).click();
  await expect(page.getByText("Teklif verildi; müşteriye bildirim gidecek.")).toBeVisible();
  await expect(page.getByTestId("quote-lines-total")).toHaveText("24.480,00 ₺");
  const quoteId = page.url().split("/").pop()!.split("?")[0];

  // 3. The customer accepts (API); ops records the transfer.
  const orderId = check(
    await customer.rpc("customer_accept_quote", {
      p_quote_id: quoteId,
      p_consents: { distance_sales: "mesafeli-v4-taslak", pre_information: "onbilgi-v4-taslak" },
    }),
  );
  await page.goto(`/operasyon/siparis/${orderId}`);
  await expect(page.getByTestId("order-outstanding")).toHaveText("24.480,00 ₺");
  const manual = page.getByTestId("manual-payment-form");
  await manual.getByLabel("Tutar (TL)").fill("24.480,00");
  await manual.getByLabel("Banka referansı").fill(`EFT-${run}`);
  await manual.getByRole("button", { name: "Havaleyi kaydet" }).click();
  await expect(page.getByText("Havale kaydedildi ve makbuz numarası verildi.")).toBeVisible();
  await expect(page.getByTestId("order-facts")).toContainText("Aktif");
  await expect(page.getByTestId("order-parcel-link")).toHaveText(GARDEN);

  // 4. A transfer refund: requested on the payment, completed on İadeler.
  await page.getByTestId("order-payments").getByRole("link").first().click();
  await expect(page.getByTestId("receipt-link")).toHaveAttribute("href", /^\/makbuz\//);
  const refund = page.getByTestId("refund-form");
  await refund.getByLabel("İade tutarı (TL)").fill("100");
  await refund.getByLabel("Neden").selectOption("goodwill");
  await refund.getByRole("button", { name: "İadeyi iste" }).click();
  await expect(page.getByText("İade istendi.")).toBeVisible();
  await expect(page.getByTestId("payment-refunds")).toContainText("İstendi");

  await page.getByRole("link", { name: "İadeler" }).first().click();
  await expect(page).toHaveURL("/operasyon/iade");
  const mine = page
    .getByTestId("refund-list")
    .locator("tr[data-status=requested]")
    .filter({ hasText: NAME });
  await expect(mine).toHaveCount(1);
  await mine.getByLabel("Banka referansı").fill(`IADE-${run}`);
  await mine.getByRole("button", { name: "Havale iadesi yapıldı" }).click();
  await expect(page.getByText("Havale iadesi tamamlandı.")).toBeVisible();
  await expect(
    page.getByTestId("refund-list").locator("tr[data-status=succeeded]").filter({ hasText: NAME }),
  ).toHaveCount(1);

  // 5. The audit log has every step.
  await page.getByRole("link", { name: "Denetim kaydı" }).click();
  const log = page.getByTestId("audit-log");
  for (const action of [
    "Bahçe alanı doğrulandı",
    "Teklif verildi",
    "Teklif kabul edildi",
    "Havale kaydedildi",
    "Sipariş aktifleşti",
    "İade istendi",
    "İade yapıldı",
  ]) {
    await expect(log.getByText(action, { exact: true }).first()).toBeVisible();
  }
  await page.goto(`/operasyon/denetim-kaydi?tur=order&kayit=${orderId}`);
  await expect(page.getByTestId("audit-log").locator("tbody tr")).not.toHaveCount(0);
  await expect(page.getByTestId("audit-log")).not.toContainText("Teklif verildi");
});

test("ops publishes a price list from a copy and saves the settings", async ({ page }) => {
  await login(page, "ops@example.com", "/operasyon/fiyat");
  await expect(page.getByTestId("price-lists").locator("tr[data-in-force]")).toHaveCount(1);
  await page.getByRole("link", { name: "Fiyat listesi v1", exact: true }).click();
  await expect(page.getByText("Yayımlanmış liste değiştirilemez.")).toBeVisible();
  await page.getByRole("button", { name: "Bundan taslak oluştur" }).click();
  await expect(page.getByText("Yeni fiyat listesi taslağı açıldı.")).toBeVisible();
  const draftUrl = page.url().split("?")[0];

  const draft = page.getByTestId("price-list-draft");
  await expect(draft.getByLabel("Standart: Birim fiyat (TL / dönüm·ziyaret)")).toHaveValue(
    "180,00",
  );
  await draft.getByLabel("Geçerlilik başlangıcı").fill(addDays(istanbulToday(), 3650));
  await draft.getByLabel("Standart: Birim fiyat (TL / dönüm·ziyaret)").fill("190,00");
  await draft.getByRole("button", { name: "Taslağı kaydet" }).click();
  await expect(page.getByText("Taslak kaydedildi.")).toBeVisible();

  const publish = page.getByTestId("publish-form");
  await publish.getByRole("checkbox").check();
  await publish.getByRole("button", { name: "Yayımla" }).click();
  await expect(page.getByText("Fiyat listesi yayımlandı; artık değiştirilemez.")).toBeVisible();
  expect(page.url().split("?")[0]).toBe(draftUrl);
  await expect(page.getByTestId("price-list-items")).toContainText("190,00 ₺");
  // Dated years ahead: v1 stays the list in force.
  await page.goto("/operasyon/fiyat");
  await expect(
    page.getByTestId("price-lists").locator("tr[data-in-force]").getByRole("link"),
  ).toHaveText("Fiyat listesi v1");

  // Settings: change a duration and put it back.
  await page.getByRole("link", { name: "Ayarlar" }).click();
  await expect(page.getByTestId("fake-payments")).toContainText("Açık");
  const form = page.getByTestId("settings-form");
  const days = form.getByLabel("Teklif geçerliliği (gün)");
  const before = await days.inputValue();
  await days.fill("31");
  await form.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ayarlar kaydedildi.")).toBeVisible();
  await expect(
    page.getByTestId("settings-form").getByLabel("Teklif geçerliliği (gün)"),
  ).toHaveValue("31");
  await page.getByTestId("settings-form").getByLabel("Teklif geçerliliği (gün)").fill(before);
  await page.getByTestId("settings-form").getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Ayarlar kaydedildi.")).toBeVisible();

  await page.goto("/operasyon/denetim-kaydi?eylem=billing_setting.");
  await expect(
    page.getByTestId("audit-log").getByText("Faturalama ayarları kaydedildi").first(),
  ).toBeVisible();
  await page.goto("/operasyon/denetim-kaydi?eylem=price_list.published");
  await expect(
    page.getByTestId("audit-log").getByText("Fiyat listesi yayımlandı").first(),
  ).toBeVisible();
});

test("the customer's TCKN is masked until ops reveals it", async ({ page }) => {
  // A valid test number (checksum digits), never a real person's. Required
  // only for the moment the customer saves it; the setting is put back.
  const TCKN = "10000000146";
  const ops = await signedIn("ops@example.com");
  const required = (on: boolean) =>
    ops.rpc("ops_save_billing_setting", {
      p_org_id: ORG,
      p_settings: { identity_number_required: on },
    });
  check(await required(true));
  try {
    check(
      await customer.rpc("customer_save_billing_profile", {
        p_profile: {
          kind: "individual",
          first_name: "Arayüz",
          last_name: "Müşterisi",
          identity_number: TCKN,
          address: "Test Mah. 1. Sok. No: 2",
          district: "Nizip",
          city: "Gaziantep",
          postal_code: "27700",
        },
      }),
    );
  } finally {
    check(await required(false));
  }

  await login(page, "ops@example.com", "/operasyon/sahip");
  await page.getByLabel("Ad, telefon ya da e-posta").fill(NAME);
  await page.getByRole("button", { name: "Süz" }).click();
  // The search is posted: only the matching row, and the term (personal
  // data) is not in the URL.
  await expect(page.getByTestId("owner-list").locator("tbody tr")).toHaveCount(1);
  expect(new URL(page.url()).search).not.toContain("q=");
  await page.getByTestId("owner-list").getByRole("link", { name: NAME }).click();
  const panel = page.getByTestId("customer-account");
  await expect(panel.getByTestId("billing-profile")).toBeVisible();
  await expect(panel.getByTestId("identity-number")).not.toContainText(TCKN);
  await expect(page.locator("body")).not.toContainText(TCKN);
  await panel.getByRole("button", { name: "TCKN'yi göster" }).click();
  await expect(panel.getByTestId("identity-number")).toContainText(TCKN);

  // Gone after a reload; the reveal is in the audit log.
  await page.reload();
  await expect(page.locator("body")).not.toContainText(TCKN);
  await page.goto("/operasyon/denetim-kaydi?tur=billing_profile");
  await expect(page.getByTestId("audit-log").getByText("TCKN görüntülendi").first()).toBeVisible();
  await expect(page.getByTestId("audit-log")).not.toContainText(TCKN);
});
