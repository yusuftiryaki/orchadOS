import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { resolveSupabaseEnv } from "../local-supabase";

// Phone login in the browser: number -> SMS code -> portal. The code goes
// through the Auth Send SMS hook to the record provider (no SMS is sent); the
// test reads it from the outbox. The test account (a viewer of the seed parcel)
// is removed at the end.

const SEED = {
  org: "b0000000-0000-4000-8000-000000000001",
  parcel: "c0000000-0000-4000-8000-000000000001",
};
const digits = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
const PHONE = `+90555${digits}`;
// Typed the way an owner would.
const TYPED = `0555 ${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`;
const UNINVITED = `+90554${digits}`;

const env = resolveSupabaseEnv();
const admin = createClient<Database>(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let userId: string;

async function latestCode(phone: string): Promise<string | null> {
  const { data, error } = await admin.rpc("message_outbox_list", {
    p_recipient: phone,
    p_limit: 1,
  });
  if (error) throw error;
  const body = data?.[0]?.purpose === "login_code" ? data[0].body : "";
  return /\b(\d{6})\b/.exec(body)?.[1] ?? null;
}

test.beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({ phone: PHONE, phone_confirm: true });
  if (error) throw error;
  userId = data.user.id;
  const access = await admin
    .from("parcel_access")
    .insert({ org_id: SEED.org, parcel_id: SEED.parcel, user_id: userId, role: "viewer" });
  if (access.error) throw access.error;
});

test.afterAll(async () => {
  if (userId) await admin.auth.admin.deleteUser(userId);
});

test("an invited owner signs in with the SMS code", async ({ page }) => {
  await page.goto("/giris?next=/portal");
  await page.getByRole("tab", { name: "Telefon" }).click();
  await page.getByLabel("Cep telefonu").fill("0555 12");
  await page.getByRole("button", { name: "SMS kodu gönder" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "Geçerli bir cep telefonu numarası girin.",
  );

  await page.getByLabel("Cep telefonu").fill(TYPED);
  await page.getByRole("button", { name: "SMS kodu gönder" }).click();
  await expect(page.locator("main").getByRole("status")).toContainText(
    `+90 5•• ••• •• ${digits.slice(-2)}`,
  );
  // Resend waits a minute.
  await expect(page.getByRole("button", { name: /Yeniden göndermek için \d+ sn/ })).toBeDisabled();

  const code = await latestCode(PHONE);
  expect(code).toMatch(/^\d{6}$/);

  await page.getByLabel("SMS kodu").fill(code === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("4 deneme hakkınız kaldı");

  await page.getByLabel("SMS kodu").fill(code!);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname === "/portal");
  await expect(page.getByText("Örnek Bahçe 1").first()).toBeVisible();
});

test("an uninvited number is told nothing and cannot sign in", async ({ page }) => {
  await page.goto("/giris");
  await page.getByRole("tab", { name: "Telefon" }).click();
  await page.getByLabel("Cep telefonu").fill(UNINVITED);
  await page.getByRole("button", { name: "SMS kodu gönder" }).click();
  // Same answer as for a registered number: the page does not reveal accounts.
  await expect(page.locator("main").getByRole("status")).toContainText("kayıtlıysa");
  expect(await latestCode(UNINVITED)).toBeNull();

  await page.getByLabel("SMS kodu").fill("123456");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Kod hatalı");
  await expect(page).toHaveURL(/\/giris/);

  await page.getByRole("button", { name: "Numarayı değiştir" }).click();
  await expect(page.getByLabel("Cep telefonu")).toHaveValue(UNINVITED);
});
