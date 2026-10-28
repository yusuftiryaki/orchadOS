import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { purgeDemoAttempts } from "../local-db";
import { createPortalFixture, PORTAL, purgePortalFixture } from "../integration/portal-fixture";
import { resolveSupabaseEnv } from "../local-supabase";
import { DEMO_TOUR_READY } from "./global-setup";

// Boundary notice (docs/hukuk/kararlar.md H07, T16): the long form on the
// owner's report pages, the short form under every map, on a phone, in print
// and in the demo tour (the same portal components).

test.describe.configure({ mode: "serial" });

// The binding wording (contract Md. 6/1), spelled out.
const LONG =
  "Haritadaki sınır, sizin ya da yetkilendirdiğiniz kişinin gösterdiği fiili kullanım sınırıdır. Tapu sınırı, kadastro ölçümü, mülkiyet ya da kullanım hakkı tespiti değildir; resmi bir sınır belirlemez. Sınır ve mülkiyet uyuşmazlıklarında kanıt olarak sunulmak üzere hazırlanmamıştır.";
const SHORT = "Fiili kullanım sınırı; tapu ya da kadastro sınırı değildir.";
const DEMO_PARCEL = "de100000-0000-4000-8000-000000000001";

test.beforeAll(async () => {
  const env = resolveSupabaseEnv();
  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await createPortalFixture(admin as never);
});
test.afterAll(async () => {
  await purgePortalFixture();
  await purgeDemoAttempts();
});

async function login(page: Page) {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill(PORTAL.users.owner);
  await page.getByLabel("Parola").fill(PORTAL.password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname !== "/giris");
}

// Every map caption on the page carries the short form; the long form shows
// once at least.
async function expectNotices(page: Page, { long }: { long: boolean }) {
  const captions = page.getByTestId("map-boundary-caption");
  await expect(captions.first()).toBeVisible();
  for (const caption of await captions.all()) {
    await expect(caption).toHaveText(SHORT);
    await expect(caption).toBeVisible();
  }
  if (long) {
    const notice = page.getByTestId("boundary-notice").first();
    await expect(notice).toHaveText(LONG);
    await expect(notice).toBeVisible();
  }
}

test("the owner's parcel page and tour show the notice, on a phone and in print", async ({
  page,
}) => {
  const report = `/portal/parsel/${PORTAL.parcelA}`;
  await login(page);
  await page.goto(report);
  await expect(page.getByTestId("parcel-map")).toBeVisible();
  await expectNotices(page, { long: true });

  await page.emulateMedia({ media: "print" });
  await expectNotices(page, { long: true });
  await page.emulateMedia({ media: "screen" });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(report);
  await expectNotices(page, { long: true });

  await page.goto(`${report}/gezi`);
  await expect(page.getByTestId("parcel-map")).toBeAttached();
  await expectNotices(page, { long: false });
});

test("the demo tour shows the notice on the report, inventory and tour pages", async ({ page }) => {
  test.skip(!process.env[DEMO_TOUR_READY], "demo tour dataset not loaded (needs uv)");
  await purgeDemoAttempts();
  await page.goto("/demo");
  await page.getByTestId("demo-start").click();
  await page.waitForURL((url) => url.pathname === "/portal");
  await expect(page.getByTestId("demo-banner")).toBeVisible();

  const report = `/portal/parsel/${DEMO_PARCEL}`;
  await page.goto(report);
  await expect(page.getByTestId("parcel-map")).toBeVisible();
  await expectNotices(page, { long: true });

  await page.goto(`${report}/envanter`);
  await expect(page.getByTestId("inventory-report")).toBeVisible();
  await expectNotices(page, { long: true });

  await page.goto(`${report}/gezi`);
  await expect(page.getByTestId("parcel-map")).toBeAttached();
  await expectNotices(page, { long: false });
});
