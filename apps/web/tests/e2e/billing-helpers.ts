import { createClient } from "@supabase/supabase-js";
import { expect, type Locator, type Page } from "@playwright/test";
import type { Database } from "../../src/lib/database.types";
import { purgeBillingUsers, purgeParcels } from "../local-db";
import { resolveSupabaseEnv } from "../local-supabase";

// Shared steps of the customer journey browser tests (IP12-D): service-role
// access to the local stack, the SMS code from the outbox, ops actions
// through the API, map clicks, and cleanup.

export const PASSWORD = "orchados-dev";
export const SEED_ORG = "b0000000-0000-4000-8000-000000000001";
export const STANDART = "91200000-0000-4000-8000-000000000001";
export const E2E_DOMAIN = "customer-journey.example.test";

const env = resolveSupabaseEnv();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin = createClient<Database>(env.url, env.serviceRoleKey, options);

export function anon() {
  return createClient<Database>(env.url, env.anonKey, options);
}

function check<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}

// A unique Turkish mobile number: E.164 and the way a person types it.
export function uniquePhone(): { e164: string; typed: string } {
  const digits = String(Math.floor(1_000_000 + Math.random() * 8_999_999));
  return {
    e164: `+90553${digits}`,
    typed: `0553 ${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`,
  };
}

// The latest SMS code sent to a phone (the local SMS hook writes the outbox).
export async function waitForCode(phone: string, after: Date): Promise<string> {
  let code: string | null = null;
  await expect
    .poll(
      async () => {
        const { data, error } = await admin.rpc("message_outbox_list", {
          p_recipient: phone,
          p_limit: 1,
        });
        if (error) throw error;
        const row = data?.[0];
        if (!row || new Date(row.created_at) < after) return null;
        code = /\b(\d{6})\b/.exec(row.body)?.[1] ?? null;
        return code;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  return code!;
}

export async function userIdByEmail(email: string): Promise<string> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email === email);
    if (user) return user.id;
    if (data.users.length < 1000) throw new Error("user not found");
  }
}

// Ops verifies every garden of a submitted application and issues the quote.
export async function opsQuote(applicationId: string): Promise<string> {
  const ops = anon();
  const signedIn = await ops.auth.signInWithPassword({
    email: "ops@example.com",
    password: PASSWORD,
  });
  if (signedIn.error) throw signedIn.error;
  const gardens = check(
    await admin
      .from("application_garden")
      .select("id, declared_area_m2")
      .eq("application_id", applicationId),
  );
  for (const g of gardens) {
    check(
      await ops.rpc("ops_verify_application_garden", {
        p_garden_id: g.id,
        p_verified_area_m2: Number(g.declared_area_m2),
      }),
    );
  }
  return check(
    await ops.rpc("ops_issue_quote", {
      p_application_id: applicationId,
      p_note_to_customer: "Ziyaretler mart ayında başlar.",
    }),
  );
}

// A second application of a customer, made through the API (the browser
// covered the forms once), quoted by ops.
export async function quotedApplication(email: string, password: string): Promise<string> {
  const customer = anon();
  const signedIn = await customer.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const application = check(
    await customer.rpc("customer_create_application", { p_package_id: STANDART }),
  );
  check(
    await customer.rpc("customer_save_application_garden", {
      p_application_id: application,
      p_garden: {
        name: "İkinci bahçe",
        declared_area_m2: 15000,
        lon: 37.81,
        lat: 37.02,
      },
      p_detail: { entry_permission: true, authorization_basis: "title_holder" },
    }),
  );
  check(await customer.rpc("customer_submit_application", { p_application_id: application }));
  return opsQuote(application);
}

// --- IP14 (docs/bahce-yonetimi.md §9.12): garden membership helpers for the
// portal (C) and back office (D) browser tests. Each one works through the
// API like a person would; nothing is written to the tables directly.

const CONSENTS = { distance_sales: "mesafeli-v5-taslak", pre_information: "onbilgi-v5-taslak" };

// "Today" of the database functions (Istanbul), YYYY-MM-DD.
export const istanbulToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

async function signedIn(email: string, password: string) {
  const client = anon();
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error) throw result.error;
  return { client, userId: result.data.user.id };
}

const opsClient = () => signedIn("ops@example.com", PASSWORD).then((s) => s.client);

// Makes a customer an active member: a new application with one garden
// (15 dönüm), quoted by ops, accepted and paid by a bank transfer recorded
// by ops; the order serves one year from today. The account needs an owner
// profile with the KVKK notice and a billing profile, as customer@example.com
// has (or a customer who finished the sign-up and the billing step).
// Returns the customer's id, the order and the parcels of its lines.
export async function activeMember(
  email: string,
  password = PASSWORD,
): Promise<{ userId: string; orderId: string; parcelIds: string[] }> {
  const { client, userId } = await signedIn(email, password);
  const application = check(
    await client.rpc("customer_create_application", { p_package_id: STANDART }),
  );
  check(
    await client.rpc("customer_save_application_garden", {
      p_application_id: application,
      p_garden: {
        name: `Üye bahçesi ${Math.floor(Math.random() * 1000)}`,
        declared_area_m2: 15000,
        lon: 37.83 + Math.random() * 0.02,
        lat: 37.03,
      },
      p_detail: { entry_permission: true, authorization_basis: "title_holder" },
    }),
  );
  check(await client.rpc("customer_submit_application", { p_application_id: application }));
  const quote = await opsQuote(application);
  const orderId = check(
    await client.rpc("customer_accept_quote", { p_quote_id: quote, p_consents: CONSENTS }),
  );
  const ops = await opsClient();
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
  const parcelIds = check(
    await admin
      .from("service_order_item")
      .select("parcel_id")
      .eq("order_id", orderId)
      .order("line_no"),
  ).map((r) => r.parcel_id as string);
  return { userId, orderId, parcelIds };
}

// Ops verifies every garden of a submitted application (declared areas) and
// issues an add-on quote joining the base order. Returns the quote id.
export async function opsAddonQuote(applicationId: string, baseOrderId: string): Promise<string> {
  const ops = await opsClient();
  const gardens = check(
    await admin
      .from("application_garden")
      .select("id, declared_area_m2, verified_at, withdrawn_at")
      .eq("application_id", applicationId),
  );
  for (const g of gardens) {
    if (g.verified_at || g.withdrawn_at) continue;
    check(
      await ops.rpc("ops_verify_application_garden", {
        p_garden_id: g.id,
        p_verified_area_m2: Number(g.declared_area_m2),
      }),
    );
  }
  return check(
    await ops.rpc("ops_issue_addon_quote", {
      p_base_order_id: baseOrderId,
      p_application_id: applicationId,
    }),
  );
}

// The customer asks to remove a garden (reason not_needed; in 30 days by
// default, or at the period end, or as a withdrawal today). With complete,
// ops moves the day to today when needed and completes it at once (parcel
// passive, refund rows, read-only window). Returns the removal id.
export async function removalFor(
  email: string,
  password: string,
  parcelId: string,
  opts: { atPeriodEnd?: boolean; withdrawal?: boolean; complete?: boolean; byOps?: boolean } = {},
): Promise<string> {
  const { client, userId } = await signedIn(email, password);
  const removalId = opts.byOps
    ? await opsRemoval(userId, parcelId)
    : check(
        await client.rpc("customer_request_garden_removal", {
          p_parcel_id: parcelId,
          p_reason: "not_needed",
          p_timing: opts.withdrawal ? "withdrawal" : opts.atPeriodEnd ? "period_end" : "notice",
        }),
      );
  if (opts.complete) {
    const ops = await opsClient();
    const today = istanbulToday();
    const removal = check(
      await admin
        .from("garden_removal")
        .select("requested_effective_on")
        .eq("id", removalId)
        .single(),
    );
    check(
      await ops.rpc("ops_schedule_garden_removal", {
        p_removal_id: removalId,
        p_effective_on: today,
        p_note: removal.requested_effective_on === today ? undefined : "E2E: bugün tamamlanır",
      }),
    );
    check(await ops.rpc("ops_complete_garden_removal", { p_removal_id: removalId }));
  }
  return removalId;
}

// A removal ops opens on the customer's line of the parcel (a transfer in
// 5 days, access 0; initiated_by 'ops'). Returns its id.
async function opsRemoval(userId: string, parcelId: string): Promise<string> {
  const ops = await opsClient();
  const item = check(
    await admin
      .from("service_order_item")
      .select("id, service_order!inner(customer_user_id, status)")
      .eq("parcel_id", parcelId)
      .eq("service_order.customer_user_id", userId)
      .eq("service_order.status", "active")
      .is("removed_on", null)
      .limit(1)
      .single(),
  );
  const day = new Date(`${istanbulToday()}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 5);
  return check(
    await ops.rpc("ops_request_garden_removal", {
      p_order_item_id: item.id,
      p_reason: "transfer",
      p_effective_on: day.toISOString().slice(0, 10),
      p_note: "E2E: devir",
      // An earlier day than the 30-day notice: by agreement (contract 12/3).
      p_owner_consent_note: "E2E: Sahip yazılı onay verdi",
      p_access_days: 0,
    }),
  );
}

// Clicks the map at each [lon, lat], projected through the map instance
// (as in operations-registration.spec.ts).
export async function clickOnMap(map: Locator, points: [number, number][]) {
  await expect(map).toHaveAttribute("data-map-ready", "true");
  const pixels = await map.evaluate(async (el, pts) => {
    const m = (el as HTMLElement & { __map: import("maplibre-gl").Map }).__map;
    const lons = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    m.fitBounds(
      [
        [Math.min(...lons) - 0.001, Math.min(...lats) - 0.001],
        [Math.max(...lons) + 0.001, Math.max(...lats) + 0.001],
      ],
      { padding: 80, animate: false },
    );
    // Not "idle": that waits for basemap tiles, which may be unreachable in CI.
    await new Promise((resolve) => m.once("render", resolve));
    return pts.map((p) => m.project(p));
  }, points);
  for (const p of pixels) {
    await map.click({ position: { x: p.x, y: p.y } });
  }
}

export async function login(page: Page, email: string, next: string, password = PASSWORD) {
  await page.goto(`/giris?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname === next);
}

// Removes the test customers of a domain: billing rows, their parcels, the
// accounts.
export async function removeJourneyUsers(domain = E2E_DOMAIN) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const ids = data.users.filter((u) => u.email?.endsWith(`@${domain}`)).map((u) => u.id);
  if (ids.length === 0) return;
  // Owned parcels, and those of order lines (a removed garden has no owner row left).
  const owned = check(
    await admin.from("parcel_access").select("parcel_id").in("user_id", ids).eq("role", "owner"),
  ).map((r) => r.parcel_id);
  const ordered = check(
    await admin.from("service_order_item").select("parcel_id").in("customer_user_id", ids),
  ).flatMap((r) => (r.parcel_id ? [r.parcel_id] : []));
  const parcels = [...new Set([...owned, ...ordered])];
  await purgeBillingUsers(ids);
  if (parcels.length) await purgeParcels(parcels);
  for (const id of ids) {
    const deleted = await admin.auth.admin.deleteUser(id);
    if (deleted.error) throw deleted.error;
  }
}
