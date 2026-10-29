import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import {
  ASSET,
  createPortalFixture,
  PORTAL,
  purgePortalFixture,
  treeId,
} from "../integration/portal-fixture";
import { purgeViewerInvitations } from "../local-db";
import { resolveSupabaseEnv } from "../local-supabase";
import { admin, login, PASSWORD, SEED_ORG } from "./billing-helpers";

// Legal follow-ups, wave 2, in the browser (docs/hukuk/kararlar.md T20, T15,
// T16, T11):
// - ops hides a crop; the owner's tree card no longer shows it, ops sees it
//   with the "Gizlendi" badge;
// - with the hosted defaults (no settings row: switches off) the invitation
//   form and the boundary approval ask for no declaration and the KVKK form
//   is closed; with the switches on (seed org, and the portal org once its
//   row is written) the declarations are required;
// - an invited co-owner gets the viewer_invited SMS and records the KVKK
//   notice on first login ("Kaydet");
// - an owner files a KVKK application; ops answers it.

test.describe.configure({ mode: "serial" });

const env = resolveSupabaseEnv();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const SEED_PARCEL = "c0000000-0000-4000-8000-000000000001";
const COOWNER_EMAIL = `hissedar-${Date.now().toString(36)}@legal-wave2.example.test`;
const COOWNER_PHONE = `+90554${String(Date.now()).slice(-7)}`;
const KVKK_MESSAGE = `E2E başvurusu ${Date.now().toString(36)}: verilerim hakkında bilgi istiyorum.`;

let coownerId = "";

async function signedIn(email: string) {
  const client = createClient<Database>(env.url, env.anonKey, options);
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

test.beforeAll(async () => {
  await purgeViewerInvitations([COOWNER_PHONE]);
  await createPortalFixture(admin as never);
  // ops@example.com runs the portal test org too (hiding images is ops work).
  const ops = (await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })).data.users.find(
    (u) => u.email === "ops@example.com",
  )!;
  const membership = await admin
    .from("membership")
    .insert({ org_id: PORTAL.org, user_id: ops.id, role: "ops" });
  if (membership.error) throw membership.error;
  const created = await admin.auth.admin.createUser({
    email: COOWNER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
    phone: COOWNER_PHONE.slice(1),
    phone_confirm: true,
  });
  if (created.error) throw created.error;
  coownerId = created.data.user.id;
});

test.afterAll(async () => {
  await purgePortalFixture();
  await purgeViewerInvitations([COOWNER_PHONE]);
  if (coownerId) await admin.auth.admin.deleteUser(coownerId);
});

test("ops hides a crop: the owner no longer sees it, ops sees it marked (T20)", async ({
  page,
}) => {
  const card = `/portal/parsel/${PORTAL.parcelA}/agac/${treeId("S1-1")}`;
  await login(page, PORTAL.users.owner, card);
  await expect(page.locator(`[data-photo-id="${ASSET.cropPubN}"]`)).toHaveCount(1);

  await page.context().clearCookies();
  const visit = `/operasyon/ziyaret/${PORTAL.visitPub}`;
  await login(page, "ops@example.com", visit);
  await page.goto(`${visit}?gorsel=tree_crop&sayfa=0`);
  const item = page.locator(`[data-media-id="${ASSET.cropPubN}"]`);
  await item.getByPlaceholder(/Not/).fill("K-2026-901");
  await item.getByRole("button", { name: "Gizle" }).click();
  await expect(page.getByText("Görüntü gizlendi.")).toBeVisible();
  const hidden = page.locator(`[data-hidden-id="${ASSET.cropPubN}"]`);
  await expect(hidden).toContainText("Gizlendi");
  await expect(hidden).toContainText("KVKK itirazı");

  await page.context().clearCookies();
  await login(page, PORTAL.users.owner, card);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(`[data-photo-id="${ASSET.cropPubN}"]`)).toHaveCount(0);
});

test("hosted defaults: no declarations and no KVKK form while the switches are off", async ({
  page,
}) => {
  // The portal test org has no settings row: every switch is off.
  await login(page, PORTAL.users.owner, `/portal/parsel/${PORTAL.parcelA}`);
  await expect(page.getByTestId("invite-viewer")).toBeVisible();
  await expect(page.getByTestId("viewer-declaration")).toHaveCount(0);
  await expect(page.getByTestId("boundary-confirm")).toBeVisible();
  await expect(page.getByTestId("boundary-declaration")).toHaveCount(0);
  const form = await page.goto("/portal/hesap/izinler/kvkk-basvurusu");
  expect(form?.status()).toBe(404);
});

test("with the switch on the boundary approval needs the declaration (T16)", async ({ page }) => {
  const settings = await admin
    .from("org_billing_setting")
    .insert({ org_id: PORTAL.org, boundary_declaration_required: true });
  if (settings.error) throw settings.error;
  await login(page, PORTAL.users.owner, `/portal/parsel/${PORTAL.parcelA}`);
  const approve = page.getByTestId("boundary-approve");
  await page.getByTestId("boundary-confirm").check();
  await expect(approve).toBeDisabled();
  const declaration = page.getByTestId("boundary-declaration");
  await expect(page.getByTestId("boundary-card")).toContainText(
    "Gösterdiğim sınırın fiilen kullandığım alan olduğunu ve ekibinizin bu alana girmesine izin vermeye yetkili olduğumu beyan ederim.",
  );
  await declaration.check();
  await approve.click();
  await expect(page.getByTestId("boundary-approved")).toBeVisible();
});

test("an invited co-owner gets the SMS and records the KVKK notice on first login (T15)", async ({
  page,
}) => {
  await login(page, "owner@example.com", `/portal/parsel/${SEED_PARCEL}`);
  const form = page.getByTestId("invite-viewer");
  await form.getByLabel("Ad soyad").fill("E2E Ortak Sahip");
  await form.getByLabel("Telefon").fill(COOWNER_PHONE.replace("+90", "0"));
  await expect(form.getByTestId("viewer-declaration")).toContainText(
    "Bu kişinin bahçede hakkı var ve numarasını vermeye yetkiliyim.",
  );
  await form.getByTestId("viewer-declaration").getByRole("checkbox").check();
  await form.getByRole("button", { name: "Hissedar davet et" }).click();
  await expect(page.getByTestId("viewers-card")).toContainText("Davetiniz alındı");

  // Ops completes the invitation (the account exists already).
  const ops = await signedIn("ops@example.com");
  const invitations = await ops.rpc("ops_viewer_invitations", { p_org_id: SEED_ORG });
  if (invitations.error) throw invitations.error;
  const invitation = invitations.data.find((i) => i.phone === COOWNER_PHONE)!;
  const resolved = await ops.rpc("ops_resolve_viewer_invitation", {
    p_invitation_id: invitation.id,
    p_approve: true,
    p_user_id: coownerId,
  });
  if (resolved.error) throw resolved.error;
  const sms = await admin
    .from("notification")
    .select("template, channel, vars")
    .eq("recipient_user_id", coownerId);
  expect(sms.data).toEqual([
    {
      template: "viewer_invited",
      channel: "sms",
      vars: { parcel_name: "Örnek Bahçe 1", path: "/portal" },
    },
  ]);

  await page.context().clearCookies();
  await login(page, COOWNER_EMAIL, "/portal");
  const gate = page.getByTestId("notice-gate");
  await expect(gate).toContainText("Kişisel verileriniz hakkında bilgilendirme");
  await expect(gate).not.toContainText("onaylıyorum");
  await gate.getByLabel("Aydınlatma metnini okudum.").check();
  await gate.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByTestId("notice-gate")).toHaveCount(0);
  await expect(page.getByText("Örnek Bahçe 1")).toBeVisible();
});

test("an owner files a KVKK application; ops sees the deadline and answers (T11)", async ({
  page,
}) => {
  await login(page, "owner@example.com", "/portal/hesap/izinler");
  await page.getByTestId("kvkk-request-link").getByRole("link").click();
  await expect(page).toHaveURL(/\/portal\/hesap\/izinler\/kvkk-basvurusu$/);
  const form = page.getByTestId("kvkk-request-form");
  await form.getByLabel("Başvuru konusu").selectOption("access");
  await form.getByLabel("Talebiniz").fill(KVKK_MESSAGE);
  await form.getByRole("button", { name: "Başvuruyu gönder" }).click();
  await expect(page.getByText("Başvurunuz alındı.")).toBeVisible();
  await expect(page.getByTestId("kvkk-requests")).toContainText("Verilerim hakkında bilgi");

  await page.context().clearCookies();
  await login(page, "ops@example.com", "/operasyon/kvkk");
  const row = page.getByTestId("kvkk-request-table").locator("tr", { hasText: KVKK_MESSAGE });
  await expect(row).toContainText("gün kaldı");
  await row.getByLabel("Durum").selectOption("answered");
  await row.getByRole("button", { name: "Durumu kaydet" }).click();
  await expect(page.getByText("Başvurunun durumu güncellendi.")).toBeVisible();
});
