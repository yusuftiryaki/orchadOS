import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "@/lib/supabase/types";
import {
  CONSENTS,
  check,
  createCustomer,
  istanbulToday,
  orderFor,
  removeCustomers,
  type TestCustomer,
} from "./billing-fixture";
import { BILLING_SEED, SEED, anonClient, serviceClient, signIn, signInCustomer } from "./fixtures";

// The billing functions of IP12-A2 through PostgREST, as a customer and as
// ops@ (docs/musteri-yonetimi.md §4–§5): application → quote → order →
// bank transfer → active order with its parcel → refund. Then the concurrency
// rule: a late card success and a bank transfer for the same order, at the
// same time, activate the order once and keep the paid amounts consistent; when
// both succeed the excess is refunded.

const DOMAIN = "billing-db-test.example.test";

let admin: Client;
let ops: Client;
let customer: TestCustomer;

beforeAll(async () => {
  admin = serviceClient();
  await removeCustomers(DOMAIN);
  ops = (await signIn("ops")).client;
  customer = await createCustomer(DOMAIN);
});

afterAll(() => removeCustomers(DOMAIN));

describe("prices", () => {
  it("anyone sees the packages and a preview; 20 dönüm standard, first year, is 24.480 TL", async () => {
    const prices = check(await anonClient().rpc("public_package_prices"));
    expect(prices.map((p) => p.code)).toEqual(["temel", "standart", "kapsamli"]);
    const { client } = await signInCustomer();
    const lines = check(
      await client.rpc("price_preview", {
        p_package_id: BILLING_SEED.packages.standart,
        p_areas_m2: [20000],
      }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      billable_area_tenths: 200,
      inventory_fee_kurus: 600000,
      line_total_kurus: 2448000,
      price_list_version: 1,
    });
  });
});

describe("application to active order", () => {
  let order: string;
  let payment: string;

  it("ops quotes the verified area and the customer accepts", async () => {
    const created = await orderFor(customer, 20000);
    order = created.order;
    const row = check(
      await customer.client
        .from("service_order")
        .select("number, status, total_kurus, paid_kurus")
        .eq("id", order)
        .single(),
    );
    expect(row).toMatchObject({ status: "awaiting_payment", total_kurus: 2448000, paid_kurus: 0 });
    expect(row.number).toMatch(/^S-\d{4}-\d{6}$/);

    const again = await customer.client.rpc("customer_accept_quote", {
      p_quote_id: created.quote,
      p_consents: CONSENTS,
    });
    expect(again.error?.message).toBe("quote_not_open");

    const instructions = check(
      await customer.client.rpc("customer_payment_instructions", { p_order_id: order }),
    );
    expect(instructions[0]).toMatchObject({ reference: row.number, outstanding_kurus: 2448000 });
  });

  it("the customer cannot read internal columns", async () => {
    const res = await customer.client.from("service_application").select("ops_note");
    expect(res.error?.code).toBe("42501");
  });

  it("a partial transfer keeps the order waiting, the rest activates it with a parcel", async () => {
    const tooMuch = await ops.rpc("ops_record_manual_payment", {
      p_order_id: order,
      p_amount_kurus: 2448001,
      p_value_date: istanbulToday(),
      p_bank_reference: "EFT-1",
    });
    expect(tooMuch.error?.message).toBe("amount_exceeds_balance");

    const today = istanbulToday();
    check(
      await ops.rpc("ops_record_manual_payment", {
        p_order_id: order,
        p_amount_kurus: 200000,
        p_value_date: today,
        p_bank_reference: "EFT-1",
      }),
    );
    let row = check(
      await admin.from("service_order").select("status, paid_kurus").eq("id", order).single(),
    );
    expect(row).toEqual({ status: "awaiting_payment", paid_kurus: 200000 });

    payment = check(
      await ops.rpc("ops_record_manual_payment", {
        p_order_id: order,
        p_amount_kurus: 2248000,
        p_value_date: today,
        p_bank_reference: "EFT-2",
      }),
    );
    row = check(
      await admin.from("service_order").select("status, paid_kurus").eq("id", order).single(),
    );
    expect(row).toEqual({ status: "active", paid_kurus: 2448000 });

    const items = check(
      await customer.client.from("service_order_item").select("parcel_id").eq("order_id", order),
    );
    expect(items).toHaveLength(1);
    const parcel = check(
      await customer.client
        .from("parcel")
        .select("id, status, name")
        .eq("id", items[0].parcel_id!)
        .single(),
    );
    expect(parcel).toMatchObject({ status: "registered", name: "Test bahçesi" });
    const boundary = check(
      await customer.client.from("boundary").select("version, source").eq("parcel_id", parcel.id),
    );
    expect(boundary).toEqual([{ version: 1, source: "owner_declared" }]);

    const receipt = check(
      await customer.client.rpc("receipt_data", { p_payment_id: payment }),
    ) as Record<string, unknown>;
    expect(receipt).toMatchObject({
      amount_kurus: 2248000,
      provider: "manual",
      bank_reference: "EFT-2",
    });
    expect(String(receipt.receipt_number)).toMatch(/^M-\d{4}-\d{6}$/);
    const { client: other } = await signInCustomer();
    const foreign = await other.rpc("receipt_data", { p_payment_id: payment });
    expect(foreign.error).toBeNull();
    expect(foreign.data).toBeNull();

    const received = check(
      await admin.from("notification").select("template").eq("recipient_user_id", customer.id),
    ).map((n) => n.template);
    expect(received).toEqual(expect.arrayContaining(["quote_ready", "payment_received"]));
  });

  it("a transfer refund is requested and completed by ops", async () => {
    const ids = check(
      await ops.rpc("ops_request_refund", {
        p_payment_id: payment,
        p_amount_kurus: 50000,
        p_reason: "goodwill",
      }),
    );
    expect(ids).toHaveLength(1);
    const refund = check(
      await admin.from("refund").select("kind, status").eq("id", ids[0]).single(),
    );
    expect(refund).toEqual({ kind: "manual", status: "requested" });

    const tooMuch = await ops.rpc("ops_request_refund", {
      p_payment_id: payment,
      p_amount_kurus: 2198001,
      p_reason: "goodwill",
    });
    expect(tooMuch.error?.message).toBe("refund_exceeds_payment");

    check(
      await ops.rpc("ops_complete_manual_refund", {
        p_refund_id: ids[0],
        p_bank_reference: "IADE-1",
        p_completed_on: istanbulToday(),
      }),
    );
    const paid = check(
      await admin.from("payment").select("refunded_kurus").eq("id", payment).single(),
    );
    expect(paid.refunded_kurus).toBe(50000);
    const row = check(
      await admin.from("service_order").select("refunded_kurus").eq("id", order).single(),
    );
    expect(row.refunded_kurus).toBe(50000);
    const notes = check(
      await admin
        .from("notification")
        .select("template, vars")
        .eq("recipient_user_id", customer.id)
        .eq("template", "refund_completed"),
    );
    expect(notes).toHaveLength(1);
  });
});

describe("concurrency", () => {
  // A card attempt whose token has run out (no longer live, so a transfer may
  // be recorded) is approved late while ops records the transfer.
  async function race() {
    const { order } = await orderFor(customer, 20000);
    const begun = check(
      await admin.rpc("payment_begin", {
        p_order_id: order,
        p_user_id: customer.id,
        p_provider: "fake",
        p_return_origin: "http://127.0.0.1:3100",
      }),
    ) as { payment_id: string; amount_kurus: number };
    check(
      await admin.rpc("payment_attach_token", {
        p_payment_id: begun.payment_id,
        p_token: `fake_${begun.payment_id}_${Math.random().toString(36).slice(2, 12)}`,
        p_expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    const [card, transfer] = await Promise.all([
      admin.rpc("payment_finalize", {
        p_payment_id: begun.payment_id,
        p_outcome: "succeeded",
        p_result: {
          provider_payment_id: `fake_pay_${begun.payment_id}`,
          provider_amount_kurus: begun.amount_kurus,
          paid_kurus: begun.amount_kurus,
          installment: 1,
          card_association: "FAKE",
          card_family: "Sahte",
          card_last4: "0000",
          fraud_status: 1,
          failure_code: null,
          items: [],
        },
      }),
      ops.rpc("ops_record_manual_payment", {
        p_order_id: order,
        p_amount_kurus: begun.amount_kurus,
        p_value_date: istanbulToday(),
        p_bank_reference: "EFT-YARIS",
      }),
    ]);
    return { order, card, transfer, cardPayment: begun.payment_id };
  }

  it("activates once and keeps paid amounts consistent", async () => {
    for (let round = 0; round < 6; round++) {
      const { order, card, transfer, cardPayment } = await race();
      expect(card.error).toBeNull();
      expect(card.data).toBe("succeeded");
      if (transfer.error) expect(transfer.error.message).toBe("order_not_payable");

      const row = check(
        await admin
          .from("service_order")
          .select("status, total_kurus, paid_kurus")
          .eq("id", order)
          .single(),
      );
      const payments = check(
        await admin
          .from("payment")
          .select("id, status, amount_kurus")
          .eq("order_id", order)
          .eq("status", "succeeded"),
      );
      expect(row.status).toBe("active");
      expect(row.paid_kurus).toBe(payments.reduce((sum, p) => sum + p.amount_kurus, 0));
      const activations = check(
        await admin
          .from("audit_event")
          .select("id")
          .eq("entity_id", order)
          .eq("action", "order.activated"),
      );
      expect(activations).toHaveLength(1);
      const parcels = check(
        await admin.from("service_order_item").select("parcel_id").eq("order_id", order),
      );
      expect(parcels.every((p) => p.parcel_id !== null)).toBe(true);

      const refunds = check(
        await admin.from("refund").select("payment_id, reason, amount_kurus").eq("order_id", order),
      );
      if (transfer.error) {
        expect(payments).toHaveLength(1);
        expect(row.paid_kurus).toBe(row.total_kurus);
        expect(refunds).toEqual([]);
      } else {
        expect(payments).toHaveLength(2);
        expect(row.paid_kurus).toBe(2 * row.total_kurus);
        // The card success came last: its whole amount is the excess.
        expect(refunds).toEqual([
          { payment_id: cardPayment, reason: "overpayment", amount_kurus: row.total_kurus },
        ]);
      }
    }
  });
});

describe("cancellation", () => {
  it("is refused while a card attempt is live and allowed once it is gone", async () => {
    const { order } = await orderFor(customer, 20000);
    const begun = check(
      await admin.rpc("payment_begin", {
        p_order_id: order,
        p_user_id: customer.id,
        p_provider: "fake",
        p_return_origin: "http://127.0.0.1:3100",
      }),
    ) as { payment_id: string };
    check(
      await admin.rpc("payment_attach_token", {
        p_payment_id: begun.payment_id,
        p_token: `fake_${begun.payment_id}_${Math.random().toString(36).slice(2, 12)}`,
        p_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      }),
    );
    const refused = await customer.client.rpc("customer_cancel_order", { p_order_id: order });
    expect(refused.error?.message).toBe("payment_in_progress");
    const manual = await ops.rpc("ops_record_manual_payment", {
      p_order_id: order,
      p_amount_kurus: 1000,
      p_value_date: istanbulToday(),
      p_bank_reference: "EFT-3",
    });
    expect(manual.error?.message).toBe("payment_in_progress");

    check(
      await admin.rpc("payment_finalize", {
        p_payment_id: begun.payment_id,
        p_outcome: "failed",
        p_result: { failure_code: "card_declined" },
      }),
    );
    check(await customer.client.rpc("customer_cancel_order", { p_order_id: order }));
    const row = check(
      await admin.from("service_order").select("status, cancel_reason").eq("id", order).single(),
    );
    expect(row).toEqual({ status: "cancelled", cancel_reason: "customer_cancelled" });

    const summary = check(await ops.rpc("ops_billing_summary", { p_org_id: SEED.org }));
    expect(summary).toHaveLength(1);
  });
});
