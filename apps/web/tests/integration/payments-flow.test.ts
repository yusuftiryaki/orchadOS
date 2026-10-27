import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { BILLING_COLUMNS } from "@/lib/billing/columns";
import type { Client } from "@/lib/supabase/types";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { parseGardenForm } from "@/lib/portal-billing/validation";
import {
  check,
  createCustomer,
  GARDEN_DETAIL,
  orderFor,
  removeCustomers,
  type TestCustomer,
} from "./billing-fixture";
import { PASSWORD, SEED, serviceClient, signIn } from "./fixtures";

// The customer portal's whole payment path (IP12-D) against the local stack:
// the same database functions and Edge Functions the portal's server actions
// call, in the order a customer meets them. A fresh account fills its billing
// profile, a draft with one garden (parsed by the portal's form parser) and
// submits; ops verifies and quotes; the customer accepts and pays by the fake
// card; the provider's cookieless callback finalizes. Then: repeated
// callbacks, a declined card, a refund, the reconcile job, and what other
// users can see.

const DOMAIN = "payments-flow-test.example.test";
const RETURN_ORIGIN = "http://127.0.0.1:3100";
const options = { auth: { persistSession: false, autoRefreshToken: false } };

const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

let customer: TestCustomer;
let other: TestCustomer;

// A customer with an owner profile but no billing profile: the portal fills
// that in itself.
async function freshCustomer(): Promise<TestCustomer> {
  const admin = serviceClient();
  const email = `flow-${digits(8)}@${DOMAIN}`;
  const phone = `+90555${digits(7)}`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    phone: phone.slice(1),
    phone_confirm: true,
  });
  if (created.error) throw created.error;
  const id = created.data.user.id;
  const { client: ops } = await signIn("ops");
  check(
    await ops.rpc("ops_create_owner_profile", {
      p_org_id: SEED.org,
      p_user_id: id,
      p_full_name: "Akış Müşteri",
      p_contact_preference: "sms",
      p_kvkk_consent: true,
      p_phone: phone,
      p_kvkk_consent_at: new Date().toISOString(),
      p_kvkk_text_version: LEGAL_TEXT_VERSIONS.kvkk_notice,
    }),
  );
  const env = inject("supabase");
  const client = createClient<Database>(env.url, env.anonKey, options);
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signedIn.error) throw signedIn.error;
  return { id, email, client, token: signedIn.data.session.access_token };
}

beforeAll(async () => {
  await removeCustomers(DOMAIN);
  customer = await freshCustomer();
  other = await createCustomer(DOMAIN);
});

afterAll(() => removeCustomers(DOMAIN));

const fn = (name: string) => `${inject("supabase").url}/functions/v1/${name}`;

async function start(token: string, orderId: string) {
  const res = await fetch(fn("payments"), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      action: "start",
      order_id: orderId,
      return_origin: RETURN_ORIGIN,
      client_ip: "203.0.113.70",
    }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, string> };
}

// The provider's browser return: a cross-site form POST, no cookies.
async function callback(form: Record<string, string>) {
  return fetch(fn("payment-callback"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
    redirect: "manual",
    credentials: "omit",
  });
}

async function paymentRow(id: string) {
  return check(
    await serviceClient()
      .from("payment")
      .select("status, receipt_number, failure_code, refunded_kurus, provider")
      .eq("id", id)
      .single(),
  );
}

const state = {
  application: "",
  garden: "",
  quote: "",
  order: "",
  payment: "",
};

describe("customer portal payment flow", () => {
  it("a fresh customer fills the billing profile, a draft with a garden and submits", async () => {
    const c = customer.client;
    check(
      await c.rpc("customer_save_billing_profile", {
        p_profile: {
          kind: "individual",
          first_name: "Akış",
          last_name: "Müşteri",
          address: "Cumhuriyet Mah. 3. Sok. No: 4",
          district: "Nizip",
          city: "Gaziantep",
          postal_code: "27700",
        },
      }),
    );
    const profile = check(await c.rpc("my_billing_profile"))[0];
    expect(profile).toMatchObject({ has_profile: true, identity_number_required: false });

    state.application = check(
      await c.rpc("customer_create_application", {
        p_package_id: "91200000-0000-4000-8000-000000000001",
      }),
    );
    // The open draft comes back instead of a second one.
    expect(
      check(
        await c.rpc("customer_create_application", {
          p_package_id: "91200000-0000-4000-8000-000000000001",
        }),
      ),
    ).toBe(state.application);

    const form: Record<string, string> = {
      name: "Akış bahçesi",
      province: "Gaziantep",
      district: "Nizip",
      village: "Test",
      area_donum: "20",
      irrigation: "rainfed",
      estimated_tree_count: "300",
      lon: "37.8",
      lat: "37.01",
      boundary: JSON.stringify([
        [37.799, 37.0095],
        [37.801, 37.0095],
        [37.801, 37.0105],
        [37.799, 37.0105],
      ]),
      authorization_basis: GARDEN_DETAIL.authorization_basis,
      is_shared_deed: "no",
      entry_permission: "on",
    };
    const parsed = parseGardenForm((name) => form[name] ?? "");
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    state.garden = check(
      await c.rpc("customer_save_application_garden", {
        p_application_id: state.application,
        p_garden: parsed.value.garden,
        p_detail: parsed.value.detail,
      }),
    );

    const preview = check(
      await c.rpc("price_preview", {
        p_package_id: "91200000-0000-4000-8000-000000000001",
        p_areas_m2: [20000],
      }),
    );
    expect(preview[0].line_total_kurus).toBe(1200000);

    check(await c.rpc("customer_submit_application", { p_application_id: state.application }));
    const app = check(
      await c
        .from("service_application")
        .select(BILLING_COLUMNS.service_application)
        .eq("id", state.application)
        .single(),
    );
    expect(app.status).toBe("submitted");
    expect(app.number).toMatch(/^B-\d{4}-\d{6}$/);
  });

  it("ops verifies the garden and quotes; the customer accepts", async () => {
    const { client: ops } = await signIn("ops");
    check(
      await ops.rpc("ops_verify_application_garden", {
        p_garden_id: state.garden,
        p_verified_area_m2: 20000,
      }),
    );
    state.quote = check(await ops.rpc("ops_issue_quote", { p_application_id: state.application }));
    const quote = check(
      await customer.client
        .from("quote")
        .select(BILLING_COLUMNS.quote)
        .eq("id", state.quote)
        .single(),
    );
    expect(quote).toMatchObject({ status: "issued", total_kurus: 1200000, vat_kurus: 200000 });

    // Without the contract consents the acceptance is refused.
    const refused = await customer.client.rpc("customer_accept_quote", {
      p_quote_id: state.quote,
      p_consents: { distance_sales: LEGAL_TEXT_VERSIONS.distance_sales },
    });
    expect(refused.error?.message).toBe("consent_required");

    state.order = check(
      await customer.client.rpc("customer_accept_quote", {
        p_quote_id: state.quote,
        p_consents: {
          distance_sales: LEGAL_TEXT_VERSIONS.distance_sales,
          pre_information: LEGAL_TEXT_VERSIONS.pre_information,
        },
      }),
    );
    const instructions = check(
      await customer.client.rpc("customer_payment_instructions", { p_order_id: state.order }),
    )[0];
    expect(instructions.outstanding_kurus).toBe(1200000);
  });

  it("the fake card payment succeeds through start and a cookieless callback", async () => {
    const started = await start(customer.token, state.order);
    expect(started.status).toBe(200);
    state.payment = started.body.payment_id;
    const token = new URL(started.body.redirect_url).searchParams.get("token")!;
    expect(new URL(started.body.redirect_url).pathname).toBe("/odeme/sahte");

    const res = await callback({ token, outcome: "success" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${RETURN_ORIGIN}/portal/odeme/${state.payment}`);

    const paid = await paymentRow(state.payment);
    expect(paid.status).toBe("succeeded");
    expect(paid.receipt_number).toMatch(/^M-\d{4}-\d{6}$/);

    const admin = serviceClient();
    const order = check(
      await admin.from("service_order").select("status, paid_kurus").eq("id", state.order).single(),
    );
    expect(order).toEqual({ status: "active", paid_kurus: 1200000 });

    // The garden became a registered parcel the customer owns.
    const item = check(
      await admin
        .from("service_order_item")
        .select("parcel_id")
        .eq("order_id", state.order)
        .single(),
    );
    expect(item.parcel_id).toBeTruthy();
    const parcel = check(
      await admin.from("parcel").select("status").eq("id", item.parcel_id!).single(),
    );
    expect(parcel.status).toBe("registered");
    const access = check(
      await admin
        .from("parcel_access")
        .select("role")
        .eq("parcel_id", item.parcel_id!)
        .eq("user_id", customer.id),
    );
    expect(access).toEqual([{ role: "owner" }]);
    const visible = check(
      await customer.client.from("parcel").select("id").eq("id", item.parcel_id!),
    );
    expect(visible).toHaveLength(1);

    const notifications = check(
      await admin
        .from("notification")
        .select("status")
        .eq("template", "payment_received")
        .eq("ref_id", state.payment),
    );
    expect(notifications).toEqual([{ status: "pending" }]);

    const audit = check(
      await admin
        .from("audit_event")
        .select("action")
        .in("entity_id", [state.payment, state.order]),
    ).map((a) => a.action);
    expect(audit).toContain("payment.succeeded");
    expect(audit).toContain("order.activated");

    // The receipt is the customer's.
    const receipt = check(
      await customer.client.rpc("receipt_data", { p_payment_id: state.payment }),
    ) as { receipt_number: string; paid_kurus: number };
    expect(receipt).toMatchObject({ receipt_number: paid.receipt_number, paid_kurus: 1200000 });
  });

  it("finalizing twice more changes nothing", async () => {
    const before = await paymentRow(state.payment);
    const token = check(
      await serviceClient()
        .from("payment")
        .select("provider_token")
        .eq("id", state.payment)
        .single(),
    ).provider_token!;
    for (let i = 0; i < 2; i++) {
      const res = await callback({ token, outcome: i === 0 ? "success" : "failure" });
      expect(res.status).toBe(303);
    }
    expect(await paymentRow(state.payment)).toEqual(before);
    const admin = serviceClient();
    expect(
      check(
        await admin
          .from("audit_event")
          .select("id")
          .eq("entity_id", state.payment)
          .eq("action", "payment.succeeded"),
      ),
    ).toHaveLength(1);
    expect(
      check(
        await admin
          .from("notification")
          .select("id")
          .eq("template", "payment_received")
          .eq("ref_id", state.payment),
      ),
    ).toHaveLength(1);
  });

  it("a declined card on a second order leaves it awaiting payment", async () => {
    const { order } = await orderFor(other);
    const started = await start(other.token, order);
    expect(started.status).toBe(200);
    const token = new URL(started.body.redirect_url).searchParams.get("token")!;
    const res = await callback({ token, outcome: "failure" });
    expect(res.status).toBe(303);
    expect(await paymentRow(started.body.payment_id)).toMatchObject({
      status: "failed",
      receipt_number: null,
    });
    const row = check(
      await serviceClient().from("service_order").select("status").eq("id", order).single(),
    );
    expect(row.status).toBe("awaiting_payment");
    // The order stays cancellable by the customer.
    check(await other.client.rpc("customer_cancel_order", { p_order_id: order }));
  });

  it("ops refunds part of the payment through the payments function", async () => {
    const { client: ops } = await signIn("ops");
    const items = check(
      await ops.from("payment_item").select("id").eq("payment_id", state.payment),
    );
    const refunds = check(
      await ops.rpc("ops_request_refund", {
        p_payment_id: state.payment,
        p_amount_kurus: 100000,
        p_reason: "goodwill",
        p_payment_item_id: items[0].id,
      }),
    );
    expect(refunds).toHaveLength(1);
    const { data: session } = await ops.auth.getSession();
    const res = await fetch(fn("payments"), {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.session!.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "refund", refund_id: refunds[0] }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "succeeded" });
    expect((await paymentRow(state.payment)).refunded_kurus).toBe(100000);
    const receipt = check(
      await customer.client.rpc("receipt_data", { p_payment_id: state.payment }),
    ) as { refunds: { amount_kurus: number }[] };
    expect(receipt.refunds.map((r) => r.amount_kurus)).toEqual([100000]);

    // A customer may not process refunds (ops_can_process_refund hides the
    // refund from them: 404, or 403).
    const denied = await fetch(fn("payments"), {
      method: "POST",
      headers: { authorization: `Bearer ${customer.token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "refund", refund_id: refunds[0] }),
    });
    expect([403, 404]).toContain(denied.status);
  });

  it("the reconcile job takes the cron secret and nothing else", async () => {
    const ok = await fetch(fn("payments"), {
      method: "POST",
      headers: { "x-orchados-cron-secret": "cron-local", "content-type": "application/json" },
      body: JSON.stringify({ action: "reconcile" }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      checked: expect.any(Number),
      finalized: expect.any(Number),
    });
    const wrong = await fetch(fn("payments"), {
      method: "POST",
      headers: { "x-orchados-cron-secret": "nope", "content-type": "application/json" },
      body: JSON.stringify({ action: "reconcile" }),
    });
    expect(wrong.status).toBe(401);
    // The settled payment is untouched.
    expect((await paymentRow(state.payment)).status).toBe("succeeded");
  });

  it("another customer and a co-owner see none of it", async () => {
    const { client: viewer } = await signIn("viewer");
    for (const client of [other.client, viewer] as Client[]) {
      for (const [table, id] of [
        ["service_application", state.application],
        ["quote", state.quote],
        ["service_order", state.order],
        ["payment", state.payment],
      ] as const) {
        const { data, error } = await client
          .from(table)
          .select(BILLING_COLUMNS[table])
          .eq("id", id);
        expect(error, table).toBeNull();
        expect(data, table).toEqual([]);
      }
      expect(
        check(await client.from("payment_item").select("id").eq("payment_id", state.payment)),
      ).toEqual([]);
      expect(
        check(await client.from("refund").select("id").eq("payment_id", state.payment)),
      ).toEqual([]);
      const receipt = await client.rpc("receipt_data", { p_payment_id: state.payment });
      expect(receipt.data).toBeNull();
      const instructions = await client.rpc("customer_payment_instructions", {
        p_order_id: state.order,
      });
      expect(instructions.data ?? []).toEqual([]);
    }
    // Nor can they pay it.
    expect((await start(other.token, state.order)).status).toBe(404);
  });
});
