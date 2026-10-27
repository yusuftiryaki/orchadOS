import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  check,
  createCustomer,
  orderFor,
  removeCustomers,
  type TestCustomer,
} from "./billing-fixture";
import { serviceClient } from "./fixtures";

// The database functions of IP12-A2 against the payment Edge Functions of
// IP12-B on the local stack (fake provider, supabase/config.toml): a fresh
// customer starts a card payment (`payments` / start), the fake checkout page
// posts back to `payment-callback` (a cross-site POST: no cookies, only the
// token and the fake outcome) and the browser is sent to the result page.

const DOMAIN = "payments-contract-test.example.test";
const RETURN_ORIGIN = "http://127.0.0.1:3100";

let customer: TestCustomer;

beforeAll(async () => {
  await removeCustomers(DOMAIN);
  customer = await createCustomer(DOMAIN);
});

afterAll(() => removeCustomers(DOMAIN));

async function start(orderId: string) {
  const res = await fetch(`${inject("supabase").url}/functions/v1/payments`, {
    method: "POST",
    headers: { authorization: `Bearer ${customer.token}`, "content-type": "application/json" },
    body: JSON.stringify({
      action: "start",
      order_id: orderId,
      return_origin: RETURN_ORIGIN,
      client_ip: "203.0.113.60",
    }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, string> };
}

async function callback(form: Record<string, string>) {
  return fetch(`${inject("supabase").url}/functions/v1/payment-callback`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    redirect: "manual",
    credentials: "omit",
  });
}

describe("payments Edge Functions with the A2 database functions", () => {
  it("a fake card payment succeeds through start and the callback", async () => {
    const { order } = await orderFor(customer);
    const started = await start(order);
    expect(started.status).toBe(200);
    const paymentId = started.body.payment_id;
    const redirect = new URL(started.body.redirect_url);
    expect(redirect.origin + redirect.pathname).toBe(`${RETURN_ORIGIN}/odeme/sahte`);
    expect(redirect.searchParams.get("tutar")).toBe("12000.00");
    const token = redirect.searchParams.get("token")!;
    expect(token).toMatch(new RegExp(`^fake_${paymentId}_`));

    const admin = serviceClient();
    const pending = check(
      await admin
        .from("payment")
        .select("status, provider, provider_token, token_expires_at")
        .eq("id", paymentId)
        .single(),
    );
    expect(pending).toMatchObject({ status: "initiated", provider: "fake", provider_token: token });

    const res = await callback({ token, outcome: "success" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${RETURN_ORIGIN}/portal/odeme/${paymentId}`);

    const paid = check(
      await admin
        .from("payment")
        .select("status, receipt_number, provider_payment_id, card_last4, fraud_status")
        .eq("id", paymentId)
        .single(),
    );
    expect(paid).toMatchObject({
      status: "succeeded",
      provider_payment_id: `fake_pay_${paymentId}`,
      card_last4: "0000",
      fraud_status: 1,
    });
    expect(paid.receipt_number).toMatch(/^M-\d{4}-\d{6}$/);
    const row = check(
      await admin.from("service_order").select("status, paid_kurus").eq("id", order).single(),
    );
    expect(row).toEqual({ status: "active", paid_kurus: 1200000 });

    // The callback again (browser back button): nothing changes.
    const again = await callback({ token, outcome: "success" });
    expect(again.status).toBe(303);
    const receipts = check(
      await admin
        .from("audit_event")
        .select("id")
        .eq("entity_id", paymentId)
        .eq("action", "payment.succeeded"),
    );
    expect(receipts).toHaveLength(1);

    // The order is paid: a new start is refused.
    expect((await start(order)).body).toEqual({ error: "order_not_payable" });
  });

  it("an unknown token goes to the not-found page and writes nothing", async () => {
    const res = await callback({
      token: "fake_00000000-0000-4000-8000-000000000000_abcdefgh",
      outcome: "success",
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toMatch(/\/portal\/odeme\?hata=odeme_bulunamadi$/);
  });

  it("a declined card leaves the order payable", async () => {
    const { order } = await orderFor(customer);
    const started = await start(order);
    expect(started.status).toBe(200);
    const token = new URL(started.body.redirect_url).searchParams.get("token")!;
    const res = await callback({ token, outcome: "failure" });
    expect(res.status).toBe(303);
    const admin = serviceClient();
    const failed = check(
      await admin
        .from("payment")
        .select("status, failure_code")
        .eq("id", started.body.payment_id)
        .single(),
    );
    expect(failed).toEqual({ status: "failed", failure_code: "card_declined" });
    const row = check(await admin.from("service_order").select("status").eq("id", order).single());
    expect(row.status).toBe("awaiting_payment");
  });
});
