import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { purgeSignupAttempts } from "../local-db";
import { resolveSupabaseEnv } from "../local-supabase";

// Sign-up with details that are already registered (docs/hukuk/kararlar.md
// H33): a registered phone gets the same code step as a new one and the code
// signs its owner in to their own account; a taken e-mail gets the generic
// message with a link to the phone login. Codes come from the record
// provider's outbox; the test account is removed at the end.

const SEED = {
  org: "b0000000-0000-4000-8000-000000000001",
  parcel: "c0000000-0000-4000-8000-000000000001",
};
const digits = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
const PHONE = `+90553${digits}`;
const TYPED = `0553 ${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`;
const NEW_EMAIL = `kayitli-telefon-${digits}@signup-e2e.example.test`;

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

async function fillSignup(page: Page, phone: string, email: string) {
  await page.goto("/kayit");
  await page.getByLabel("Ad soyad").fill("Kayıtlı Numara");
  await page.getByLabel("Cep telefonu").fill(phone);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola", { exact: true }).fill("baska-parola-1");
  await page.getByLabel("Parola (tekrar)").fill("baska-parola-1");
  await page.locator('input[name="kvkk_notice"]').check();
  await page.getByRole("button", { name: "Kayıt ol ve kod gönder" }).click();
}

test.beforeAll(async () => {
  await purgeSignupAttempts();
  // The owner of the number: a viewer of the seed parcel with a verified phone.
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

test("a registered phone gets the code step; the code signs its owner in", async ({ page }) => {
  test.setTimeout(60_000);
  await fillSignup(page, TYPED, NEW_EMAIL);
  await expect(page.getByLabel("SMS kodu")).toBeVisible();
  await expect(page.locator("main").getByRole("status")).toContainText(
    `+90 5•• ••• •• ${digits.slice(-2)}`,
  );
  await expect(page.getByTestId("signup-error")).toHaveCount(0);

  const code = await latestCode(PHONE);
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel("SMS kodu").fill(code!);
  await page.getByRole("button", { name: "Doğrula" }).click();
  await page.waitForURL((url) => url.pathname === "/portal");
  await expect(page.getByText("Örnek Bahçe 1").first()).toBeVisible();

  // Nothing of the form was attached or created.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  expect(error).toBeNull();
  expect(data.users.filter((u) => u.email === NEW_EMAIL)).toHaveLength(0);
  expect(data.users.find((u) => u.id === userId)?.email ?? "").toBe("");
});

test("a taken e-mail gets the generic message and a link to the phone login", async ({ page }) => {
  test.setTimeout(60_000);
  await fillSignup(
    page,
    `0552 ${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`,
    "owner@example.com",
  );
  const error = page.getByTestId("signup-error");
  await expect(error).toContainText(
    "Kayıt tamamlanamadı; bu bilgilerle hesabınız varsa telefonunuzla giriş yapın.",
  );
  await expect(error).not.toContainText("e-posta");
  await error.getByRole("link", { name: "Telefonla giriş yap" }).click();
  await expect(page).toHaveURL("/giris?yontem=telefon");
  await expect(page.getByRole("tab", { name: "Telefon" })).toHaveAttribute("aria-selected", "true");
});
