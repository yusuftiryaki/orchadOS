import { expect, test, type Page } from "@playwright/test";
import {
  PASSWORD,
  SEED_ORG,
  STANDART,
  activeMember,
  admin,
  anon,
  istanbulToday,
  removalFor,
  removeJourneyUsers,
} from "./billing-helpers";

// The IP14 back office in the browser, as ops@ (docs/bahce-yonetimi.md §12):
// an add-on application of a member (period panel, verification, duplicate
// check, "Ek teklif"); a removal from the queue confirmed for today and
// completed at once (parcel passive, refund in the queue); the renewal screen
// with the add-on garden checked and a garden with an open removal unchecked.
// Members are made through the API (billing-helpers); their rows and parcels
// are removed at the end.

const DOMAIN = "back-office-gardens-e2e.example.test";
const run = Date.now().toString(36);
const CONSENTS = { distance_sales: "mesafeli-v5-taslak", pre_information: "onbilgi-v5-taslak" };

test.describe.configure({ mode: "serial" });

function check<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}

async function signedIn(email: string) {
  const client = anon();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

// A customer account with an owner profile (KVKK notice) and a billing
// profile, as activeMember needs.
async function newCustomer(name: string): Promise<string> {
  const email = `e2e-${name}-${run}@${DOMAIN}`;
  const phone = `+90554${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    phone: phone.slice(1),
    phone_confirm: true,
  });
  if (created.error) throw created.error;
  const ops = await signedIn("ops@example.com");
  check(
    await ops.rpc("ops_create_owner_profile", {
      p_org_id: SEED_ORG,
      p_user_id: created.data.user.id,
      p_full_name: `Üye ${name} ${run}`,
      p_contact_preference: "sms",
      p_kvkk_consent: true,
      p_phone: phone,
      p_kvkk_consent_at: new Date().toISOString(),
      p_kvkk_text_version: "kvkk-v1-taslak",
    }),
  );
  const customer = await signedIn(email);
  check(
    await customer.rpc("customer_save_billing_profile", {
      p_profile: {
        kind: "individual",
        first_name: "Üye",
        last_name: name,
        address: "Test Mah. 1. Sok. No: 2",
        district: "Nizip",
        city: "Gaziantep",
        postal_code: "27700",
      },
    }),
  );
  return email;
}

async function login(page: Page, next: string) {
  await page.goto(`/giris?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-posta").fill("ops@example.com");
  await page.getByLabel("Parola").fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname === next);
}

async function parcelPosition(parcelId: string): Promise<[number, number]> {
  const row = check(
    await admin.from("parcel").select("position:position::json").eq("id", parcelId).single(),
  ) as unknown as { position: { coordinates: [number, number] } };
  return row.position.coordinates;
}

let memberEmail = "";
let member: { userId: string; orderId: string; parcelIds: string[] };
let addonParcel = "";

test.beforeAll(async () => {
  await removeJourneyUsers(DOMAIN);
  memberEmail = await newCustomer("ek");
  member = await activeMember(memberEmail);
});

test.afterAll(() => removeJourneyUsers(DOMAIN));

test("an add-on application: period panel, overlap check, verification, Ek teklif", async ({
  page,
}) => {
  // The member applies for a second garden next to (200 m within) the first.
  const customer = await signedIn(memberEmail);
  const [lon, lat] = await parcelPosition(member.parcelIds[0]);
  const application = check(
    await customer.rpc("customer_create_application", { p_package_id: STANDART }),
  );
  const garden = `Ek bahçe ${run}`;
  check(
    await customer.rpc("customer_save_application_garden", {
      p_application_id: application,
      p_garden: { name: garden, declared_area_m2: 12000, lon: lon + 0.001, lat },
      p_detail: { entry_permission: true, authorization_basis: "title_holder" },
    }),
  );
  const number = check(
    await customer.rpc("customer_submit_application", { p_application_id: application }),
  );

  await login(page, `/operasyon/basvuru/${application}`);
  await expect(page.getByRole("heading", { name: `Başvuru ${number}` })).toBeVisible();
  const periods = page.getByTestId("membership-periods");
  await expect(periods.locator(`[data-order-id="${member.orderId}"]`)).toContainText("Ana dönem");
  await expect(page.getByTestId("membership-addon-until")).toBeVisible();

  // The duplicate check lists the member's garden in service nearby.
  const overlap = page.getByTestId("garden-overlap");
  await expect(overlap.locator(`[data-parcel-id="${member.parcelIds[0]}"]`)).toContainText(
    "Bu müşterinin",
  );
  await expect(overlap.getByRole("button", { name: "Eski parsele bağla" })).toHaveCount(0);

  // A separate period needs the explicit checkbox.
  await expect(page.getByRole("heading", { name: "Ayrı dönemle teklif ver" })).toBeVisible();
  await expect(page.getByTestId("issue-quote-form").getByRole("checkbox")).not.toBeChecked();

  await page.getByTestId("application-gardens").getByRole("link", { name: "Doğrula" }).click();
  await page.getByLabel("Doğrulanan alan (dönüm)").fill("12");
  await page.getByRole("button", { name: "Doğrulamayı kaydet" }).click();
  await expect(page.getByText("Bahçe alanı doğrulandı.")).toBeVisible();

  await expect(page.getByTestId("addon-preview")).toBeVisible();
  // The quote is issued with the start and discount of the preview: the
  // issue form has no fields of its own for them.
  await expect(page.getByTestId("addon-preview-form")).toBeVisible();
  await expect(
    page.getByTestId("addon-quote-form").locator('input[name="discount_percent"]'),
  ).toHaveAttribute("type", "hidden");
  await page.getByTestId("addon-quote-form").getByRole("button", { name: "Ek teklif ver" }).click();
  await expect(page.getByText("Teklif verildi; müşteriye bildirim gidecek.")).toBeVisible();
  const addon = page.getByTestId("quote-addon");
  await expect(addon).toBeVisible();
  await expect(addon.getByRole("link")).toHaveAttribute(
    "href",
    `/operasyon/siparis/${member.orderId}`,
  );
  const quoteId = page.url().split("/").pop()!.split("?")[0];

  // The customer accepts, ops records the transfer: the add-on is active.
  const orderId = check(
    await customer.rpc("customer_accept_quote", { p_quote_id: quoteId, p_consents: CONSENTS }),
  );
  const ops = await signedIn("ops@example.com");
  const order = check(
    await admin.from("service_order").select("total_kurus").eq("id", orderId).single(),
  );
  check(
    await ops.rpc("ops_record_manual_payment", {
      p_order_id: orderId,
      p_amount_kurus: order.total_kurus,
      p_value_date: istanbulToday(),
      p_bank_reference: `EFT-E2E-${orderId.slice(0, 8)}`,
    }),
  );
  addonParcel = check(
    await admin.from("service_order_item").select("parcel_id").eq("order_id", orderId).single(),
  ).parcel_id!;

  await page.goto(`/operasyon/siparis/${orderId}`);
  await expect(page.getByTestId("order-base-link")).toHaveAttribute(
    "href",
    `/operasyon/siparis/${member.orderId}`,
  );
  await expect(page.getByTestId("order-item-state")).toHaveText("Hizmette");
  await page.goto("/operasyon/siparis");
  await expect(
    page.locator(`[data-order-id="${orderId}"]`).getByTestId("order-addon-badge"),
  ).toBeVisible();
});

test("a removal in the queue: confirmed for today, completed now, refund queued", async ({
  page,
}) => {
  const email = await newCustomer("cikis");
  const leaving = await activeMember(email);
  const removalId = await removalFor(email, PASSWORD, leaving.parcelIds[0]);
  const removal = check(
    await admin.from("garden_removal").select("number").eq("id", removalId).single(),
  );

  await login(page, "/operasyon");
  await page.getByTestId("billing-card").locator('[data-stat="removalsRequested"]').click();
  await page.waitForURL((url) => url.pathname === "/operasyon/cikarma");
  await page.getByTestId("removal-list").getByRole("link", { name: removal.number }).click();
  await expect(
    page.getByRole("heading", { name: `Bahçe çıkarma ${removal.number}` }),
  ).toBeVisible();
  await expect(page.getByTestId("removal-lines")).toBeVisible();
  await expect(page.getByTestId("removal-access-scope")).toBeVisible();
  await expect(page.getByTestId("removal-not-due")).toBeVisible();
  // The first confirmation of a customer's request always sends an SMS.
  await expect(page.getByTestId("schedule-hint")).toContainText("Teyit edince müşteriye SMS gider");

  const schedule = page.getByTestId("schedule-removal-form");
  await schedule.getByLabel("Çıkış günü").fill(istanbulToday());
  await schedule.getByRole("button", { name: "Tarihi kaydet" }).click();
  // Another day than the requested one needs a note.
  await expect(schedule.getByText("Kontrol edin: Not.")).toBeVisible();
  await schedule.getByLabel("İç not").fill("Müşteriyle bugün için anlaşıldı");
  await schedule.getByRole("button", { name: "Tarihi kaydet" }).click();
  await expect(page.getByText("Çıkış tarihi kaydedildi.")).toBeVisible();

  const complete = page.getByTestId("complete-removal-form");
  await complete.getByRole("checkbox").check();
  await complete.getByRole("button", { name: "Hemen tamamla" }).click();
  await expect(page.getByText("Bahçe hizmetten çıkarıldı.")).toBeVisible();
  const refunds = page.getByTestId("removal-refunds");
  await expect(refunds).toBeVisible();
  const refund = check(
    await admin
      .from("refund")
      .select("number")
      .eq("garden_removal_id", removalId)
      .limit(1)
      .single(),
  );
  await expect(refunds).toContainText(refund.number);

  await page.getByTestId("removal-parcel-link").click();
  await expect(page.getByTestId("parcel-status")).toHaveText("Pasif");
  await expect(page.getByTestId("parcel-service")).toContainText("Hizmetten çıkarıldı");

  await page.goto("/operasyon/iade");
  await expect(page.getByText(refund.number)).toBeVisible();
});

test("the renewal checks the add-on garden and leaves one with an open removal unchecked", async ({
  page,
}) => {
  expect(addonParcel).not.toBe("");
  await removalFor(memberEmail, PASSWORD, member.parcelIds[0]);
  const addonOrder = check(
    await admin.from("service_order").select("id").eq("addon_of_order_id", member.orderId).single(),
  );

  // An add-on is renewed with its base.
  await login(page, "/operasyon");
  await page.goto(`/operasyon/teklif/yeni?siparis=${addonOrder.id}`);
  await page.waitForURL((url) => url.searchParams.get("siparis") === member.orderId);

  const form = page.getByTestId("parcel-quote-form");
  const added = form.locator(`[data-parcel-id="${addonParcel}"]`);
  await expect(added.getByRole("checkbox")).toBeChecked();
  const leaving = form.locator(`[data-parcel-id="${member.parcelIds[0]}"]`);
  await expect(leaving.getByRole("checkbox")).not.toBeChecked();
  await expect(leaving.getByTestId("parcel-open-removal")).toBeVisible();
});
