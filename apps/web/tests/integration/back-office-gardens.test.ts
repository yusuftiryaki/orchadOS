import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addonBase,
  applicationCustomer,
  gardenOverlaps,
  gardenOverlapsOf,
  getOrder,
  getRemoval,
  listRemovals,
  membershipOf,
  membershipOrEmpty,
  parcelService,
  previewAddonQuote,
  readMembership,
  removalLastEffective,
} from "@/lib/back-office/data";
import {
  cancelGardenRemoval,
  completeGardenRemoval,
  issueAddonQuote,
  linkGardenParcel,
  requestGardenRemoval,
  scheduleGardenRemoval,
  withdrawApplicationGarden,
} from "@/lib/back-office/mutations";
import { addDays, planRemoveAll } from "@/lib/back-office/validation";
import type { OpsOrg } from "@/lib/operations/data";
import type { Client } from "@/lib/supabase/types";
import {
  CONSENTS,
  GARDEN_DETAIL,
  activeOrderFor,
  addonOrderFor,
  check,
  createCustomer,
  istanbulToday,
  payByTransfer,
  removeCustomers,
  type TestCustomer,
} from "./billing-fixture";
import { BILLING_SEED, SEED, serviceClient, signIn } from "./fixtures";

// The IP14 back office (docs/bahce-yonetimi.md §12) through its data and
// mutation modules, as ops@: a member's period and gardens, an add-on and its
// base, duplicate checks and linking an earlier parcel, the add-on quote,
// removals (open, move the day, complete, refunds, cancel) and the reads
// refused on ops' own record.

const DOMAIN = "back-office-gardens-test.example.test";
const today = istanbulToday();
const ORGS: OpsOrg[] = [{ id: SEED.org } as OpsOrg];

let admin: Client;
let ops: Client;
let opsId: string;

beforeAll(async () => {
  admin = serviceClient();
  await removeCustomers(DOMAIN);
  ({ client: ops, userId: opsId } = await signIn("ops"));
});

afterAll(() => removeCustomers(DOMAIN));

const fail = (r: { ok: true } | { ok: false; error: string }) => (r.ok ? null : r.error);

// The position of a parcel as [lon, lat].
async function positionOf(parcelId: string): Promise<[number, number]> {
  const row = check(
    await admin.from("parcel").select("position:position::json").eq("id", parcelId).single(),
  ) as unknown as { position: { coordinates: [number, number] } };
  return row.position.coordinates;
}

// A submitted application of the customer with one garden at a point.
async function applicationAt(customer: TestCustomer, [lon, lat]: [number, number]) {
  const application = check(
    await customer.client.rpc("customer_create_application", {
      p_package_id: BILLING_SEED.packages.standart,
    }),
  );
  const gardens: string[] = [];
  for (const [i, name] of ["Geri gelen bahçe", "Fazla bahçe"].entries()) {
    gardens.push(
      check(
        await customer.client.rpc("customer_save_application_garden", {
          p_application_id: application,
          p_garden: { name, declared_area_m2: 18000, lon: lon + i * 0.05, lat },
          p_detail: GARDEN_DETAIL,
        }),
      ),
    );
  }
  check(
    await customer.client.rpc("customer_submit_application", { p_application_id: application }),
  );
  return { application, gardens };
}

describe("a member's period, gardens and orders", () => {
  let customer: TestCustomer;
  let base: string;
  let addon: string;
  let addonParcel: string;
  let baseParcel: string;
  let removal: string;

  beforeAll(async () => {
    customer = await createCustomer(DOMAIN);
    const first = await activeOrderFor(customer);
    base = first.order;
    baseParcel = first.parcels[0];
    const added = await addonOrderFor(customer, base);
    addon = added.order;
    addonParcel = added.parcels[0];
  });

  it("reads the period with its add-on base and both gardens in service", async () => {
    const m = await membershipOf(ops, SEED.org, customer.id);
    expect(m.periods).toHaveLength(1);
    expect(m.periods[0]).toMatchObject({ base_order_id: base, is_primary: true, garden_count: 2 });
    expect(addonBase(m.periods)).toMatchObject({ baseOrderId: base });
    expect(m.gardens.map((g) => [g.parcel_id, g.state, g.is_addon]).sort()).toEqual(
      [
        [baseParcel, "in_service", false],
        [addonParcel, "in_service", true],
      ].sort(),
    );
    expect(m.gardens.every((g) => g.base_order_id === base)).toBe(true);
  });

  it("an order shows its add-ons; an add-on its base; lines are in service", async () => {
    const baseView = await getOrder(ops, base);
    expect(baseView?.addons.map((a) => a.id)).toEqual([addon]);
    expect(baseView?.base).toBeNull();
    const addonView = await getOrder(ops, addon);
    expect(addonView?.base?.id).toBe(base);
    expect(addonView?.order.addon_of_order_id).toBe(base);
    expect(addonView?.items[0]).toMatchObject({ parcel_id: addonParcel, removed_on: null });
    expect(addonView?.items[0].openRemoval).toBeNull();
    const list = check(
      await ops.rpc("ops_orders", { p_org_id: SEED.org, p_customer_user_id: customer.id }),
    );
    const row = list.find((o) => o.id === addon);
    expect(row).toMatchObject({ addon_of_order_id: base, renewal_due: false });
  });

  it("ops opens a removal on the add-on line, moves the day only with a note, completes it", async () => {
    const line = (await getOrder(ops, addon))!.items[0];
    const later = addDays(today, 10);
    const opened = await requestGardenRemoval(ops, line.id, {
      reason: "not_needed",
      effectiveOn: later,
      accessDays: null,
      revokeAllAccess: false,
      note: null,
    });
    if (!opened.ok) throw new Error(opened.error);
    removal = opened.value;

    // A second request on the same garden is refused.
    const again = await requestGardenRemoval(ops, line.id, {
      reason: "other",
      effectiveOn: later,
      accessDays: null,
      revokeAllAccess: false,
      note: null,
    });
    expect(fail(again)).toBe("garden_removal_open");

    const open = await listRemovals(ops, ORGS, null);
    expect(open.truncated).toBe(false);
    expect(open.rows.find((r) => r.id === removal)).toMatchObject({
      status: "scheduled",
      initiated_by: "ops",
      effective_on: later,
      order_id: addon,
    });
    expect((await getOrder(ops, addon))!.items[0].openRemoval?.id).toBe(removal);

    const view = await getRemoval(ops, removal);
    expect(view?.row?.number).toMatch(/^C-\d{4}-\d{6}$/);
    // Read without the list row too (past the list's limit).
    expect(view?.customerName).toBe("Test Müşteri");
    expect(view?.orderNumber).toBe(view?.row?.order_number);
    expect(view?.blockedReason).toBeNull();
    expect(view?.preview?.formula).toBe("removal-v1");
    expect(view?.preview?.lines.map((l) => l.order_id)).toEqual([addon]);
    expect(view?.preview?.access_scope.customer_owner).toBe(1);
    expect(view?.profileId).toBeTruthy();

    expect(fail(await completeGardenRemoval(ops, removal))).toBe("removal_not_due");
    const noNote = await scheduleGardenRemoval(ops, removal, {
      effectiveOn: today,
      accessDays: null,
      revokeAllAccess: false,
      note: null,
    });
    expect(noNote).toMatchObject({ ok: false, error: "invalid_input", field: "note" });
    const moved = await scheduleGardenRemoval(ops, removal, {
      effectiveOn: today,
      accessDays: null,
      revokeAllAccess: false,
      note: "Müşteriyle bugün için anlaşıldı",
    });
    expect(fail(moved)).toBeNull();
    expect(fail(await completeGardenRemoval(ops, removal))).toBeNull();

    const done = await getRemoval(ops, removal);
    expect(done?.removal.status).toBe("completed");
    expect(done?.removal.refund_kurus).toBeGreaterThan(0);
    expect(done?.refunds.length).toBeGreaterThan(0);
    expect(done?.refunds.every((r) => r.garden_removal_id === removal)).toBe(true);
    expect((await listRemovals(ops, ORGS, "completed")).rows.some((r) => r.id === removal)).toBe(
      true,
    );

    const item = (await getOrder(ops, addon))!.items[0];
    expect(item.removed_on).toBe(today);
    expect(item.garden_removal_id).toBe(removal);
    const service = await parcelService(ops, SEED.org, addonParcel);
    expect(service.status?.status).toBe("removed");
    expect(service.garden?.order_id).toBe(addon);
    expect(service.openRemoval).toBeNull();
  });

  it("a removal of the base garden is cancelled with a note", async () => {
    const line = (await getOrder(ops, base))!.items[0];
    const opened = await requestGardenRemoval(ops, line.id, {
      reason: "transfer",
      effectiveOn: addDays(today, 5),
      accessDays: 0,
      revokeAllAccess: true,
      note: null,
    });
    if (!opened.ok) throw new Error(opened.error);
    const row = (await getRemoval(ops, opened.value))!;
    expect(row.removal.access_days).toBe(0);
    expect(row.row?.revoke_all_access).toBe(true);
    const service = await parcelService(ops, SEED.org, baseParcel);
    expect(service.status?.status).toBe("leaving");
    expect(service.openRemoval?.id).toBe(opened.value);
    expect(fail(await cancelGardenRemoval(ops, opened.value, "Müşteri vazgeçti"))).toBeNull();
    expect((await getRemoval(ops, opened.value))?.removal.status).toBe("cancelled");
    expect(
      (await listRemovals(ops, ORGS, "cancelled")).rows.some((r) => r.id === opened.value),
    ).toBe(true);
  });

  it("the reads are refused on ops' own record; the safe read is empty", async () => {
    await expect(membershipOf(ops, SEED.org, opsId)).rejects.toMatchObject({ code: "42501" });
    expect(await membershipOrEmpty(ops, SEED.org, opsId)).toEqual({ periods: [], gardens: [] });
    // The read that decides add-on or separate period reports the refusal.
    expect(await readMembership(ops, SEED.org, opsId)).toEqual({ error: "forbidden" });
    const read = await readMembership(ops, SEED.org, customer.id);
    expect("membership" in read && read.membership.periods.map((p) => p.base_order_id)).toEqual([
      base,
    ]);
  });

  it("a missing order line is not found", async () => {
    const missing = await requestGardenRemoval(ops, "00000000-0000-4000-8000-000000000000", {
      reason: "other",
      effectiveOn: today,
      accessDays: null,
      revokeAllAccess: false,
      note: null,
    });
    expect(fail(missing)).toBe("not_found");
  });
});

// Ops who is also a customer of the org: the writes on their own order lines
// and base order are refused (private.require_ops_customer), not just absent.
describe("the writes are refused on ops' own record", () => {
  let customer: TestCustomer;
  let base: string;
  let line: string;
  let parcel: string;

  beforeAll(async () => {
    customer = await createCustomer(DOMAIN);
    ({
      order: base,
      parcels: [parcel],
    } = await activeOrderFor(customer));
    line = (await getOrder(ops, base))!.items[0].id;
    // The customer becomes ops of the org (removed with the account).
    check(
      await admin
        .from("membership")
        .insert({ org_id: SEED.org, user_id: customer.id, role: "ops" }),
    );
  });

  it("removal, add-on quote and the reads are forbidden on the caller's own record", async () => {
    const self = customer.client;
    const removal = await requestGardenRemoval(self, line, {
      reason: "other",
      effectiveOn: today,
      accessDays: null,
      revokeAllAccess: false,
      note: null,
    });
    expect(fail(removal)).toBe("forbidden");
    const addon = await issueAddonQuote(self, base, null, {
      proposedServiceStart: null,
      validDays: null,
      discountBp: 0,
      discountNote: null,
      noteToCustomer: null,
      parcelIds: [parcel],
    });
    expect(fail(addon)).toBe("forbidden");
    expect(await readMembership(self, SEED.org, customer.id)).toEqual({ error: "forbidden" });

    // The same line through another ops is allowed: the refusal is the own-record rule.
    const opened = await requestGardenRemoval(ops, line, {
      reason: "other",
      effectiveOn: addDays(today, 5),
      accessDays: null,
      revokeAllAccess: false,
      note: null,
    });
    if (!opened.ok) throw new Error(opened.error);
    for (const r of [
      await scheduleGardenRemoval(self, opened.value, {
        effectiveOn: addDays(today, 5),
        accessDays: null,
        revokeAllAccess: null,
        note: null,
      }),
      await cancelGardenRemoval(self, opened.value, "kendi kaydım"),
      await completeGardenRemoval(self, opened.value),
    ]) {
      expect(fail(r)).toBe("forbidden");
    }
    expect(fail(await cancelGardenRemoval(ops, opened.value, "test: geri alındı"))).toBeNull();
  });
});

// "Tüm bahçeleri çıkar" with a paid renewal (§5.2): the day may fall inside
// the renewal, and a parcel only in the renewal is removed too.
describe("removing every garden of a member with a paid renewal", () => {
  let customer: TestCustomer;
  let base: string;
  let baseParcel: string;
  let renewalOnly: string;
  let renewalEnd: string;

  beforeAll(async () => {
    customer = await createCustomer(DOMAIN);
    // An earlier order ended: its parcel joins only the renewal.
    const earlier = await activeOrderFor(customer, [18000]);
    renewalOnly = earlier.parcels[0];
    check(
      await ops.rpc("ops_terminate_order", { p_order_id: earlier.order, p_note: "test: bitti" }),
    );
    const first = await activeOrderFor(customer);
    base = first.order;
    baseParcel = first.parcels[0];
    const baseEnd = check(
      await ops.from("service_order").select("service_end").eq("id", base).single(),
    ).service_end!;
    const quote = check(
      await ops.rpc("ops_issue_parcel_quote", {
        p_org_id: SEED.org,
        p_customer_user_id: customer.id,
        p_package_id: BILLING_SEED.packages.standart,
        p_parcel_ids: [baseParcel, renewalOnly],
        p_first_year: false,
        p_proposed_service_start: addDays(baseEnd, 1),
        p_renewal_of_order_id: base,
      }),
    );
    const renewal = check(
      await customer.client.rpc("customer_accept_quote", {
        p_quote_id: quote,
        p_consents: CONSENTS,
      }),
    );
    await payByTransfer(renewal);
    renewalEnd = check(
      await ops.from("service_order").select("service_end").eq("id", renewal).single(),
    ).service_end!;
  });

  it("the last day is the renewal's; no garden is moved or left out", async () => {
    const { gardens } = await membershipOf(ops, SEED.org, customer.id);
    expect(gardens.map((g) => [g.parcel_id, g.state]).sort()).toEqual(
      [
        [baseParcel, "in_service"],
        [renewalOnly, "upcoming"],
      ].sort(),
    );
    const lastDays = await removalLastEffective(
      ops,
      customer.id,
      gardens.map((g) => g.parcel_id),
    );
    expect(lastDays.get(baseParcel)).toBe(addDays(renewalEnd, 1));
    expect(lastDays.get(renewalOnly)).toBe(addDays(renewalEnd, 1));

    // A day inside the paid renewal.
    const day = addDays(renewalEnd, -30);
    const steps = planRemoveAll(gardens, day, lastDays);
    expect(steps).toHaveLength(2);
    for (const step of steps) {
      if ("skipped" in step) throw new Error("skipped");
      expect(step).toMatchObject({ effectiveOn: day, moved: false });
      const opened = await requestGardenRemoval(ops, step.garden.order_item_id, {
        reason: "not_needed",
        effectiveOn: step.effectiveOn,
        accessDays: null,
        revokeAllAccess: false,
        note: null,
      });
      if (!opened.ok) throw new Error(opened.error);
      expect((await getRemoval(ops, opened.value))?.removal.effective_on).toBe(day);
    }
  });
});

describe("an add-on application: duplicate checks, linking, withdrawing, the add-on quote", () => {
  let customer: TestCustomer;
  let base: string;
  let idle: string;
  let application: string;
  let gardens: string[];

  beforeAll(async () => {
    customer = await createCustomer(DOMAIN);
    // An earlier order ended: its parcel is the customer's, served by nothing.
    const earlier = await activeOrderFor(customer, [18000]);
    idle = earlier.parcels[0];
    check(
      await ops.rpc("ops_terminate_order", { p_order_id: earlier.order, p_note: "test: bitti" }),
    );
    ({ order: base } = await activeOrderFor(customer));
    ({ application, gardens } = await applicationAt(customer, await positionOf(idle)));
  });

  it("the overlap check finds the earlier parcel of the same customer", async () => {
    const rows = await gardenOverlaps(ops, gardens[0]);
    const hit = rows.find((r) => r.parcel_id === idle);
    expect(hit).toMatchObject({ same_customer: true, in_service: false });
  });

  it("a failed overlap check is reported, never read as no overlap", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    const checks = await gardenOverlapsOf(ops, [gardens[0], missing]);
    const found = checks.get(gardens[0]);
    expect(Array.isArray(found) && found.some((r) => r.parcel_id === idle)).toBe(true);
    expect(checks.get(missing)).toMatchObject({ error: expect.any(String) });
  });

  it("the application's customer is read on the server", async () => {
    expect(await applicationCustomer(ops, application)).toEqual({
      orgId: SEED.org,
      userId: customer.id,
    });
    expect(await applicationCustomer(ops, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("links the garden to the earlier parcel and unlinks it; a parcel in service is refused", async () => {
    const m = await membershipOf(ops, SEED.org, customer.id);
    const inService = m.gardens.find((g) => g.base_order_id === base)!.parcel_id;
    expect(fail(await linkGardenParcel(ops, gardens[0], inService))).toBe("parcel_in_service");
    expect(fail(await linkGardenParcel(ops, gardens[0], idle))).toBeNull();
    const linked = check(
      await ops.from("application_garden").select("parcel_id").eq("id", gardens[0]).single(),
    );
    expect(linked.parcel_id).toBe(idle);
    expect(fail(await linkGardenParcel(ops, gardens[0], null))).toBeNull();
    expect(fail(await linkGardenParcel(ops, gardens[0], idle))).toBeNull();
  });

  it("withdraws the extra garden; the last one cannot be withdrawn", async () => {
    expect(fail(await withdrawApplicationGarden(ops, gardens[1], "Mükerrer giriş"))).toBeNull();
    expect(fail(await withdrawApplicationGarden(ops, gardens[1], "tekrar"))).toBe(
      "garden_withdrawn",
    );
    expect(fail(await withdrawApplicationGarden(ops, gardens[0], "son bahçe"))).toBe("last_garden");
  });

  it("previews and issues the add-on quote for the remaining garden", async () => {
    const m = await membershipOf(ops, SEED.org, customer.id);
    const target = addonBase(m.periods)!;
    expect(target.baseOrderId).toBe(base);
    const preview = await previewAddonQuote(ops, { baseOrderId: base, applicationId: application });
    if ("error" in preview) throw new Error(preview.error);
    expect(preview.lines).toHaveLength(1);
    expect(preview.lines[0]).toMatchObject({
      application_garden_id: gardens[0],
      area_source: "estimated",
    });

    // Not verified yet.
    const unverified = await issueAddonQuote(ops, base, application, {
      proposedServiceStart: null,
      validDays: null,
      discountBp: 0,
      discountNote: null,
      noteToCustomer: null,
      parcelIds: null,
    });
    expect(fail(unverified)).toBe("garden_not_verified");
    check(
      await ops.rpc("ops_verify_application_garden", {
        p_garden_id: gardens[0],
        p_verified_area_m2: 18000,
      }),
    );
    const issued = await issueAddonQuote(ops, base, application, {
      proposedServiceStart: null,
      validDays: 10,
      discountBp: 0,
      discountNote: null,
      noteToCustomer: "Ek bahçe",
      parcelIds: null,
    });
    if (!issued.ok) throw new Error(issued.error);
    const quote = check(
      await ops
        .from("quote")
        .select("addon_of_order_id, inputs, valid_until")
        .eq("id", issued.value)
        .single(),
    );
    expect(quote.addon_of_order_id).toBe(base);
    const inputs = quote.inputs as { addon: { base_order_id: string; addon_last_day: string } };
    expect(inputs.addon.base_order_id).toBe(base);
    expect(quote.valid_until! <= inputs.addon.addon_last_day).toBe(true);
  });

  it("an add-on quote for existing parcels: the parcel path", async () => {
    const preview = await previewAddonQuote(ops, { baseOrderId: base, parcelIds: [idle] });
    if ("error" in preview) throw new Error(preview.error);
    expect(preview.lines.map((l) => l.parcel_id)).toEqual([idle]);
    const issued = await issueAddonQuote(ops, base, null, {
      proposedServiceStart: null,
      validDays: null,
      discountBp: 0,
      discountNote: null,
      noteToCustomer: null,
      parcelIds: [idle],
    });
    expect(fail(issued)).toBeNull();
  });
});
