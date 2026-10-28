import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { purgeParcels } from "../local-db";
import { resolveSupabaseEnv } from "../local-supabase";

// Notifications on the operations screens: a published visit fills the queue
// for the owner and the viewer; one message has failed. Ops finds it under
// "Bildirimler" with the phone masked and queues it again. The test removes
// its parcel (and with it the notifications) at the end.

const SEED_ORG = "b0000000-0000-4000-8000-000000000001";
const PARCEL = "f6000000-0000-4000-8000-000000000002";
const SESSION = "f6100000-0000-4000-8000-000000000002";
const OWNER = "a0000000-0000-4000-8000-000000000001";
const VIEWER = "a0000000-0000-4000-8000-000000000002";
const PARCEL_NAME = `Bildirim bahçesi ${Date.now().toString(36)}`;

const env = resolveSupabaseEnv();
const admin = createClient<Database>(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function check<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

test.beforeAll(async () => {
  await purgeParcels([PARCEL]);
  check(await admin.from("parcel").insert({ id: PARCEL, org_id: SEED_ORG, name: PARCEL_NAME }));
  check(
    await admin.from("parcel_access").insert([
      { org_id: SEED_ORG, parcel_id: PARCEL, user_id: OWNER, role: "owner" },
      { org_id: SEED_ORG, parcel_id: PARCEL, user_id: VIEWER, role: "viewer" },
    ]),
  );
  check(
    await admin.from("session").insert({
      id: SESSION,
      org_id: SEED_ORG,
      parcel_id: PARCEL,
      kind: "periodic_scan",
      status: "in_review",
      started_at: "2026-10-14T07:00:00Z",
    }),
  );
  check(await admin.from("session").update({ status: "published" }).eq("id", SESSION));
  check(
    await admin
      .from("notification")
      .update({ status: "failed", attempts: 5, last_error: "provider_error:30" })
      .eq("session_id", SESSION)
      .eq("recipient_user_id", OWNER),
  );
});

test.afterAll(() => purgeParcels([PARCEL]));

test("ops sees the notifications with masked phones and retries a failed one", async ({ page }) => {
  await page.goto("/giris?next=/operasyon");
  await page.getByLabel("E-posta").fill("ops@example.com");
  await page.getByLabel("Parola").fill("orchados-dev");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname === "/operasyon");

  await page.getByRole("link", { name: "Bildirimler" }).click();
  await page.waitForURL((url) => url.pathname === "/operasyon/bildirimler");
  const rows = page.getByTestId("notification-table").locator("tr", { hasText: PARCEL_NAME });
  await expect(rows).toHaveCount(2);

  const owner = rows.filter({ hasText: "Örnek Sahip" });
  await expect(owner).toContainText("+90 5•• ••• •• 01");
  await expect(owner).toContainText("Rapor hazır");
  await expect(owner).toContainText("WhatsApp");
  await expect(owner).toContainText("Başarısız");
  await expect(owner).toContainText("Sağlayıcı hatası (30)");
  const viewer = rows.filter({ hasText: "Örnek Hissedar" });
  await expect(viewer).toContainText("+90 5•• ••• •• 02");
  await expect(viewer).toContainText("Bekliyor");
  await expect(viewer.getByRole("button", { name: "Yeniden kuyruğa al" })).toHaveCount(0);
  // No full number anywhere on the page.
  await expect(page.locator("main")).not.toContainText("5550000001");

  await page
    .getByRole("navigation", { name: "Bildirim filtresi" })
    .getByRole("link", { name: /^Başarısız/ })
    .click();
  await page.waitForURL(/durum=failed/);
  await expect(rows).toHaveCount(1);

  await owner.getByRole("button", { name: "Yeniden kuyruğa al" }).click();
  await expect(page.locator("main")).toContainText("Bildirim yeniden kuyruğa alındı.");
  await expect(rows).toHaveCount(0);

  const { data } = check(
    await admin
      .from("notification")
      .select("status, attempts")
      .eq("session_id", SESSION)
      .eq("recipient_user_id", OWNER)
      .single(),
  );
  expect(data).toEqual({ status: "pending", attempts: 0 });
});
