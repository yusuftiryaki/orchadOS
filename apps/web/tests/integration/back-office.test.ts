import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { internalOf, refundKinds } from "@/lib/back-office/data";
import {
  completeManualRefund,
  createPriceListDraft,
  deletePriceListDraft,
  issueQuote,
  publishPriceList,
  recordManualPayment,
  requestRefund,
  savePriceListDraft,
  verifyGarden,
} from "@/lib/back-office/mutations";
import { addDays } from "@/lib/back-office/validation";
import type { Client } from "@/lib/supabase/types";
import { purgeBillingUsers, purgeParcels } from "../local-db";
import {
  CONSENTS,
  GARDEN,
  GARDEN_DETAIL,
  check,
  createCustomer,
  istanbulToday,
  removeCustomers,
  submitApplication,
  type TestCustomer,
} from "./billing-fixture";
import {
  BILLING_SEED,
  CUSTOMER,
  PASSWORD,
  SEED,
  anonClient,
  serviceClient,
  signIn,
} from "./fixtures";

// The back office (IP12-E, docs/musteri-yonetimi.md §11) through its data and
// mutation modules, as ops@: price list drafts and publishing, the whole
// path from a fresh customer's application to an active order with its
// parcel, a transfer refund, internal columns, the self-dealing rule and the
// ops_* functions refused to field@, expert@ and owner@. Seed rows are not
// changed: every row is the test's own (a published price list stays, dated
// years ahead so that it is never in force).

const DOMAIN = "back-office-test.example.test";

let admin: Client;
let ops: Client;
let customer: TestCustomer;
const today = istanbulToday();

beforeAll(async () => {
  admin = serviceClient();
  await removeCustomers(DOMAIN);
  ops = (await signIn("ops")).client;
  customer = await createCustomer(DOMAIN);
});

afterAll(() => removeCustomers(DOMAIN));

describe("price lists", () => {
  it("a draft is saved and published; a past start and later edits are refused", async () => {
    const draft = await createPriceListDraft(ops, SEED.org, null);
    if (!draft.ok) throw new Error(draft.error);
    const packages = check(
      await ops.from("service_package").select("id").eq("org_id", SEED.org).eq("active", true),
    );
    const items = packages.map((p) => ({
      package_id: p.id,
      unit_price_kurus: 13_000,
      minimum_fee_kurus: 500_000,
      inventory_fee_kurus: 0,
    }));

    const past = await savePriceListDraft(ops, draft.value, {
      validFrom: addDays(today, -1),
      vatRateBp: 2000,
      note: "back office test",
      items,
    });
    expect(past.ok).toBe(true);
    expect(await publishPriceList(ops, draft.value)).toEqual({
      ok: false,
      error: "valid_from_in_past",
    });

    const future = addDays(today, 3650);
    expect(
      (
        await savePriceListDraft(ops, draft.value, {
          validFrom: future,
          vatRateBp: 2000,
          note: "",
          items,
        })
      ).ok,
    ).toBe(true);
    const published = await publishPriceList(ops, draft.value);
    if (!published.ok) throw new Error(published.error);
    expect(published.value).toBeGreaterThan(1);

    expect(
      await savePriceListDraft(ops, draft.value, {
        validFrom: future,
        vatRateBp: 1000,
        note: "",
        items,
      }),
    ).toEqual({ ok: false, error: "price_list_not_draft" });
    expect(await deletePriceListDraft(ops, draft.value)).toEqual({
      ok: false,
      error: "price_list_not_draft",
    });

    const audit = check(
      await ops.rpc("ops_audit_events", {
        p_org_id: SEED.org,
        p_entity_type: "price_list",
        p_entity_id: draft.value,
      }),
    );
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "price_list.draft_created",
        "price_list.draft_saved",
        "price_list.published",
      ]),
    );
  });

  it("a draft can be deleted", async () => {
    const draft = await createPriceListDraft(ops, SEED.org, BILLING_SEED.priceListV1);
    if (!draft.ok) throw new Error(draft.error);
    expect(await deletePriceListDraft(ops, draft.value)).toEqual({ ok: true, value: null });
  });
});

describe("application to active order, then a transfer refund", () => {
  let order: string;
  let payment: string;

  it("ops verifies the garden and quotes; the customer accepts", async () => {
    const { application, garden } = await submitApplication(customer);
    expect(
      await issueQuote(ops, application, {
        proposedServiceStart: null,
        validDays: null,
        discountBp: 0,
        discountNote: null,
        noteToCustomer: null,
      }),
    ).toEqual({
      ok: false,
      error: "garden_not_verified",
    });
    expect(
      (
        await verifyGarden(ops, garden, {
          verifiedAreaM2: 20_000,
          boundary: null,
          note: "Uydu ile ölçüldü",
        })
      ).ok,
    ).toBe(true);
    const quote = await issueQuote(ops, application, {
      proposedServiceStart: null,
      validDays: 10,
      discountBp: 1000,
      discountNote: "Pilot indirimi",
      noteToCustomer: null,
    });
    if (!quote.ok) throw new Error(quote.error);
    const row = check(
      await ops.from("quote").select("total_kurus, discount_bp").eq("id", quote.value).single(),
    );
    // 20 dönüm standard: 1.000.000 base, 10 % off, 20 % VAT.
    expect(row).toEqual({ total_kurus: 1_080_000, discount_bp: 1000 });

    const internal = await internalOf(ops, "application_garden", garden);
    expect(internal.verification_note).toBe("Uydu ile ölçüldü");

    order = check(
      await customer.client.rpc("customer_accept_quote", {
        p_quote_id: quote.value,
        p_consents: CONSENTS,
      }),
    );
  });

  it("a partial and a final transfer activate the order with its parcel", async () => {
    const first = await recordManualPayment(ops, order, {
      amountKurus: 80_000,
      valueDate: today,
      bankReference: "EFT-BO-1",
      note: "Müşteri iki parçada ödedi",
    });
    if (!first.ok) throw new Error(first.error);
    expect(
      await recordManualPayment(ops, order, {
        amountKurus: 1_000_001,
        valueDate: today,
        bankReference: "EFT-BO-2",
        note: null,
      }),
    ).toEqual({ ok: false, error: "amount_exceeds_balance" });
    const second = await recordManualPayment(ops, order, {
      amountKurus: 1_000_000,
      valueDate: today,
      bankReference: "EFT-BO-2",
      note: null,
    });
    if (!second.ok) throw new Error(second.error);
    payment = second.value;

    const row = check(
      await ops.from("service_order").select("status, paid_kurus").eq("id", order).single(),
    );
    expect(row).toEqual({ status: "active", paid_kurus: 1_080_000 });
    const items = check(
      await ops.from("service_order_item").select("parcel_id").eq("order_id", order),
    );
    expect(items).toHaveLength(1);
    expect(items[0].parcel_id).toBeTruthy();
    const parcel = check(
      await ops.from("parcel").select("status, name").eq("id", items[0].parcel_id!).single(),
    );
    expect(parcel).toEqual({ status: "registered", name: GARDEN.name });

    // The internal note: through ops_billing_internal only.
    const internal = await internalOf(ops, "payment", first.value);
    expect(internal.manual_note).toBe("Müşteri iki parçada ödedi");
    expect(internal).not.toHaveProperty("provider_token");
    const direct = await ops.from("payment").select("manual_note").eq("id", first.value);
    expect(direct.error?.code).toBe("42501");
  });

  it("a transfer refund is requested and completed", async () => {
    const requested = await requestRefund(ops, payment, {
      amountKurus: 50_000,
      reason: "goodwill",
      note: "Gecikme için",
      paymentItemId: null,
    });
    if (!requested.ok) throw new Error(requested.error);
    expect(requested.value).toHaveLength(1);
    expect(await refundKinds(ops, requested.value)).toEqual([
      { id: requested.value[0], kind: "manual" },
    ]);
    const done = await completeManualRefund(ops, requested.value[0], {
      bankReference: "IADE-BO-1",
      completedOn: today,
    });
    expect(done.ok).toBe(true);
    const refund = check(
      await ops
        .from("refund")
        .select("status, bank_reference")
        .eq("id", requested.value[0])
        .single(),
    );
    expect(refund).toEqual({ status: "succeeded", bank_reference: "IADE-BO-1" });
    expect((await internalOf(ops, "refund", requested.value[0])).note).toBe("Gecikme için");
    expect(
      await completeManualRefund(ops, requested.value[0], {
        bankReference: "IADE-BO-1",
        completedOn: today,
      }),
    ).toEqual({ ok: false, error: "refund_not_open" });

    const audit = check(
      await ops.rpc("ops_audit_events", { p_org_id: SEED.org, p_action_prefix: "refund." }),
    ).filter((a) => a.entity_id === requested.value[0]);
    expect(audit.map((a) => a.action).sort()).toEqual(["refund.requested", "refund.succeeded"]);
  });
});

describe("self-dealing", () => {
  const email = `ops-musteri@${DOMAIN}`;
  let opsCustomer: Client;
  let opsCustomerId: string;

  afterAll(async () => {
    const parcels = opsCustomerId
      ? check(await admin.from("parcel_access").select("parcel_id").eq("user_id", opsCustomerId))
      : [];
    if (opsCustomerId) await purgeBillingUsers([opsCustomerId]);
    if (parcels.length) await purgeParcels(parcels.map((p) => p.parcel_id));
  });

  it("an ops user cannot act on their own customer records", async () => {
    // A second ops user of the seed org who is also a customer there.
    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    opsCustomerId = created.data.user.id;
    check(
      await admin
        .from("membership")
        .insert({ org_id: SEED.org, user_id: opsCustomerId, role: "ops" }),
    );
    check(
      await ops.rpc("ops_create_owner_profile", {
        p_org_id: SEED.org,
        p_user_id: opsCustomerId,
        p_full_name: "Ops Müşteri",
        p_contact_preference: "sms",
        p_kvkk_consent: true,
        p_phone: "+905559998877",
        p_kvkk_consent_at: new Date().toISOString(),
        p_kvkk_text_version: "kvkk-v1-taslak",
      }),
    );
    opsCustomer = anonClient();
    const signedIn = await opsCustomer.auth.signInWithPassword({ email, password: PASSWORD });
    if (signedIn.error) throw signedIn.error;
    const application = check(
      await opsCustomer.rpc("customer_create_application", {
        p_package_id: BILLING_SEED.packages.standart,
      }),
    );
    const garden = check(
      await opsCustomer.rpc("customer_save_application_garden", {
        p_application_id: application,
        p_garden: GARDEN,
        p_detail: GARDEN_DETAIL,
      }),
    );
    check(await opsCustomer.rpc("customer_submit_application", { p_application_id: application }));

    expect(
      await verifyGarden(opsCustomer, garden, {
        verifiedAreaM2: 20_000,
        boundary: null,
        note: null,
      }),
    ).toEqual({ ok: false, error: "forbidden" });
    const rejected = await opsCustomer.rpc("ops_reject_application", {
      p_application_id: application,
      p_reason: "other",
    });
    expect(rejected.error?.message).toBe("forbidden");
    // Another ops user may.
    expect(
      (await verifyGarden(ops, garden, { verifiedAreaM2: 20_000, boundary: null, note: null })).ok,
    ).toBe(true);
    const quote = await opsCustomer.rpc("ops_issue_quote", { p_application_id: application });
    expect(quote.error?.message).toBe("forbidden");
  });
});

describe("other roles", () => {
  // Every ops_* function of IP12 with plausible arguments (seed rows and the
  // customer's): refused or empty for field@, expert@ and owner@.
  const calls = (): [string, Record<string, unknown>][] => {
    const org = SEED.org;
    const any = "91200000-0000-4000-8000-0000000009ff";
    return [
      ["ops_billing_summary", { p_org_id: org }],
      ["ops_customers", { p_org_id: org }],
      [
        "ops_billing_internal",
        { p_entity_type: "application", p_entity_id: BILLING_SEED.application },
      ],
      ["ops_applications", { p_org_id: org }],
      ["ops_application_garden_detail", { p_garden_id: BILLING_SEED.garden }],
      [
        "ops_verify_application_garden",
        { p_garden_id: BILLING_SEED.garden, p_verified_area_m2: 15000 },
      ],
      ["ops_reject_application", { p_application_id: BILLING_SEED.application, p_reason: "other" }],
      ["ops_preview_quote", { p_application_id: BILLING_SEED.application }],
      ["ops_issue_quote", { p_application_id: BILLING_SEED.application }],
      [
        "ops_issue_parcel_quote",
        {
          p_org_id: org,
          p_customer_user_id: CUSTOMER.id,
          p_package_id: BILLING_SEED.packages.standart,
          p_parcel_ids: [SEED.parcel],
          p_first_year: true,
          p_proposed_service_start: today,
        },
      ],
      ["ops_orders", { p_org_id: org }],
      ["ops_cancel_order", { p_order_id: any }],
      ["ops_extend_payment_due", { p_order_id: any, p_due_on: today }],
      ["ops_terminate_order", { p_order_id: any, p_note: "x" }],
      [
        "ops_record_manual_payment",
        { p_order_id: any, p_amount_kurus: 1, p_value_date: today, p_bank_reference: "x" },
      ],
      ["ops_payments", { p_org_id: org }],
      ["ops_payment_events", { p_payment_id: any }],
      ["ops_void_manual_payment", { p_payment_id: any, p_note: "x" }],
      ["ops_resolve_payment_review", { p_payment_id: any, p_succeeded: false, p_provider_ref: "" }],
      ["ops_request_refund", { p_payment_id: any, p_amount_kurus: 1, p_reason: "other" }],
      ["ops_refunds", { p_org_id: org }],
      ["ops_can_process_refund", { p_refund_id: any }],
      [
        "ops_complete_manual_refund",
        { p_refund_id: any, p_bank_reference: "x", p_completed_on: today },
      ],
      ["ops_cancel_refund", { p_refund_id: any }],
      ["ops_resolve_refund", { p_refund_id: any, p_succeeded: false }],
      ["ops_audit_events", { p_org_id: org }],
      ["ops_billing_setting", { p_org_id: org }],
      ["ops_save_billing_setting", { p_org_id: org, p_settings: { payment_due_days: 14 } }],
      [
        "ops_save_package",
        { p_org_id: org, p_package: { code: "yetkisiz", name: "x", periodic_visits_per_year: 1 } },
      ],
      ["ops_create_price_list_draft", { p_org_id: org }],
      [
        "ops_save_price_list_draft",
        {
          p_price_list_id: BILLING_SEED.priceListV2,
          p_valid_from: today,
          p_vat_rate_bp: 2000,
          p_note: "",
          p_items: [],
        },
      ],
      ["ops_publish_price_list", { p_price_list_id: BILLING_SEED.priceListV2 }],
      ["ops_delete_price_list_draft", { p_price_list_id: BILLING_SEED.priceListV2 }],
      ["ops_billing_profile", { p_org_id: org, p_user_id: CUSTOMER.id, p_reveal: true }],
      ["ops_customer_consents", { p_org_id: org, p_user_id: CUSTOMER.id }],
    ];
  };

  it.each(["field", "expert", "owner"] as const)(
    "%s@ gets nothing from the ops functions",
    async (who) => {
      const { client } = await signIn(who);
      for (const [fn, args] of calls()) {
        const { data, error } = await (
          client.rpc as unknown as (
            f: string,
            a: Record<string, unknown>,
          ) => Promise<{ data: unknown; error: { message: string } | null }>
        )(fn, args);
        const refused =
          error !== null ||
          data === null ||
          data === false ||
          (Array.isArray(data) && data.length === 0);
        expect(refused, `${who}: ${fn}`).toBe(true);
      }
      // The seed draft is untouched.
      const v2 = check(
        await admin.from("price_list").select("status").eq("id", BILLING_SEED.priceListV2).single(),
      );
      expect(v2.status).toBe("draft");
    },
  );
});
