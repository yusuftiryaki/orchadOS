import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SERVICE_TERMS_VERSION } from "@/lib/legal/versions";
import type { Client } from "@/lib/supabase/types";
import { purgeOrg } from "../local-db";
import { addDays, istanbulToday } from "./billing-fixture";
import { serviceClient, signIn } from "./fixtures";

// Service prices in the versioned price list (IP15, owner decision of
// 2 November 2026): the price is not decided, so a service may be unpriced.
// Against the local stack, in an org of its own (published price lists cannot
// be removed otherwise; testing.purge_org drops the org with its lists,
// requests, sessions and audit rows) where the seed ops user is ops and the
// seed owner owns one parcel:
// - unpriced (no list, or a published list without the service): the portal
//   offer has no estimate and no version, a request freezes none, and ops
//   must enter the amount when scheduling (action and function);
// - a draft list prices nothing; the published list in force does, with its
//   version, and a newer version replaces it from its valid_from;
// - a request keeps its price list version and amounts after a new version is
//   published (quote freezing), and ops may not confirm above it (H37);
// - the price list editor reads and writes the service prices of a draft; a
//   copy of a list takes them along.

const state = vi.hoisted(() => ({
  client: null as unknown,
  user: { id: "", email: null, roles: {}, demo: false },
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => state.client }));
vi.mock("@/lib/auth/session", () => ({ requireSection: async () => state.user }));

const actions = await import("@/app/operasyon/hizmet/actions");
const opsData = await import("@/lib/operations/service-data");
const bo = await import("@/lib/back-office/data");
const mutations = await import("@/lib/back-office/mutations");
const { parsePriceListServiceItems } = await import("@/lib/back-office/validation");
const { listServiceOffers, listServiceRequests } = await import("@/lib/services/data");
const { offerEstimate, offerCard } = await import("@/lib/services/offers");
const { opsServicesText: S } = await import("@/lib/i18n/messages/ops-services");

const id = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG = id("f9610000", 1);
const PARCEL = id("f9620000", 1);
const TYPE = id("f9630000", 1);
const PACKAGE = id("f9640000", 1);

let admin: Client;
let ops: { client: Client; userId: string };
let owner: { client: Client; userId: string };
const today = istanbulToday();

function check<T extends { error?: unknown }>(result: T, what: string): T {
  if (result.error) throw new Error(`${what}: ${JSON.stringify(result.error)}`);
  return result;
}

async function run(
  action: (prev: { error: string | null }, form: FormData) => Promise<{ error: string | null }>,
  values: Record<string, string>,
): Promise<string> {
  state.client = ops.client;
  state.user = { ...state.user, id: ops.userId };
  const form = new FormData();
  for (const [k, v] of Object.entries(values)) form.set(k, v);
  try {
    const result = await action({ error: null }, form);
    return `error ${result.error}`;
  } catch (error) {
    return (error as Error).message;
  }
}

// A published list (one package item, the given mowing price or none) valid
// from `validFrom`, through the ops functions as the price list editor calls
// them. Returns its id and version.
async function publishList(
  service: { unit: number; min: number } | null,
  validFrom = today,
): Promise<{ id: string; version: number }> {
  const { data: listId } = check(
    await ops.client.rpc("ops_create_price_list_draft", { p_org_id: ORG }),
    "draft",
  );
  check(
    await ops.client.rpc("ops_save_price_list_draft", {
      p_price_list_id: listId as string,
      p_valid_from: validFrom,
      p_vat_rate_bp: 2000,
      p_note: "Hizmet fiyat testi",
      p_items: [{ package_id: PACKAGE, unit_price_kurus: 20000, minimum_fee_kurus: 0 }],
    }),
    "save draft",
  );
  if (service) {
    check(
      (await mutations.savePriceListServiceItems(ops.client, listId as string, {
        items: [
          { service_type_id: TYPE, unit_price_kurus: service.unit, minimum_fee_kurus: service.min },
        ],
      })) as { error?: unknown },
      "service items",
    );
  }
  const { data: version } = check(
    await ops.client.rpc("ops_publish_price_list", { p_price_list_id: listId as string }),
    "publish",
  );
  return { id: listId as string, version: version as number };
}

const offer = async () =>
  (await listServiceOffers(owner.client, PARCEL)).find((o) => o.service_type_id === TYPE);

async function requestService(): Promise<string> {
  const { data } = check(
    await owner.client.rpc("customer_request_service", {
      p_parcel_id: PARCEL,
      p_service_type_id: TYPE,
      p_window: "flexible",
      p_note: "",
      p_terms_version: SERVICE_TERMS_VERSION,
      p_early_performance: true,
    }),
    "customer_request_service",
  );
  return data as string;
}

const requestRow = async (requestId: string) =>
  check(await admin.from("service_request").select("*").eq("id", requestId).single(), "row").data!;

const cancel = (requestId: string) =>
  ops.client.rpc("ops_cancel_service_request", { p_id: requestId, p_reason: "Test bitti" });

beforeAll(async () => {
  admin = serviceClient();
  await purgeOrg(ORG);
  [ops, owner] = await Promise.all([signIn("ops"), signIn("owner")]);
  check(await admin.from("org").insert({ id: ORG, name: "Hizmet fiyat testi" }), "org");
  check(
    await admin.from("membership").insert({ org_id: ORG, user_id: ops.userId, role: "ops" }),
    "membership",
  );
  check(
    await admin.from("org_billing_setting").insert({ org_id: ORG, services_enabled: true }),
    "billing setting",
  );
  check(
    await admin.from("service_package").insert({
      id: PACKAGE,
      org_id: ORG,
      code: "standart",
      name: "Standart",
      periodic_visits_per_year: 4,
    }),
    "package",
  );
  // In season all year, no species rows: the default window applies.
  check(
    await admin.from("service_type").insert({
      id: TYPE,
      org_id: ORG,
      code: "weed_mowing",
      name: "Yabani ot biçme",
      operation_kind: "mowing",
      season_start_month: 1,
      season_start_day: 1,
      season_end_month: 12,
      season_end_day: 31,
      recommend_from_weed_height: "medium",
    }),
    "service_type",
  );
  // 20 dönüm declared: 200 tenths.
  check(
    await admin.from("parcel").insert({
      id: PARCEL,
      org_id: ORG,
      name: "Fiyat Test Bahçesi",
      estimated_area_m2: 20000,
      status: "active_monitoring",
    }),
    "parcel",
  );
  check(
    await admin
      .from("parcel_access")
      .insert({ org_id: ORG, parcel_id: PARCEL, user_id: owner.userId, role: "owner" }),
    "parcel_access",
  );
}, 60_000);

afterAll(async () => {
  await purgeOrg(ORG);
}, 60_000);

describe("service prices from the versioned price list", () => {
  let unpriced = "";
  let frozen = "";
  let v2 = { id: "", version: 0 };

  it("without a published list the service is unpriced: no estimate, no version", async () => {
    const o = (await offer())!;
    expect(o).toMatchObject({
      state: "available",
      price_list_version: null,
      price_per_donum_kurus: null,
      estimate_total_kurus: null,
    });
    expect(offerEstimate(o)).toBeNull();
    expect(offerCard(o, today)?.price).toMatchObject({ text: "Fiyat teklifle bildirilir" });
    const pricing = await opsData.currentServicePricing(ops.client, ORG, today);
    expect(pricing).toMatchObject({ list: null });
    expect(pricing.prices.size).toBe(0);
  });

  it("a published list without a service price leaves it unpriced; a draft prices nothing", async () => {
    const v1 = await publishList(null);
    expect(v1.version).toBe(1);
    // A draft with a price is ignored until it is published.
    const { data: draft } = check(
      await ops.client.rpc("ops_create_price_list_draft", { p_org_id: ORG, p_copy_from_id: v1.id }),
      "draft",
    );
    check(
      (await mutations.savePriceListServiceItems(ops.client, draft as string, {
        items: [{ service_type_id: TYPE, unit_price_kurus: 37500, minimum_fee_kurus: 250000 }],
      })) as { error?: unknown },
      "draft service items",
    );
    expect((await offer())?.estimate_total_kurus).toBeNull();
    const pricing = await opsData.currentServicePricing(ops.client, ORG, today);
    expect(pricing.list?.version).toBe(1);
    expect(pricing.prices.has(TYPE)).toBe(false);
    check(
      await ops.client.rpc("ops_delete_price_list_draft", { p_price_list_id: draft as string }),
      "delete draft",
    );
  });

  it("an unpriced request: no amount frozen; ops must enter it, then may schedule", async () => {
    unpriced = await requestService();
    expect(await requestRow(unpriced)).toMatchObject({
      status: "requested",
      price_list_id: null,
      price_list_version: null,
      estimate_total_kurus: null,
      quote_total_kurus: null,
    });
    const [listed] = (await listServiceRequests(owner.client)).filter((r) => r.id === unpriced);
    expect(listed).toMatchObject({ price_list_version: null, estimate_total_kurus: null });
    const queue = (await opsData.listServiceRequests(ops.client)).find((r) => r.id === unpriced);
    expect(queue).toMatchObject({ price_list_version: null, estimate_total_kurus: null });

    // The form asks for the amount; the function refuses without one.
    expect(
      await run(actions.scheduleServiceAction, {
        request_id: unpriced,
        scheduled_date: addDays(today, 2),
      }),
    ).toBe(`error ${S.errors.invalid_input} ${S.fieldError(S.fields.quote_total)}`);
    const bare = await ops.client.rpc("ops_schedule_service_request", {
      p_id: unpriced,
      p_scheduled_date: addDays(today, 2),
      p_quote_total_kurus: null as unknown as number,
      p_note: null as unknown as string,
    });
    expect(bare.error).toMatchObject({ message: "invalid_input", details: "quote_total" });

    // Any amount (no frozen estimate to cap it), entered by hand.
    expect(
      await run(actions.scheduleServiceAction, {
        request_id: unpriced,
        scheduled_date: addDays(today, 2),
        quote_total: "12.345",
      }),
    ).toBe(`redirect /operasyon/hizmet/${unpriced}?bilgi=scheduled`);
    expect(await requestRow(unpriced)).toMatchObject({
      status: "scheduled",
      quote_total_kurus: 1234500,
      estimate_total_kurus: null,
    });
    // A new day keeps it.
    expect(
      await run(actions.scheduleServiceAction, {
        request_id: unpriced,
        scheduled_date: addDays(today, 3),
      }),
    ).toBe(`redirect /operasyon/hizmet/${unpriced}?bilgi=rescheduled`);
    expect((await requestRow(unpriced)).quote_total_kurus).toBe(1234500);
    check(await cancel(unpriced), "cancel");
  });

  it("the published list in force prices the service with its version", async () => {
    v2 = await publishList({ unit: 37500, min: 250000 });
    expect(v2.version).toBe(2);
    const o = (await offer())!;
    expect(o).toMatchObject({
      price_list_version: 2,
      price_per_donum_kurus: 37500,
      minimum_fee_kurus: 250000,
      vat_rate_bp: 2000,
      // 200 tenths x 375 TL / 10 = 7.500 TL + 20 % VAT.
      estimate_subtotal_kurus: 750000,
      estimate_vat_kurus: 150000,
      estimate_total_kurus: 900000,
    });
    expect(offerCard(o, today)?.price).toEqual({
      text: "9.000 TL, KDV dahil",
      note: "Fiyat listesi sürüm 2",
      priced: true,
    });
    const pricing = await opsData.currentServicePricing(ops.client, ORG, today);
    expect(pricing.prices.get(TYPE)).toMatchObject({
      version: 2,
      unitPriceKurus: 37500,
      minimumFeeKurus: 250000,
      vatRateBp: 2000,
    });
  });

  it("a request freezes the version and amounts; a new version does not change it", async () => {
    frozen = await requestService();
    const before = await requestRow(frozen);
    expect(before).toMatchObject({
      price_list_id: v2.id,
      price_list_version: 2,
      price_per_donum_kurus: 37500,
      minimum_fee_kurus: 250000,
      vat_rate_bp: 2000,
      estimate_total_kurus: 900000,
    });

    // Version 3, valid today, prices higher: new offers use it.
    const v3 = await publishList({ unit: 40000, min: 300000 });
    expect(v3.version).toBe(3);
    expect(await offer()).toMatchObject({ state: "open", price_list_version: 3 });
    expect(await requestRow(frozen)).toMatchObject({
      price_list_id: v2.id,
      price_list_version: 2,
      price_per_donum_kurus: 37500,
      estimate_subtotal_kurus: 750000,
      estimate_vat_kurus: 150000,
      estimate_total_kurus: 900000,
    });
    const queue = (await opsData.listServiceRequests(ops.client)).find((r) => r.id === frozen);
    expect(queue).toMatchObject({ price_list_version: 2, estimate_total_kurus: 900000 });

    // H37: never above the frozen estimate; empty confirms it.
    expect(
      await run(actions.scheduleServiceAction, {
        request_id: frozen,
        scheduled_date: addDays(today, 2),
        quote_total: "9.000,01",
      }),
    ).toBe(`error ${S.errors.quote_above_estimate}`);
    expect(
      await run(actions.scheduleServiceAction, {
        request_id: frozen,
        scheduled_date: addDays(today, 2),
      }),
    ).toBe(`redirect /operasyon/hizmet/${frozen}?bilgi=scheduled`);
    expect((await requestRow(frozen)).quote_total_kurus).toBe(900000);
    check(await cancel(frozen), "cancel");
  });

  it("a newer version with a later valid_from applies only from that day", async () => {
    const v4 = await publishList({ unit: 50000, min: 300000 }, addDays(today, 30));
    expect(v4.version).toBe(4);
    expect((await opsData.currentServicePricing(ops.client, ORG, today)).list?.version).toBe(3);
    expect(
      (await opsData.currentServicePricing(ops.client, ORG, addDays(today, 30))).prices.get(TYPE),
    ).toMatchObject({ version: 4, unitPriceKurus: 50000 });
    expect((await offer())?.price_list_version).toBe(3);
  });

  it("the price list editor reads and writes a draft's service prices; a copy takes them", async () => {
    const view = await bo.getPriceList(ops.client, v2.id);
    expect(view?.serviceTypes.map((t) => t.id)).toEqual([TYPE]);
    expect(view?.serviceItems).toEqual([
      { service_type_id: TYPE, unit_price_kurus: 37500, minimum_fee_kurus: 250000 },
    ]);
    // Published: read only.
    const refused = await mutations.savePriceListServiceItems(ops.client, v2.id, { items: [] });
    expect(refused).toMatchObject({ ok: false, error: "price_list_not_draft" });

    const { data: copy } = check(
      await ops.client.rpc("ops_create_price_list_draft", { p_org_id: ORG, p_copy_from_id: v2.id }),
      "copy",
    );
    expect((await bo.getPriceList(ops.client, copy as string))?.serviceItems).toEqual([
      { service_type_id: TYPE, unit_price_kurus: 37500, minimum_fee_kurus: 250000 },
    ]);
    // The form: TL excluding VAT; an empty price leaves the service unpriced.
    const read = (values: Record<string, string>) => (name: string) => values[name] ?? "";
    const parsed = parsePriceListServiceItems(
      read({ [`svc_unit_${TYPE}`]: "412,50", [`svc_min_${TYPE}`]: "2.600" }),
      [TYPE],
    );
    expect(parsed).toEqual({
      ok: true,
      value: {
        items: [{ service_type_id: TYPE, unit_price_kurus: 41250, minimum_fee_kurus: 260000 }],
      },
    });
    expect(parsePriceListServiceItems(read({ [`svc_min_${TYPE}`]: "100" }), [TYPE])).toEqual({
      ok: false,
      field: `svc_unit_${TYPE}`,
    });
    if (!parsed.ok) throw new Error("parse");
    expect(
      await mutations.savePriceListServiceItems(ops.client, copy as string, parsed.value),
    ).toMatchObject({
      ok: true,
    });
    expect((await bo.getPriceList(ops.client, copy as string))?.serviceItems).toEqual([
      { service_type_id: TYPE, unit_price_kurus: 41250, minimum_fee_kurus: 260000 },
    ]);
    const empty = parsePriceListServiceItems(read({}), [TYPE]);
    expect(empty).toEqual({ ok: true, value: { items: [] } });
    if (!empty.ok) throw new Error("parse");
    await mutations.savePriceListServiceItems(ops.client, copy as string, empty.value);
    expect((await bo.getPriceList(ops.client, copy as string))?.serviceItems).toEqual([]);

    // The owner reads no service price rows (ops only); only the offer's amount.
    expect((await owner.client.from("price_list_service_item").select("id")).data).toEqual([]);
  });
});
