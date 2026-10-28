import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { LEGAL_TEXT_VERSIONS } from "../../src/lib/legal/versions";
import { agePhoneConfirmation, purgeBillingUsers, purgeSignupAttempts } from "../local-db";
import { resolveSupabaseEnv } from "../local-supabase";

// Account pre-hijack, in the browser (review of PR #93, round 2): someone
// registers the victim's phone with their own e-mail and password, and their
// own code step sends the phone's confirmation code. The victim enters that
// code at /giris (phone login). `/` refuses to finish the sign-up without its
// ticket: the account is deleted, the session closed, and the login page
// explains how a registrant finishes. Codes come from the record provider's
// outbox.

const digits = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
const PHONE = `+90554${digits}`;
const TYPED = `0554 ${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`;
const ATTACKER_EMAIL = `on-ele-gecirme-${digits}@signup-e2e.example.test`;
// The registrant of the second test, whose complete never ran.
const OWN_PHONE = `+90554${String(Number(digits) + 1).padStart(7, "0")}`;
const OWN_EMAIL = `yarim-kalan-${digits}@signup-e2e.example.test`;

const env = resolveSupabaseEnv();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient<Database>(env.url, env.serviceRoleKey, opts);

async function latestCode(phone: string): Promise<string | null> {
  const { data, error } = await admin.rpc("message_outbox_list", {
    p_recipient: phone,
    p_limit: 1,
  });
  if (error) throw error;
  const body = data?.[0]?.purpose === "login_code" ? data[0].body : "";
  return /\b(\d{6})\b/.exec(body)?.[1] ?? null;
}

async function userIdByEmail(email: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email === email)?.id ?? null;
}
const attackerId = () => userIdByEmail(ATTACKER_EMAIL);

// customer-signup register as the web sends it; returns the ticket.
async function register(phone: string, email: string, password: string, ip: string) {
  const res = await fetch(`${env.url}/functions/v1/customer-signup`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-orchados-proxy-secret": "signup-proxy-local",
    },
    body: JSON.stringify({
      action: "register",
      full_name: "Deneme Kayıt",
      phone,
      email,
      password,
      contact_preference: "sms",
      consents: {
        kvkk_notice_version: LEGAL_TEXT_VERSIONS.kvkk_notice,
        explicit_text_version: "riza-v1-taslak",
        explicit_service_improvement: false,
        explicit_marketing: false,
      },
      client_ip: ip,
    }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { ticket: string }).ticket;
}

// The code step with the register's ticket: the phone's code goes out.
async function sendCode(phone: string, ticket: string) {
  const client = createClient<Database>(env.url, env.anonKey, opts);
  const grant = await client.rpc("signup_code_grant", { p_phone: phone, p_ticket: ticket });
  expect(grant.data).toBe(true);
  expect((await client.auth.resend({ type: "sms", phone })).error).toBeNull();
  return client;
}

test.beforeAll(async () => {
  await purgeSignupAttempts();
});

test.afterAll(async () => {
  for (const email of [ATTACKER_EMAIL, OWN_EMAIL]) {
    const id = await userIdByEmail(email);
    if (!id) continue;
    await purgeBillingUsers([id]);
    await admin.auth.admin.deleteUser(id);
  }
});

test("a code entered at /giris never finishes someone else's sign-up of the phone", async ({
  page,
}) => {
  test.setTimeout(60_000);
  // The attacker's register and code step (their ticket grants the code).
  await sendCode(PHONE, await register(PHONE, ATTACKER_EMAIL, "saldirgan-1234", "203.0.113.90"));
  const code = await latestCode(PHONE);
  expect(code).toMatch(/^\d{6}$/);

  // The victim logs in with the phone and the code that arrived.
  await page.goto("/giris");
  await page.getByRole("tab", { name: "Telefon" }).click();
  await page.getByLabel("Cep telefonu").fill(TYPED);
  await page.getByRole("button", { name: "SMS kodu gönder" }).click();
  await page.getByLabel("SMS kodu").fill(code!);
  await page.getByRole("button", { name: "Giriş yap" }).click();

  await page.waitForURL((url) => url.pathname === "/giris" && url.search === "?kayit=yarim");
  await expect(page.getByTestId("signup-unfinished")).toContainText("e-posta ve parolayla");
  expect(await attackerId()).toBeNull();
  // Signed out: `/` is the landing page again.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Giriş yap" }).first()).toBeVisible();
  await expect(page.getByTestId("verify-phone-card")).toHaveCount(0);
});

// The guidance works: a registrant whose phone a code confirmed but whose
// complete never ran (a closed tab) logs in with e-mail and password and
// finishes at /kayit/dogrula (the password session claims a ticket).
test("a registrant without a ticket finishes with the password at /kayit/dogrula", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const client = await sendCode(
    OWN_PHONE,
    await register(OWN_PHONE, OWN_EMAIL, "kendi-parola-1", "203.0.113.91"),
  );
  const first = await latestCode(OWN_PHONE);
  const verified = await client.auth.verifyOtp({ phone: OWN_PHONE, token: first!, type: "sms" });
  expect(verified.error).toBeNull();
  await agePhoneConfirmation(verified.data.user!.id, 2);

  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(OWN_EMAIL);
  await page.getByLabel("Parola").fill("kendi-parola-1");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByTestId("verify-phone-card")).toBeVisible();
  await page.getByRole("link", { name: "Telefonu doğrula" }).click();
  await page.getByRole("button", { name: "SMS kodu gönder" }).click();
  await expect(page.getByLabel("SMS kodu")).toBeVisible();
  const code = await latestCode(OWN_PHONE);
  expect(code).toMatch(/^\d{6}$/);
  expect(code).not.toBe(first);
  await page.getByLabel("SMS kodu").fill(code!);
  await page.getByRole("button", { name: "Doğrula" }).click();
  await page.waitForURL((url) => url.pathname === "/portal");
});
