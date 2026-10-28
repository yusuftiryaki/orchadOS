import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import type { Client } from "@/lib/supabase/types";
import {
  activeOrderFor,
  check,
  createCustomer,
  istanbulToday,
  removeCustomers,
  type TestCustomer,
} from "./billing-fixture";
import { PASSWORD, serviceClient } from "./fixtures";

// The portal's membership and garden reads and the removal actions (IP14-C,
// docs/bahce-yonetimi.md §5.1, §11) against the local stack: the loaders of
// lib/portal-billing/data.ts as a member, a member with two periods, a
// co-owner and a user without a customer profile (as a demo visitor), and
// the parcel page's request and undo actions for each timing.

// The server actions run as the signed-in customer: the session and the
// client are this test's; a redirect is thrown as its address.
const state = vi.hoisted(() => ({
  client: null as unknown,
  user: { id: "", email: null, roles: { customer: true }, demo: false },
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

const data = await import("@/lib/portal-billing/data");
const actions = await import("@/app/portal/parsel/[parcelId]/actions");

const DOMAIN = "customer-gardens-test.example.test";

let admin: Client;

beforeAll(async () => {
  admin = serviceClient();
  await removeCustomers(DOMAIN);
});

afterAll(() => removeCustomers(DOMAIN));

function actAs(customer: TestCustomer) {
  state.client = customer.client;
  state.user = { ...state.user, id: customer.id };
}

async function run(action: (form: FormData) => Promise<unknown>, values: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(values)) form.set(k, v);
  try {
    await action(form);
    return "no redirect";
  } catch (error) {
    return (error as Error).message;
  }
}

describe("member reads", () => {
  let customer: TestCustomer;
  let parcel: string;

  beforeAll(async () => {
    customer = await createCustomer(DOMAIN);
    ({
      parcels: [parcel],
    } = await activeOrderFor(customer));
  });

  it("returns the period and the garden of an active order", async () => {
    const { periods, primary } = await data.getServicePeriods(customer.client);
    expect(periods).toHaveLength(1);
    expect(primary).toMatchObject({
      package_name: "Standart",
      garden_count: 1,
      garden_changes_enabled: true,
      is_primary: true,
      period_count: 1,
      period_start: istanbulToday(),
    });

    const gardens = await data.listMyGardens(customer.client);
    expect(gardens).toHaveLength(1);
    expect(gardens[0]).toMatchObject({ parcel_id: parcel, state: "in_service", is_addon: false });
    expect(gardens[0].withdrawal_until >= istanbulToday()).toBe(true);

    expect(await data.getParcelServiceStatus(customer.client, parcel)).toMatchObject({
      status: "in_service",
    });
    const summary = await data.getCustomerSummary(customer.client, customer.id);
    expect(summary.servicePeriod?.base_order_id).toBe(primary?.base_order_id);
    expect(summary.gardens).toHaveLength(1);
  });

  it("knows the parcels that were on an order, and no pending order without one", async () => {
    // An owned parcel on an order is never a pilot parcel on the account page.
    expect(await data.listOrderedParcelIds(customer.client, customer.id)).toEqual([parcel]);
    expect(await data.pendingOrderOfParcel(customer.client, customer.id, parcel)).toBeNull();
  });

  it("previews the three timings with their own days", async () => {
    const preview = await data.previewGardenRemoval(customer.client, parcel, [
      "notice",
      "period_end",
      "withdrawal",
    ]);
    if (!preview.ok) throw new Error(preview.error);
    const [notice, periodEnd, withdrawal] = preview.options;
    expect(withdrawal.effectiveOn).toBe(istanbulToday());
    expect(notice.effectiveOn > withdrawal.effectiveOn).toBe(true);
    expect(periodEnd.effectiveOn > notice.effectiveOn).toBe(true);
    // Nothing was done yet: a withdrawal returns the whole line at most.
    expect(withdrawal.refundEstimateKurus).toBeGreaterThan(0);
    for (const o of preview.options) expect(o.accessUntil > o.effectiveOn).toBe(true);
  });

  it.each([["notice"], ["period_end"], ["withdrawal"]])(
    "requests a removal (%s) and undoes it",
    async (timing) => {
      actAs(customer);
      const preview = await data.previewGardenRemoval(customer.client, parcel, [
        timing as "notice",
      ]);
      if (!preview.ok) throw new Error(preview.error);

      const asked = await run(actions.requestGardenRemovalAction, {
        parcel_id: parcel,
        reason: "not_needed",
        note: "Test notu",
        timing,
        withdrawal_open: "1",
        confirm: "on",
      });
      expect(asked).toBe(`redirect /portal/parsel/${parcel}?bilgi=cikarma_istendi`);
      const [leaving] = await data.listMyGardens(customer.client);
      expect(leaving).toMatchObject({
        state: "leaving",
        removal_status: "requested",
        removal_effective_on: preview.options[0].effectiveOn,
      });
      expect(await data.getParcelServiceStatus(customer.client, parcel)).toMatchObject({
        status: "leaving",
      });

      // A second request while one is open.
      const again = await run(actions.requestGardenRemovalAction, {
        parcel_id: parcel,
        reason: "sold",
        timing: "notice",
        confirm: "on",
      });
      expect(again).toBe(`redirect /portal/parsel/${parcel}?hata=garden_removal_open`);

      const undone = await run(actions.cancelGardenRemovalAction, {
        parcel_id: parcel,
        removal_id: leaving.removal_id,
      });
      expect(undone).toBe(`redirect /portal/parsel/${parcel}?bilgi=cikarma_geri_alindi`);
      const [back] = await data.listMyGardens(customer.client);
      expect(back).toMatchObject({ state: "in_service", removal_status: "cancelled" });

      const twice = await run(actions.cancelGardenRemovalAction, {
        parcel_id: parcel,
        removal_id: leaving.removal_id,
      });
      expect(twice).toBe(`redirect /portal/parsel/${parcel}?hata=removal_not_open`);
    },
  );

  it("refuses a form without the confirmation before any call", async () => {
    actAs(customer);
    const result = await run(actions.requestGardenRemovalAction, {
      parcel_id: parcel,
      reason: "sold",
      timing: "notice",
    });
    expect(result).toBe(`redirect /portal/parsel/${parcel}?hata=consent_required`);
    const [garden] = await data.listMyGardens(customer.client);
    expect(garden.state).toBe("in_service");
  });

  it("gives a co-owner the status but no card data", async () => {
    const viewer = await createCustomer(DOMAIN);
    const { org_id } = check(await admin.from("parcel").select("org_id").eq("id", parcel).single());
    check(
      await admin
        .from("parcel_access")
        .insert({ parcel_id: parcel, user_id: viewer.id, role: "viewer", org_id }),
    );
    expect(await data.getParcelServiceStatus(viewer.client, parcel)).toMatchObject({
      status: "in_service",
    });
    expect(await data.listMyGardens(viewer.client)).toEqual([]);
    expect((await data.getServicePeriods(viewer.client)).primary).toBeNull();
    const preview = await data.previewGardenRemoval(viewer.client, parcel, ["notice"]);
    expect(preview.ok).toBe(false);

    actAs(viewer);
    const asked = await run(actions.requestGardenRemovalAction, {
      parcel_id: parcel,
      reason: "sold",
      timing: "notice",
      confirm: "on",
    });
    expect(asked).toMatch(new RegExp(`^redirect /portal/parsel/${parcel}\\?hata=`));
    expect(asked).not.toContain("bilgi=");
  });
});

describe("a member with two periods", () => {
  it("has one row per period and exactly one primary", async () => {
    const customer = await createCustomer(DOMAIN);
    await activeOrderFor(customer, [20000]);
    await activeOrderFor(customer, [16000]);
    const { periods, primary } = await data.getServicePeriods(customer.client);
    expect(periods).toHaveLength(2);
    expect(periods.filter((p) => p.is_primary)).toHaveLength(1);
    expect(periods.every((p) => p.period_count === 2)).toBe(true);
    expect(primary).not.toBeNull();
    expect(await data.listMyGardens(customer.client)).toHaveLength(2);
  });
});

describe("a user without a customer profile (as a demo visitor)", () => {
  it("gets empty results", async () => {
    const email = `profilsiz-${Date.now()}@${DOMAIN}`;
    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    const env = inject("supabase");
    const client = createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as Client;
    const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (signedIn.error) throw signedIn.error;
    expect(await data.getServicePeriods(client)).toEqual({ periods: [], primary: null });
    expect(await data.listMyGardens(client)).toEqual([]);
    expect(
      await data.getParcelServiceStatus(client, "00000000-0000-4000-8000-000000000001"),
    ).toBeNull();
  });
});

beforeEach(() => {
  state.client = null;
});
