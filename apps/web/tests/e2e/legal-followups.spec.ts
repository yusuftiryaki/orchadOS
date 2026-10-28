import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { EARLY_PERFORMANCE_TEXT } from "../../src/lib/legal/early-performance";
import { resolveSupabaseEnv } from "../local-supabase";
import {
  admin,
  login,
  PASSWORD,
  quotedApplication,
  removeJourneyUsers,
  SEED_ORG,
} from "./billing-helpers";

// Legal follow-ups in the browser (docs/hukuk/kararlar.md H11 (a), T03, T21):
// a customer accepts one quote with the early-performance box ticked and one
// without; only the first gets an early_performance consent. The site footer
// shows the seed's complete company information. Test accounts are removed
// at the end.

const DOMAIN = "legal-followups.example.test";
const EMAIL = `hukuk-${Date.now().toString(36)}@${DOMAIN}`;
const env = resolveSupabaseEnv();
const options = { auth: { persistSession: false, autoRefreshToken: false } };

test.describe.configure({ mode: "serial" });

// A customer with an owner profile (KVKK notice) and a billing profile.
test.beforeAll(async () => {
  await removeJourneyUsers(DOMAIN);
  const phone = `+90553${String(Date.now()).slice(-7)}`;
  const created = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    phone: phone.slice(1),
    phone_confirm: true,
  });
  if (created.error) throw created.error;
  const ops = createClient<Database>(env.url, env.anonKey, options);
  const opsLogin = await ops.auth.signInWithPassword({
    email: "ops@example.com",
    password: PASSWORD,
  });
  if (opsLogin.error) throw opsLogin.error;
  const profile = await ops.rpc("ops_create_owner_profile", {
    p_org_id: SEED_ORG,
    p_user_id: created.data.user.id,
    p_full_name: "Hukuk Müşteri",
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
      first_name: "Hukuk",
      last_name: "Müşteri",
      address: "Test Mah. 1",
      district: "Nizip",
      city: "Gaziantep",
    },
  });
  if (billing.error) throw billing.error;
});

test.afterAll(async () => {
  await removeJourneyUsers(DOMAIN);
});

// consent_record is private: the kinds are read from the order's audit trail.
async function earlyConsents(orderId: string) {
  const audit = await admin
    .from("audit_event")
    .select("details")
    .eq("action", "consent.granted")
    .contains("details", { order_id: orderId });
  return (audit.data ?? []).flatMap((r) => (r.details as { kinds?: string[] }).kinds ?? []);
}

for (const ticked of [true, false]) {
  test(`accepts a quote ${ticked ? "with" : "without"} the early-performance box`, async ({
    page,
  }) => {
    const quoteId = await quotedApplication(EMAIL, PASSWORD);
    await login(page, EMAIL, `/portal/teklif/${quoteId}`);
    const box = page.getByTestId("quote-early-performance");
    await expect(box).toContainText(EARLY_PERFORMANCE_TEXT);
    await expect(box.getByRole("checkbox")).not.toBeChecked();
    await page.getByLabel(/Ön Bilgilendirme Formu'nu okudum/).check();
    await page.getByLabel(/Mesafeli Hizmet Sözleşmesi'ni okudum/).check();
    if (ticked) await box.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Teklifi kabul et" }).click();
    await expect(page).toHaveURL(/\/portal\/siparis\/[0-9a-f-]{36}\?bilgi=teklif_kabul_edildi$/);
    const orderId = new URL(page.url()).pathname.split("/").pop()!;
    expect(await earlyConsents(orderId)).toEqual(
      ticked
        ? ["distance_sales", "pre_information", "early_performance"]
        : ["distance_sales", "pre_information"],
    );
  });
}

test("the footer shows the seller's complete company information (T21)", async ({ page }) => {
  await page.goto("/");
  const company = page.getByTestId("footer-company");
  await expect(company).toContainText("orchadOS Denetim Hizmetleri A.Ş. (örnek)");
  await expect(company).toContainText("KEP: orchados@hs01.kep.example");
  await page.goto("/kvkk");
  await expect(page.getByRole("article")).toContainText(
    "Unvan: orchadOS Denetim Hizmetleri A.Ş. (örnek)",
  );
  await expect(page.getByRole("article")).not.toContainText("[KEP adresi]");
});
