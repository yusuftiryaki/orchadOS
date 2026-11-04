import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { resolveSupabaseEnv } from "../local-supabase";
import {
  admin,
  istanbulToday,
  login,
  PASSWORD,
  quotedApplication,
  removeJourneyUsers,
  SEED_ORG,
} from "./billing-helpers";

// Order-specific contract documents in the browser (docs/hukuk/kararlar.md
// H12, T04): the quote page shows the filled pre-information and contract;
// after the acceptance the order page and Hesabım › Sözleşmelerim list both
// PDFs and download them privately; once the order is paid ops see it on the
// list of orders missing a document, generate the withdrawal confirmation and
// download any document. Test accounts are removed at the end.

const DOMAIN = "contract-documents-e2e.example.test";
const EMAIL = `sozlesme-${Date.now().toString(36)}@${DOMAIN}`;
const env = resolveSupabaseEnv();
const options = { auth: { persistSession: false, autoRefreshToken: false } };

test.describe.configure({ mode: "serial" });

let orderId = "";

async function opsClient() {
  const ops = createClient<Database>(env.url, env.anonKey, options);
  const signedIn = await ops.auth.signInWithPassword({
    email: "ops@example.com",
    password: PASSWORD,
  });
  if (signedIn.error) throw signedIn.error;
  return ops;
}

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
  const profile = await (
    await opsClient()
  ).rpc("ops_create_owner_profile", {
    p_org_id: SEED_ORG,
    p_user_id: created.data.user.id,
    p_full_name: "Sözleşme Müşteri",
    p_contact_preference: "sms",
    p_kvkk_consent: true,
    p_phone: phone,
    p_kvkk_consent_at: new Date().toISOString(),
    p_kvkk_text_version: "kvkk-v2-taslak",
  });
  if (profile.error) throw profile.error;
  const customer = createClient<Database>(env.url, env.anonKey, options);
  const signedIn = await customer.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  const billing = await customer.rpc("customer_save_billing_profile", {
    p_profile: {
      kind: "individual",
      first_name: "Sözleşme",
      last_name: "Müşteri",
      address: "Belge Mah. 3",
      district: "Nizip",
      city: "Gaziantep",
    },
  });
  if (billing.error) throw billing.error;
  // An ops-opened customer owes the first-login KVKK notice (T15, H30) even
  // without a garden; this test is about the contract documents, not that gate.
  const notice = await customer.rpc("portal_notice_status");
  if (notice.error) throw notice.error;
  const version = (notice.data as { version: string }).version;
  const ack = await customer.rpc("portal_acknowledge_kvkk_notice", { p_text_version: version });
  if (ack.error) throw ack.error;
});

test.afterAll(async () => {
  await removeJourneyUsers(DOMAIN);
});

test("the customer reads the filled documents, accepts and downloads them", async ({ page }) => {
  test.setTimeout(120_000);
  const quoteId = await quotedApplication(EMAIL, PASSWORD);
  await login(page, EMAIL, `/portal/teklif/${quoteId}`);

  const contracts = page.getByTestId("quote-contracts");
  const pre = contracts.getByTestId("filled-pre_information");
  await expect(pre).toContainText("Ön Bilgilendirme Formu");
  await expect(pre).toContainText("Hizmet alan: Sözleşme Müşteri, Belge Mah. 3, Nizip, Gaziantep");
  await expect(pre).toContainText("Hizmet veren: orchadOS Denetim Hizmetleri A.Ş. (örnek)");
  await expect(pre).toContainText("İkinci bahçe");
  await expect(pre).toContainText(
    "ödemenin tamamlandığı (siparişin etkinleştiği) günden itibaren 14 gün",
  );
  await expect(pre.getByTestId("filled-draft")).toBeVisible(); // -taslak versions
  expect(await pre.getAttribute("data-display-sha256")).toMatch(/^[0-9a-f]{64}$/);
  await contracts.getByText("Mesafeli Hizmet Sözleşmesi'nin tamamını göster").click();
  await expect(contracts.getByTestId("filled-distance_sales")).toContainText("Madde 16");

  await page.getByLabel(/Ön Bilgilendirme Formu'nu okudum/).check();
  await page.getByLabel(/Mesafeli Hizmet Sözleşmesi'ni okudum/).check();
  await page.getByRole("button", { name: "Teklifi kabul et" }).click();
  await expect(page).toHaveURL(/\/portal\/siparis\/[0-9a-f-]{36}\?bilgi=teklif_kabul_edildi$/);
  orderId = new URL(page.url()).pathname.split("/").pop()!;

  // The documents are produced after the redirect (after()): the page says
  // they are being prepared until a reload shows them.
  const orderDocs = page.getByTestId("order-contracts").getByTestId("contract-documents");
  await expect(async () => {
    await page.reload();
    await expect(orderDocs.locator("tbody tr")).toHaveCount(2, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId("contracts-preparing")).toHaveCount(0);
  await expect(orderDocs.locator('tr[data-kind="pre_information"]')).toBeVisible();
  await expect(orderDocs.locator('tr[data-kind="distance_sales"]')).toBeVisible();

  // Sözleşmelerim from the account menu.
  await page.getByRole("button", { name: "Hesap menüsü" }).click();
  await page.getByRole("link", { name: "Sözleşmelerim" }).click();
  await expect(page).toHaveURL("/portal/hesap/sozlesmeler");
  const section = page.locator(`[data-testid="contracts-order"][data-order-id="${orderId}"]`);
  await expect(section.locator("li[data-kind]")).toHaveCount(2);
  await expect(section.getByTestId("contracts-preparing")).toHaveCount(0);
  const href = await section
    .locator('li[data-kind="distance_sales"]')
    .getByTestId("contract-download")
    .getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["cache-control"]).toBe("private, no-store");
  expect(pdf.headers()["content-disposition"]).toMatch(
    /^attachment; filename=mesafeli-sozlesme-S-\d{4}-\d{6}\.pdf$/,
  );
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Hesabım links to it as well.
  await page.goto("/portal/hesap");
  await expect(page.getByTestId("account-contracts").getByRole("link")).toHaveAttribute(
    "href",
    "/portal/hesap/sozlesmeler",
  );

  // Another user gets 404 for the customer's document.
  await page.context().clearCookies();
  await login(page, "viewer@example.com", "/portal");
  expect((await page.request.get(href!)).status()).toBe(404);
});

test("ops list the missing withdrawal confirmation, generate it and download a copy", async ({
  page,
}) => {
  test.setTimeout(120_000);
  expect(orderId).not.toBe("");
  const ops = await opsClient();
  const order = await ops
    .from("service_order")
    .select("total_kurus, number")
    .eq("id", orderId)
    .single();
  if (order.error) throw order.error;
  const paid = await ops.rpc("ops_record_manual_payment", {
    p_order_id: orderId,
    p_amount_kurus: order.data.total_kurus,
    p_value_date: istanbulToday(),
    p_bank_reference: `EFT-${orderId.slice(0, 8)}`,
  });
  if (paid.error) throw paid.error;

  await login(page, "ops@example.com", "/operasyon/siparis");
  const missing = page.getByTestId("orders-missing-contracts");
  const row = missing.locator(`tr[data-order-id="${orderId}"]`);
  await expect(row).toContainText(order.data.number);
  await expect(row).toContainText("Cayma süresi bildirimi");
  await row.getByRole("button", { name: "Belgeleri üret" }).click();
  await expect(page.getByTestId("contracts-generate-result")).toHaveText("1 belge üretildi.");
  await expect(missing.locator(`tr[data-order-id="${orderId}"]`)).toHaveCount(0);

  await page.goto(`/operasyon/siparis/${orderId}`);
  const docs = page.getByTestId("order-contract-documents").getByTestId("contract-documents");
  await expect(docs.locator("tbody tr")).toHaveCount(3);
  const href = await docs
    .locator('tr[data-kind="withdrawal_confirmation"]')
    .getByTestId("contract-download")
    .getAttribute("href");
  const pdf = await page.request.get(href!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["cache-control"]).toBe("private, no-store");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
