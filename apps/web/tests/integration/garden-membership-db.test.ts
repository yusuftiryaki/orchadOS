import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@/lib/supabase/types";
import { runGardenRemovalHousekeeping } from "../local-db";
import {
  CONSENTS,
  activeOrderFor,
  addonOrderFor,
  check,
  createCustomer,
  istanbulToday,
  removeCustomers,
  type TestCustomer,
} from "./billing-fixture";
import { BILLING_SEED, SEED, serviceClient, signIn } from "./fixtures";

// Adding and removing gardens during a membership (IP14,
// docs/bahce-yonetimi.md §4–§5, §13 "Eşzamanlılık") through PostgREST, as the
// customer and as ops@: a member adds a garden that ends with the period,
// removes one (refund row, read-only window, end of access); then the races
// the locks settle: ops and the housekeeping completing the same removal, two
// acceptances holding one parcel, two removal requests, and a removal request
// against an unpaid renewal.

const DOMAIN = "garden-membership-test.example.test";

let admin: Client;
let ops: Client;

beforeAll(async () => {
  admin = serviceClient();
  await removeCustomers(DOMAIN);
  ops = (await signIn("ops")).client;
});

afterAll(() => removeCustomers(DOMAIN));

// A pilot parcel of the customer: owned, on no order (its earlier order ended).
async function idleParcel(customer: TestCustomer): Promise<string> {
  const { order, parcels } = await activeOrderFor(customer, [18000]);
  check(await ops.rpc("ops_terminate_order", { p_order_id: order, p_note: "test: dönem kapandı" }));
  return parcels[0];
}

const errorOf = (result: { error: { message?: string } | null }) => result.error?.message ?? null;

describe("membership: an add-on garden and a removal", () => {
  let customer: TestCustomer;
  let base: string;
  let addon: string;
  let addonParcel: string;
  let removal: string;

  it("the add-on ends with the base order and joins the period", async () => {
    customer = await createCustomer(DOMAIN);
    ({ order: base } = await activeOrderFor(customer));
    const added = await addonOrderFor(customer, base);
    addon = added.order;
    addonParcel = added.parcels[0];
    const orders = check(
      await customer.client
        .from("service_order")
        .select("id, status, service_start, service_end, addon_of_order_id")
        .in("id", [base, addon]),
    );
    const byId = Object.fromEntries(orders.map((o) => [o.id, o]));
    expect(byId[addon]).toMatchObject({
      status: "active",
      service_start: istanbulToday(),
      service_end: byId[base].service_end,
      addon_of_order_id: base,
    });
    const period = check(await customer.client.rpc("my_service_period"));
    expect(period).toHaveLength(1);
    expect(period[0]).toMatchObject({ base_order_id: base, garden_count: 2, is_primary: true });
    const gardens = check(await customer.client.rpc("my_gardens"));
    expect(gardens.map((g) => g.state).sort()).toEqual(["in_service", "in_service"]);
  });

  it("removing the add-on garden: refund row, read-only window, end of access", async () => {
    removal = check(
      await customer.client.rpc("customer_request_garden_removal", {
        p_parcel_id: addonParcel,
        p_reason: "sold",
        p_timing: "notice",
      }),
    );
    check(
      await ops.rpc("ops_schedule_garden_removal", {
        p_removal_id: removal,
        p_effective_on: istanbulToday(),
        p_note: "müşteriyle bugün için anlaşıldı",
        p_access_days: 0,
      }),
    );
    check(await ops.rpc("ops_complete_garden_removal", { p_removal_id: removal }));
    const row = check(
      await customer.client
        .from("garden_removal")
        .select("status, refund_mode, refund_kurus, access_until")
        .eq("id", removal)
        .single(),
    );
    expect(row).toMatchObject({ status: "completed", refund_mode: "unused_visits" });
    expect(row.refund_kurus).toBeGreaterThan(0);
    const refunds = check(
      await admin
        .from("refund")
        .select("amount_kurus, kind, status")
        .eq("garden_removal_id", removal),
    );
    expect(refunds).toEqual([
      { amount_kurus: row.refund_kurus, kind: "manual", status: "requested" },
    ]);
    const addonOrder = check(
      await admin.from("service_order").select("status").eq("id", addon).single(),
    );
    expect(addonOrder.status).toBe("terminated");
    const parcel = check(
      await admin.from("parcel").select("status").eq("id", addonParcel).single(),
    );
    expect(parcel.status).toBe("passive");

    await runGardenRemovalHousekeeping();
    const access = check(
      await admin.from("parcel_access").select("user_id").eq("parcel_id", addonParcel),
    );
    expect(access).toEqual([]);
    const period = check(await customer.client.rpc("my_service_period"));
    expect(period[0]).toMatchObject({ base_order_id: base, garden_count: 1 });
  });
});

describe("concurrency", () => {
  it("ops and the housekeeping complete a removal once", async () => {
    const customer = await createCustomer(DOMAIN);
    const { order } = await activeOrderFor(customer);
    const item = check(
      await admin.from("service_order_item").select("id").eq("order_id", order).single(),
    );
    const removal = check(
      await ops.rpc("ops_request_garden_removal", {
        p_order_item_id: item.id,
        p_reason: "sold",
        p_effective_on: istanbulToday(),
      }),
    );
    const [byOps] = await Promise.all([
      ops.rpc("ops_complete_garden_removal", { p_removal_id: removal }),
      runGardenRemovalHousekeeping(),
    ]);
    if (byOps.error) expect(byOps.error.message).toBe("state_changed");
    const row = check(
      await admin.from("garden_removal").select("status").eq("id", removal).single(),
    );
    expect(row.status).toBe("completed");
    const audits = check(
      await admin
        .from("audit_event")
        .select("id")
        .eq("entity_id", removal)
        .eq("action", "garden_removal.completed"),
    );
    expect(audits).toHaveLength(1);
    const refunds = check(await admin.from("refund").select("id").eq("garden_removal_id", removal));
    expect(refunds).toHaveLength(1);
    const messages = check(
      await admin
        .from("notification")
        .select("id")
        .eq("ref_id", removal)
        .eq("template", "garden_removal_completed"),
    );
    expect(messages).toHaveLength(1);
  });

  it("two acceptances holding one parcel: one gets parcel_in_service", async () => {
    const customer = await createCustomer(DOMAIN);
    const parcel = await idleParcel(customer);
    const quotes = [];
    for (let i = 0; i < 2; i++) {
      quotes.push(
        check(
          await ops.rpc("ops_issue_parcel_quote", {
            p_org_id: SEED.org,
            p_customer_user_id: customer.id,
            p_package_id: BILLING_SEED.packages.standart,
            p_parcel_ids: [parcel],
            p_first_year: false,
            p_proposed_service_start: istanbulToday(),
          }),
        ),
      );
    }
    const results = await Promise.all(
      quotes.map((q) =>
        customer.client.rpc("customer_accept_quote", { p_quote_id: q, p_consents: CONSENTS }),
      ),
    );
    expect(results.map(errorOf).sort()).toEqual([null, "parcel_in_service"].sort());
  });

  it("two removal requests at once: one gets garden_removal_open, not a raw 23505", async () => {
    const customer = await createCustomer(DOMAIN);
    const { parcels } = await activeOrderFor(customer);
    const results = await Promise.all(
      [0, 1].map(() =>
        customer.client.rpc("customer_request_garden_removal", {
          p_parcel_id: parcels[0],
          p_reason: "cost",
          p_timing: "notice",
        }),
      ),
    );
    expect(results.map(errorOf).sort()).toEqual([null, "garden_removal_open"].sort());
    expect(results.find((r) => r.error)?.error?.code).toBe("P0001");
  });

  it("an unpaid renewal blocks the request until it is cancelled; then it cannot be paid", async () => {
    const customer = await createCustomer(DOMAIN);
    const { order, parcels } = await activeOrderFor(customer);
    const quote = check(
      await ops.rpc("ops_issue_parcel_quote", {
        p_org_id: SEED.org,
        p_customer_user_id: customer.id,
        p_package_id: BILLING_SEED.packages.standart,
        p_parcel_ids: parcels,
        p_first_year: false,
        p_proposed_service_start: istanbulToday(),
        p_renewal_of_order_id: order,
      }),
    );
    const renewal = check(
      await customer.client.rpc("customer_accept_quote", {
        p_quote_id: quote,
        p_consents: CONSENTS,
      }),
    );
    const blocked = await customer.client.rpc("customer_request_garden_removal", {
      p_parcel_id: parcels[0],
      p_reason: "not_needed",
      p_timing: "notice",
    });
    expect(errorOf(blocked)).toBe("parcel_order_pending");

    check(await customer.client.rpc("customer_cancel_order", { p_order_id: renewal }));
    const removal = check(
      await customer.client.rpc("customer_request_garden_removal", {
        p_parcel_id: parcels[0],
        p_reason: "not_needed",
        p_timing: "notice",
      }),
    );
    check(
      await ops.rpc("ops_schedule_garden_removal", {
        p_removal_id: removal,
        p_effective_on: istanbulToday(),
        p_note: "bugün",
      }),
    );
    check(await ops.rpc("ops_complete_garden_removal", { p_removal_id: removal }));
    const paid = await ops.rpc("ops_record_manual_payment", {
      p_order_id: renewal,
      p_amount_kurus: 1000,
      p_value_date: istanbulToday(),
      p_bank_reference: "EFT-IP14-YENILEME",
    });
    expect(errorOf(paid)).toBe("order_not_payable");
  });
});
