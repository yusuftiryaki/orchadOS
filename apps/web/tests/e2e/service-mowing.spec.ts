import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { purgeParcels } from "../local-db";
import { resolveSupabaseEnv } from "../local-supabase";

// Weed mowing service end to end (IP15, docs/MVP.md Module 6): the owner sees
// the offer on a parcel, requests the job with the early-performance box
// ticked; ops confirms the amount and today's date, uploads a before and an
// after photo and closes the job; the owner sees the job done with both proof
// photos. A fresh parcel of the seed org is used (owner@ as owner) and the
// seed catalogue row's season (the default and the pistachio row, the
// parcel's species) is moved around today for the run, then both are put
// back. The seed leaves mowing unpriced (owner decision of 2 November 2026):
// the card and the form say "Fiyat teklifle bildirilir", the request freezes
// no amount and ops enters it by hand when scheduling.

const PASSWORD = "orchados-dev";
const ORG = "b0000000-0000-4000-8000-000000000001";
const OWNER = "a0000000-0000-4000-8000-000000000001";
const OPS = "a0000000-0000-4000-8000-000000000005";
const SERVICE = "91500000-0000-4000-8000-000000000001";
const run = Date.now().toString(36);
const PARCEL_NAME = `Biçme Bahçesi ${run}`;

const env = resolveSupabaseEnv();
const admin = createClient<Database>(env.url, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Season = Pick<
  Database["public"]["Tables"]["service_type"]["Row"],
  "season_start_month" | "season_start_day" | "season_end_month" | "season_end_day"
>;
let original: Season | null = null;
let originalPistachio: Season | null = null;
let parcelId = "";

const istanbulToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const shift = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  // No 29 February in a season boundary (valid_month_day).
  if (t.getUTCMonth() === 1 && t.getUTCDate() === 29) t.setUTCDate(28);
  return t;
};

// A tiny valid JPEG (1x1, grey), with one changed byte per phase so the two
// photos have different content hashes.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);
const photo = (n: number) => {
  const b = Buffer.from(JPEG);
  b[20] = n; // inside the JFIF header: a different hash, still a valid JPEG
  return b;
};

async function login(page: Page, email: string, next: string) {
  await page.goto(`/giris?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname === next);
}

test.beforeAll(async () => {
  const { data: row, error } = await admin
    .from("service_type")
    .select("season_start_month, season_start_day, season_end_month, season_end_day")
    .eq("id", SERVICE)
    .single();
  if (error) throw error;
  original = row;
  const pistachio = await admin
    .from("service_type_season")
    .select("season_start_month, season_start_day, season_end_month, season_end_day")
    .eq("service_type_id", SERVICE)
    .eq("species", "antep_fistigi")
    .single();
  if (pistachio.error) throw pistachio.error;
  originalPistachio = pistachio.data;
  const from = shift(istanbulToday(), -10);
  const to = shift(istanbulToday(), 10);
  const inSeason = {
    season_start_month: from.getUTCMonth() + 1,
    season_start_day: from.getUTCDate(),
    season_end_month: to.getUTCMonth() + 1,
    season_end_day: to.getUTCDate(),
  };
  const season = await admin.from("service_type").update(inSeason).eq("id", SERVICE);
  if (season.error) throw season.error;
  const own = await admin
    .from("service_type_season")
    .update(inSeason)
    .eq("service_type_id", SERVICE)
    .eq("species", "antep_fistigi");
  if (own.error) throw own.error;

  const parcel = await admin
    .from("parcel")
    .insert({
      org_id: ORG,
      name: PARCEL_NAME,
      province: "Gaziantep",
      district: "Şahinbey",
      village: "Örnek Köyü",
      estimated_area_m2: 5000,
      status: "active_monitoring",
      species: "antep_fistigi",
    })
    .select("id")
    .single();
  if (parcel.error) throw parcel.error;
  parcelId = parcel.data.id;
  const access = await admin
    .from("parcel_access")
    .insert({ org_id: ORG, parcel_id: parcelId, user_id: OWNER, role: "owner", granted_by: OPS });
  if (access.error) throw access.error;
});

test.afterAll(async () => {
  if (parcelId) await purgeParcels([parcelId]);
  if (original) await admin.from("service_type").update(original).eq("id", SERVICE);
  if (originalPistachio) {
    await admin
      .from("service_type_season")
      .update(originalPistachio)
      .eq("service_type_id", SERVICE)
      .eq("species", "antep_fistigi");
  }
});

test("owner requests mowing, ops completes it with proof, owner sees the proof", async ({
  browser,
}) => {
  // 1. Owner: the offer card on the parcel page, then the request form.
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await login(owner, "owner@example.com", "/portal");
  await owner.goto(`/portal/parsel/${parcelId}`);
  // Unpriced: no number on the card.
  const price = owner.getByTestId("service-offer-price").first();
  await expect(price).toHaveText("Fiyat teklifle bildirilir");
  await owner.getByRole("link", { name: "Talep et" }).first().click();
  await owner.waitForURL(/\/portal\/hizmetler\/yeni/);
  await expect(owner.getByText(PARCEL_NAME).first()).toBeVisible();
  await expect(owner.getByTestId("service-request-no-price")).toContainText(
    "Fiyat teklifle bildirilir",
  );
  await expect(owner.getByTestId("service-request-totals")).toHaveCount(0);
  await owner.locator('select[name="window"]').selectOption("within_2_weeks");
  await owner.locator('textarea[name="note"]').fill("Damla hattı 3. sırada.");
  await owner.locator('input[name="pre_information"]').check();
  await owner.locator('input[name="terms"]').check();
  await owner.locator('input[name="early_performance"]').check();
  await owner.getByRole("button", { name: "Talebi gönder" }).click();
  await owner.waitForURL(/\/portal\/hizmetler\/[0-9a-f-]{36}/);
  const requestId = /\/portal\/hizmetler\/([0-9a-f-]{36})/.exec(owner.url())![1];

  const { data: request } = await admin
    .from("service_request")
    .select("number, status, early_performance_requested, estimate_total_kurus, price_list_version")
    .eq("id", requestId)
    .single();
  expect(request).toMatchObject({
    status: "requested",
    early_performance_requested: true,
    // No published mowing price: nothing is frozen.
    estimate_total_kurus: null,
    price_list_version: null,
  });

  await owner.goto("/portal/hizmetler");
  await expect(owner.getByText(request!.number)).toBeVisible();

  // 2. Ops: confirm, upload proof, close the job.
  const opsContext = await browser.newContext();
  const ops = await opsContext.newPage();
  await login(ops, "ops@example.com", "/operasyon/hizmet");
  await ops.getByRole("link", { name: request!.number }).click();
  await ops.waitForURL(`**/operasyon/hizmet/${requestId}**`);

  const today = istanbulToday();
  await ops.locator('input[name="scheduled_date"]').fill(today);
  // The amount is entered by hand (required: no published price).
  await expect(ops.getByTestId("service-no-estimate")).toBeVisible();
  await ops.locator('input[name="quote_total"]').fill("3.000");
  await ops.getByRole("button", { name: "Tutarı ve günü onayla" }).click();
  await expect(ops.getByText("Tutar ve gün onaylandı; sahibe bildirildi.")).toBeVisible();

  for (const [phase, n] of [
    ["before", 1],
    ["after", 2],
  ] as const) {
    await ops
      .locator('input[type="file"][name="file"]')
      .setInputFiles({ name: `${phase}.jpg`, mimeType: "image/jpeg", buffer: photo(n) });
    await ops.locator('select[name="phase"]').selectOption(phase);
    await ops.getByRole("button", { name: "Fotoğrafı yükle" }).click();
    await expect(ops.getByText(phase === "before" ? /Öncesi: 1/ : /sonrası: 1/)).toBeVisible();
  }

  await ops.locator('input[name="done_on"]').fill(today);
  await ops.getByRole("button", { name: "İşi tamamlandı olarak kapat" }).click();
  await expect(ops.getByText("İş kapatıldı; sahibe bildirildi.")).toBeVisible();

  const { data: done } = await admin
    .from("service_request")
    .select("status, operation_id, quote_total_kurus")
    .eq("id", requestId)
    .single();
  expect(done).toMatchObject({ status: "done", quote_total_kurus: 300000 });
  expect(done!.operation_id).toBeTruthy();

  // 3. Owner: done, with the before and after photos.
  await owner.goto(`/portal/hizmetler/${requestId}`);
  await expect(owner.getByText("Tamamlandı").first()).toBeVisible();
  const proof = owner.locator('img[src*="token="]');
  await expect(proof).toHaveCount(2);
  await expect(proof.first()).toBeVisible();

  await ownerContext.close();
  await opsContext.close();
});
