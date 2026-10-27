import { describe, expect, it } from "vitest";
import {
  cronSecretMatches,
  handleCallback,
  handlePayments,
  handleWebhook,
  type HandlerDeps,
} from "../../../../../supabase/functions/_shared/payments/handlers.ts";
import { IYZICO_PATHS } from "../../../../../supabase/functions/_shared/payments/iyzico.ts";
import {
  hmacHex,
  ITEM_ID,
  jsonResponse,
  ORDER_ID,
  PAYMENT_ID,
  REFUND_ID,
  routedFetch,
  USER_ID,
} from "./helpers";

const SECRET = "sandbox-secret";
const BASE_ENV = {
  SUPABASE_URL: "http://kong:8000",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  PORTAL_BASE_URL: "https://portal.example.test",
  PAYMENT_RETURN_ORIGINS: "http://localhost:3000,https://orchados.vercel.app",
  PAYMENT_CALLBACK_URL: "https://x.supabase.co/functions/v1/payment-callback",
  ORCHADOS_CRON_SECRET: "cron-local",
  FAKE_WEBHOOK_SECRET: "fake-webhook-local",
  IYZICO_API_KEY: "sandbox-key",
  IYZICO_SECRET_KEY: SECRET,
  IYZICO_BASE_URL: "https://sandbox-api.iyzipay.com",
};
const IYZICO_ENV = { ...BASE_ENV, PAYMENT_PROVIDER: "iyzico" };
const FAKE_ENV = { ...BASE_ENV, PAYMENT_PROVIDER: "fake", PAYMENT_FAKE_ALLOWED: "1" };

const FAKE_TOKEN = `fake_${PAYMENT_ID}_abcdef0123456789`;

const row = (overrides: Record<string, unknown> = {}) => ({
  id: PAYMENT_ID,
  order_id: ORDER_ID,
  provider: "iyzico",
  status: "initiated",
  amount_kurus: 1200000,
  currency: "TRY",
  token_expires_at: "2026-10-27T10:30:00Z",
  return_origin: "https://orchados.vercel.app",
  ...overrides,
});

const BUYER = {
  id: USER_ID,
  first_name: "Ayşe",
  last_name: "Yılmaz",
  identity_number: "10000000146",
  email: "ayse@example.com",
  phone: "+905350000000",
  address: "Örnek Mah. 1",
  district: "Şahinbey",
  city: "Gaziantep",
  country: "Turkey",
  postal_code: null,
  registered_at: "2026-10-01T10:00:00Z",
};

const BEGIN = {
  payment_id: PAYMENT_ID,
  order_id: ORDER_ID,
  order_number: "S-2026-000001",
  amount_kurus: 1200000,
  currency: "TRY",
  items: [{ payment_item_id: ITEM_ID, line_no: 1, name: "Bahçe 1", amount_kurus: 1200000 }],
  buyer: BUYER,
  billing: {
    contact_name: "Ayşe Yılmaz",
    address: "Örnek Mah. 1",
    city: "Gaziantep",
    country: "Turkey",
    postal_code: null,
  },
};

function signedRetrieve(overrides: Record<string, unknown> = {}) {
  const r: Record<string, unknown> = {
    status: "success",
    paymentStatus: "SUCCESS",
    paymentId: "28000001",
    conversationId: PAYMENT_ID,
    basketId: ORDER_ID,
    currency: "TRY",
    price: 12000,
    paidPrice: 12000,
    installment: 1,
    fraudStatus: 1,
    token: "tok-1",
    lastFourDigits: "0008",
    binNumber: "552879",
    itemTransactions: [{ itemId: ITEM_ID, paymentTransactionId: "29000001", price: 12000 }],
    ...overrides,
  };
  r.signature = hmacHex(
    SECRET,
    [
      r.paymentStatus,
      r.paymentId,
      r.currency,
      r.basketId,
      r.conversationId,
      String(r.paidPrice),
      String(r.price),
      r.token,
    ].join(":"),
  );
  return r;
}

function setup(env: Record<string, string>, routes: Parameters<typeof routedFetch>[0]) {
  const { impl, calls } = routedFetch(routes);
  const logs: string[] = [];
  const deps: HandlerDeps = {
    env,
    fetchImpl: impl,
    now: () => new Date("2026-10-27T11:00:00Z"),
    log: (code) => logs.push(code),
  };
  const rpcCalls = (name: string) => calls.filter((c) => c.url.endsWith(`/rpc/${name}`));
  const writes = () =>
    calls.filter((c) =>
      /\/rpc\/payment_(record_event|finalize|attach_token|refund_report|refund_claim|begin)$/.test(
        c.url,
      ),
    );
  return { deps, calls, logs, rpcCalls, writes };
}

const post = (url: string, body: string, headers: Record<string, string> = {}) =>
  new Request(url, { method: "POST", body, headers });

const paymentsRequest = (body: unknown, headers: Record<string, string> = {}) =>
  post("http://edge/functions/v1/payments", JSON.stringify(body), {
    "content-type": "application/json",
    ...headers,
  });

// ------------------------------------------------------------------ reconcile

describe("reconcile", () => {
  it("compares the cron secret in constant time", async () => {
    expect(await cronSecretMatches("cron-local", "cron-local")).toBe(true);
    expect(await cronSecretMatches("cron-locaL", "cron-local")).toBe(false);
    expect(await cronSecretMatches(null, "cron-local")).toBe(false);
    expect(await cronSecretMatches("", "")).toBe(false);
    expect(await cronSecretMatches("x", undefined)).toBe(false);
  });

  it.each<Record<string, string>>([{}, { "x-orchados-cron-secret": "wrong" }])(
    "rejects %j with 401 and touches nothing",
    async (headers) => {
      const s = setup(IYZICO_ENV, {});
      const res = await handlePayments(paymentsRequest({ action: "reconcile" }, headers), s.deps);
      expect(res.status).toBe(401);
      expect(s.calls).toHaveLength(0);
    },
  );

  it("ends a token-less initiated attempt as failed (start_incomplete)", async () => {
    const rows = [
      { ...row(), provider_token: null, token_expires_at: null },
      // Manual payments have no token and are left to ops.
      {
        ...row({ id: "a0000000-0000-4000-8000-000000000009", provider: "manual" }),
        provider_token: null,
        token_expires_at: null,
      },
    ];
    const s = setup(IYZICO_ENV, {
      "/rpc/payment_attempts_to_reconcile": () => jsonResponse(rows),
      "/rpc/payment_finalize": () => jsonResponse("ok"),
    });
    const res = await handlePayments(
      paymentsRequest({ action: "reconcile" }, { "x-orchados-cron-secret": "cron-local" }),
      s.deps,
    );
    expect(await res.json()).toEqual({ checked: 0, finalized: 1 });
    const fin = s.rpcCalls("payment_finalize").map((c) => c.body);
    expect(fin).toEqual([
      expect.objectContaining({
        p_payment_id: PAYMENT_ID,
        p_outcome: "failed",
        p_result: expect.objectContaining({ failure_code: "start_incomplete" }),
      }),
    ]);
    expect(s.calls.some((c) => c.url.includes("iyzipay"))).toBe(false);
  });

  it("confirms open attempts and expires old unfinished ones", async () => {
    const rows = [
      // Paid: finalized as succeeded.
      { ...row(), provider_token: "tok-1" },
      // Never paid, token expired 30 minutes ago: expired.
      {
        ...row({ id: "a0000000-0000-4000-8000-000000000001" }),
        provider_token: "tok-2",
        token_expires_at: "2026-10-27T10:30:00Z",
      },
      // Never paid, token expired 2 minutes ago: left alone.
      {
        ...row({ id: "a0000000-0000-4000-8000-000000000002" }),
        provider_token: "tok-3",
        token_expires_at: "2026-10-27T10:58:00Z",
      },
      // Fake row while the fake provider is locked: skipped.
      {
        ...row({ id: "a0000000-0000-4000-8000-000000000003", provider: "fake" }),
        provider_token: FAKE_TOKEN,
      },
    ];
    const s = setup(IYZICO_ENV, {
      "/rpc/payment_attempts_to_reconcile": () => jsonResponse(rows),
      "/rpc/payment_record_event": () => jsonResponse(true),
      "/rpc/payment_finalize": () => jsonResponse("ok"),
      [IYZICO_PATHS.retrieve]: (body) => {
        const token = (body as { token: string }).token;
        return jsonResponse(
          token === "tok-1"
            ? signedRetrieve()
            : { status: "success", paymentStatus: "INIT_THREEDS", token },
        );
      },
    });
    const res = await handlePayments(
      paymentsRequest({ action: "reconcile" }, { "x-orchados-cron-secret": "cron-local" }),
      s.deps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 3, finalized: 2 });
    const finalized = s
      .rpcCalls("payment_finalize")
      .map((c) => c.body as { p_payment_id: string; p_outcome: string });
    expect(finalized.map((b) => [b.p_payment_id, b.p_outcome])).toEqual([
      [PAYMENT_ID, "succeeded"],
      ["a0000000-0000-4000-8000-000000000001", "expired"],
    ]);
    const events = s
      .rpcCalls("payment_record_event")
      .map((c) => c.body as { p_event_type: string; p_dedup_key: string });
    expect(events[0]).toMatchObject({
      p_event_type: "reconcile",
      p_dedup_key: "retrieve:tok-1:succeeded",
    });
  });
});

// ------------------------------------------------------------------ webhook

describe("webhook", () => {
  const body = {
    iyziEventType: "CHECKOUT_FORM_AUTH",
    iyziReferenceCode: "ref-1",
    iyziPaymentId: 28000001,
    token: "tok-1",
    paymentConversationId: PAYMENT_ID,
    status: "SUCCESS",
  };
  const raw = JSON.stringify(body);
  const sig = hmacHex(SECRET, `${SECRET}CHECKOUT_FORM_AUTH28000001tok-1${PAYMENT_ID}SUCCESS`);
  const webhook = (b: string, headers: Record<string, string>) =>
    post("http://edge/functions/v1/payment-webhook", b, {
      "content-type": "application/json",
      ...headers,
    });

  it.each([
    [
      "an invalid signature",
      { "x-iyz-signature-v3": "00".repeat(32) },
      "webhook_signature_invalid",
    ],
    ["a missing signature", {}, "webhook_signature_missing"],
    ["a fake signature while fake is locked", { "x-fake-signature": "00" }, "webhook_fake_locked"],
  ])("%s: 401 and nothing is written", async (_name, headers, logged) => {
    const s = setup(IYZICO_ENV, {});
    const res = await handleWebhook(webhook(raw, headers), s.deps);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid_signature" });
    expect(s.calls).toHaveLength(0);
    expect(s.logs).toEqual([logged]);
  });

  it("a valid notification is recorded, confirmed and finalized", async () => {
    const s = setup(IYZICO_ENV, {
      "/rpc/payment_by_token": () => jsonResponse([row()]),
      "/rpc/payment_record_event": () => jsonResponse(true),
      "/rpc/payment_finalize": () => jsonResponse("ok"),
      [IYZICO_PATHS.retrieve]: () => jsonResponse(signedRetrieve()),
    });
    const res = await handleWebhook(webhook(raw, { "x-iyz-signature-v3": sig }), s.deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const events = s.rpcCalls("payment_record_event").map((c) => c.body as Record<string, unknown>);
    expect(events[0]).toMatchObject({
      p_event_type: "webhook",
      p_dedup_key: "wh:ref-1:CHECKOUT_FORM_AUTH:SUCCESS",
      p_payment_id: PAYMENT_ID,
      p_signature_valid: true,
    });
    expect(events[1]).toMatchObject({
      p_event_type: "retrieve",
      p_dedup_key: "retrieve:tok-1:succeeded",
    });
    // No card BIN or token in the stored payload.
    expect(JSON.stringify(events)).not.toContain("552879");
    expect(JSON.stringify(events.map((e) => e.p_payload))).not.toContain("tok-1");
    const fin = s.rpcCalls("payment_finalize")[0].body as {
      p_outcome: string;
      p_result: Record<string, unknown>;
    };
    expect(fin.p_outcome).toBe("succeeded");
    expect(fin.p_result).toMatchObject({
      provider_payment_id: "28000001",
      provider_amount_kurus: 1200000,
      paid_kurus: 1200000,
      card_last4: "0008",
      fraud_status: 1,
      items: [{ payment_item_id: ITEM_ID, provider_item_id: "29000001" }],
    });
  });

  it("a pending_review payment confirmed as pending_review again is not re-finalized", async () => {
    const s = setup(IYZICO_ENV, {
      "/rpc/payment_by_token": () => jsonResponse([row({ status: "pending_review" })]),
      "/rpc/payment_record_event": () => jsonResponse(true),
      "/rpc/payment_finalize": () => jsonResponse("ok"),
      [IYZICO_PATHS.retrieve]: () => jsonResponse(signedRetrieve({ fraudStatus: 0 })),
    });
    const res = await handleWebhook(webhook(raw, { "x-iyz-signature-v3": sig }), s.deps);
    expect(res.status).toBe(200);
    expect(s.rpcCalls("payment_finalize")).toHaveLength(0);
  });

  it("a duplicate notification is acknowledged without processing", async () => {
    const s = setup(IYZICO_ENV, {
      "/rpc/payment_by_token": () => jsonResponse([row()]),
      "/rpc/payment_record_event": () => jsonResponse(false),
    });
    const res = await handleWebhook(webhook(raw, { "x-iyz-signature-v3": sig }), s.deps);
    expect(res.status).toBe(200);
    expect(s.rpcCalls("payment_finalize")).toHaveLength(0);
    expect(s.calls.some((c) => c.url.includes("iyzipay"))).toBe(false);
  });

  it("a signed fake notification is processed only with both flags", async () => {
    const fakeBody = JSON.stringify({ token: FAKE_TOKEN, outcome: "success" });
    const headers = { "x-fake-signature": hmacHex("fake-webhook-local", fakeBody) };
    const routes = {
      "/rpc/payment_by_token": () => jsonResponse([row({ provider: "fake" })]),
      "/rpc/payment_record_event": () => jsonResponse(true),
      "/rpc/payment_finalize": () => jsonResponse("ok"),
    };
    const locked = setup({ ...FAKE_ENV, PAYMENT_FAKE_ALLOWED: "" }, routes);
    expect((await handleWebhook(webhook(fakeBody, headers), locked.deps)).status).toBe(401);
    expect(locked.calls).toHaveLength(0);

    const open = setup(FAKE_ENV, routes);
    expect((await handleWebhook(webhook(fakeBody, headers), open.deps)).status).toBe(200);
    expect((open.rpcCalls("payment_finalize")[0].body as { p_outcome: string }).p_outcome).toBe(
      "succeeded",
    );
  });
});

// ------------------------------------------------------------------ callback

describe("callback", () => {
  const callback = (form: Record<string, string>) =>
    post("http://edge/functions/v1/payment-callback", new URLSearchParams(form).toString(), {
      "content-type": "application/x-www-form-urlencoded",
    });

  it("an unknown token goes to the not-found page and writes nothing", async () => {
    const s = setup(IYZICO_ENV, { "/rpc/payment_by_token": () => jsonResponse([]) });
    const res = await handleCallback(callback({ token: "nope" }), s.deps);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(
      "https://portal.example.test/portal/odeme?hata=odeme_bulunamadi",
    );
    expect(s.writes()).toHaveLength(0);
  });

  it("a fake payment is refused unless both flags are set", async () => {
    for (const env of [
      IYZICO_ENV,
      { ...BASE_ENV, PAYMENT_PROVIDER: "fake" },
      { ...BASE_ENV, PAYMENT_PROVIDER: "iyzico", PAYMENT_FAKE_ALLOWED: "1" },
    ]) {
      const s = setup(env, {
        "/rpc/payment_by_token": () => jsonResponse([row({ provider: "fake" })]),
      });
      const res = await handleCallback(callback({ token: FAKE_TOKEN, outcome: "success" }), s.deps);
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toBe(
        "https://portal.example.test/portal/odeme?hata=odeme_bulunamadi",
      );
      expect(s.writes()).toHaveLength(0);
    }
  });

  it.each([
    ["success", "succeeded"],
    ["failure", "failed"],
    ["review", "pending_review"],
  ])("fake outcome %s is finalized as %s", async (outcome, finalized) => {
    const s = setup(FAKE_ENV, {
      "/rpc/payment_by_token": () =>
        jsonResponse([row({ provider: "fake", return_origin: "http://localhost:3000" })]),
      "/rpc/payment_record_event": () => jsonResponse(true),
      "/rpc/payment_finalize": () => jsonResponse("ok"),
    });
    const res = await handleCallback(callback({ token: FAKE_TOKEN, outcome }), s.deps);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`http://localhost:3000/portal/odeme/${PAYMENT_ID}`);
    expect((s.rpcCalls("payment_finalize")[0].body as { p_outcome: string }).p_outcome).toBe(
      finalized,
    );
    expect(s.rpcCalls("payment_record_event")[0].body).toMatchObject({
      p_event_type: "callback",
      p_dedup_key: `retrieve:${FAKE_TOKEN}:${finalized}`,
    });
  });

  it("not_completed on the callback is written as failed (not_completed)", async () => {
    const s = setup(IYZICO_ENV, {
      "/rpc/payment_by_token": () => jsonResponse([row()]),
      "/rpc/payment_record_event": () => jsonResponse(true),
      "/rpc/payment_finalize": () => jsonResponse("ok"),
      [IYZICO_PATHS.retrieve]: () =>
        jsonResponse({ status: "success", paymentStatus: "INIT_THREEDS", token: "tok-1" }),
    });
    const res = await handleCallback(
      post("http://edge/functions/v1/payment-callback", JSON.stringify({ token: "tok-1" }), {
        "content-type": "application/json",
      }),
      s.deps,
    );
    expect(res.headers.get("location")).toBe(
      `https://orchados.vercel.app/portal/odeme/${PAYMENT_ID}`,
    );
    const fin = s.rpcCalls("payment_finalize")[0].body as {
      p_outcome: string;
      p_result: { failure_code: string };
    };
    expect(fin).toMatchObject({ p_outcome: "failed", p_result: { failure_code: "not_completed" } });
  });

  it.each<[string, () => Response]>([
    [
      "an HTTP 500 with a JSON failure body",
      () => jsonResponse({ status: "failure", errorCode: "1" }, 500),
    ],
    [
      "an API error answered with HTTP 200",
      () => jsonResponse({ status: "failure", errorCode: "5115" }),
    ],
    ["a success without paymentStatus", () => jsonResponse({ status: "success", token: "tok-1" })],
  ])("%s on the callback leaves the attempt open", async (_name, answer) => {
    const s = setup(IYZICO_ENV, {
      "/rpc/payment_by_token": () => jsonResponse([row()]),
      "/rpc/payment_record_event": () => jsonResponse(true),
      "/rpc/payment_finalize": () => jsonResponse("ok"),
      [IYZICO_PATHS.retrieve]: answer,
    });
    const res = await handleCallback(callback({ token: "tok-1" }), s.deps);
    expect(res.headers.get("location")).toBe(
      `https://orchados.vercel.app/portal/odeme/${PAYMENT_ID}`,
    );
    expect(s.rpcCalls("payment_finalize")).toHaveLength(0);
  });

  it("a pending_review payment is neither asked again nor finalized", async () => {
    const s = setup(IYZICO_ENV, {
      "/rpc/payment_by_token": () => jsonResponse([row({ status: "pending_review" })]),
      [IYZICO_PATHS.retrieve]: () =>
        jsonResponse({ status: "success", paymentStatus: "INIT_THREEDS", token: "tok-1" }),
    });
    for (let i = 0; i < 3; i++) {
      const res = await handleCallback(callback({ token: "tok-1" }), s.deps);
      expect(res.headers.get("location")).toBe(
        `https://orchados.vercel.app/portal/odeme/${PAYMENT_ID}`,
      );
    }
    expect(s.calls.every((c) => c.url.endsWith("/rpc/payment_by_token"))).toBe(true);
    expect(s.writes()).toHaveLength(0);
  });

  it("an already final payment is not asked again", async () => {
    const s = setup(IYZICO_ENV, {
      "/rpc/payment_by_token": () => jsonResponse([row({ status: "succeeded" })]),
    });
    const res = await handleCallback(callback({ token: "tok-1" }), s.deps);
    expect(res.headers.get("location")).toBe(
      `https://orchados.vercel.app/portal/odeme/${PAYMENT_ID}`,
    );
    expect(s.calls).toHaveLength(1);
  });
});

// ------------------------------------------------------------------ start

describe("start", () => {
  const auth = { authorization: "Bearer customer-jwt" };
  const startBody = {
    action: "start",
    order_id: ORDER_ID,
    return_origin: "http://localhost:3000",
    client_ip: "203.0.113.7",
  };
  const userRoute = { "/auth/v1/user": () => jsonResponse({ id: USER_ID }) };

  it("401 without a valid user", async () => {
    const s = setup(FAKE_ENV, { "/auth/v1/user": () => jsonResponse({ message: "invalid" }, 401) });
    expect((await handlePayments(paymentsRequest(startBody, auth), s.deps)).status).toBe(401);
    expect((await handlePayments(paymentsRequest(startBody), s.deps)).status).toBe(401);
    expect(s.writes()).toHaveLength(0);
  });

  it("503 when no provider is configured", async () => {
    const s = setup({ ...BASE_ENV, PAYMENT_PROVIDER: "" }, userRoute);
    const res = await handlePayments(paymentsRequest(startBody, auth), s.deps);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "payments_disabled" });
  });

  it.each([
    { return_origin: "https://evil.example" },
    { return_origin: "http://localhost:3000/portal" },
    { order_id: "not-a-uuid" },
    { client_ip: "<script>" },
  ])("400 for %j", async (override) => {
    const s = setup(FAKE_ENV, userRoute);
    const res = await handlePayments(paymentsRequest({ ...startBody, ...override }, auth), s.deps);
    expect(res.status).toBe(400);
    expect(s.writes()).toHaveLength(0);
  });

  it.each([
    ["order_not_payable", 409, "order_not_payable"],
    ["billing_profile_incomplete", 409, "billing_profile_incomplete"],
    ["not_found", 404, "not_found"],
    ["fake_payments_disabled", 503, "payments_disabled"],
  ])("payment_begin %s -> %d", async (code, status, error) => {
    const s = setup(FAKE_ENV, {
      ...userRoute,
      "/rpc/payment_begin": () => jsonResponse({ code: "P0001", message: code }, 400),
    });
    const res = await handlePayments(paymentsRequest(startBody, auth), s.deps);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: error });
  });

  it("starts a fake checkout", async () => {
    const s = setup(FAKE_ENV, {
      ...userRoute,
      "/rpc/payment_begin": () => jsonResponse(BEGIN),
      "/rpc/payment_record_event": () => jsonResponse(true),
      "/rpc/payment_attach_token": () => new Response(null, { status: 204 }),
    });
    const res = await handlePayments(paymentsRequest(startBody, auth), s.deps);
    expect(res.status).toBe(200);
    const out = (await res.json()) as { payment_id: string; redirect_url: string };
    expect(out.payment_id).toBe(PAYMENT_ID);
    expect(out.redirect_url.startsWith("http://localhost:3000/odeme/sahte?token=fake_")).toBe(true);
    expect(s.rpcCalls("payment_begin")[0].body).toEqual({
      p_order_id: ORDER_ID,
      p_user_id: USER_ID,
      p_provider: "fake",
      p_return_origin: "http://localhost:3000",
    });
    expect(s.rpcCalls("payment_record_event")[0].body).toMatchObject({
      p_event_type: "initialize",
      p_dedup_key: `init:${PAYMENT_ID}`,
    });
    expect((s.rpcCalls("payment_attach_token")[0].body as { p_token: string }).p_token).toMatch(
      /^fake_/,
    );
  });

  it("sends the buyer to iyzico but stores and logs none of it; a provider failure is finalized and 502", async () => {
    const s = setup(IYZICO_ENV, {
      ...userRoute,
      "/rpc/payment_begin": () => jsonResponse(BEGIN),
      "/rpc/payment_record_event": () => jsonResponse(true),
      "/rpc/payment_finalize": () => jsonResponse("failed"),
      [IYZICO_PATHS.initialize]: () =>
        jsonResponse({ status: "failure", errorCode: "12", errorMessage: "Ayşe Yılmaz geçersiz" }),
    });
    const res = await handlePayments(paymentsRequest(startBody, auth), s.deps);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "provider_error" });

    const sent = s.calls.find((c) => c.url.endsWith(IYZICO_PATHS.initialize))?.body as {
      buyer: Record<string, string>;
    };
    expect(sent.buyer).toMatchObject({
      name: "Ayşe",
      surname: "Yılmaz",
      ip: "203.0.113.7",
      registrationDate: "2026-10-01 10:00:00",
    });

    const fin = s.rpcCalls("payment_finalize")[0].body as {
      p_outcome: string;
      p_result: { failure_code: string };
    };
    expect(fin).toMatchObject({ p_outcome: "failed", p_result: { failure_code: "iyzico_12" } });

    const stored = JSON.stringify(
      s
        .writes()
        .filter((c) => !c.url.endsWith("/rpc/payment_begin"))
        .map((c) => c.body),
    );
    const logged = s.logs.join("\n");
    for (const pii of [
      "Ayşe",
      "Yılmaz",
      "10000000146",
      "ayse@example.com",
      "+905350000000",
      "Örnek",
      "203.0.113.7",
    ]) {
      expect(stored).not.toContain(pii);
      expect(logged).not.toContain(pii);
    }
  });
});

// ------------------------------------------------------------------ refund

describe("refund", () => {
  const auth = { authorization: "Bearer ops-jwt" };
  const CLAIM = {
    refund_id: REFUND_ID,
    number: "I-2026-000001",
    kind: "void",
    amount_kurus: 1200000,
    currency: "TRY",
    provider: "fake",
    provider_payment_id: `fake_pay_${PAYMENT_ID}`,
    provider_item_id: null,
    payment_succeeded_at: "2026-10-27T09:00:00Z",
    payment_amount_kurus: 1200000,
  };
  const userRoute = { "/auth/v1/user": () => jsonResponse({ id: USER_ID }) };

  it("403 when the caller may not process the refund", async () => {
    const s = setup(FAKE_ENV, {
      ...userRoute,
      "/rpc/ops_can_process_refund": () => jsonResponse(false),
    });
    const res = await handlePayments(
      paymentsRequest({ action: "refund", refund_id: REFUND_ID }, auth),
      s.deps,
    );
    expect(res.status).toBe(403);
    expect(s.writes()).toHaveLength(0);
  });

  it("409 when the refund is not open", async () => {
    const s = setup(FAKE_ENV, {
      ...userRoute,
      "/rpc/ops_can_process_refund": () => jsonResponse(true),
      "/rpc/payment_refund_claim": () =>
        jsonResponse({ code: "P0001", message: "refund_not_open" }, 400),
    });
    const res = await handlePayments(
      paymentsRequest({ action: "refund", refund_id: REFUND_ID }, auth),
      s.deps,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "refund_not_open" });
  });

  it("processes a claimed refund and reports it", async () => {
    const s = setup(FAKE_ENV, {
      ...userRoute,
      "/rpc/ops_can_process_refund": () => jsonResponse(true),
      "/rpc/payment_refund_claim": () => jsonResponse(CLAIM),
      "/rpc/payment_record_event": () => jsonResponse(true),
      "/rpc/payment_refund_report": () => new Response(null, { status: 204 }),
    });
    const res = await handlePayments(
      paymentsRequest({ action: "refund", refund_id: REFUND_ID }, auth),
      s.deps,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "succeeded", kind: "void" });
    expect(s.rpcCalls("payment_refund_report")[0].body).toMatchObject({
      p_refund_id: REFUND_ID,
      p_outcome: "succeeded",
      p_kind: "void",
      p_provider_ref: `fake_refund_${REFUND_ID}`,
    });
    expect(
      (s.rpcCalls("payment_record_event")[0].body as { p_dedup_key: string }).p_dedup_key,
    ).toMatch(new RegExp(`^refund:${REFUND_ID}:[0-9a-f]+$`));
  });

  it("a timeout leaves the refund processing and answers failed/timeout", async () => {
    const s = setup(IYZICO_ENV, {
      ...userRoute,
      "/rpc/ops_can_process_refund": () => jsonResponse(true),
      "/rpc/payment_refund_claim": () =>
        jsonResponse({
          ...CLAIM,
          provider: "iyzico",
          kind: "refund",
          provider_payment_id: "28000001",
          provider_item_id: "29000001",
        }),
      "/rpc/payment_record_event": () => jsonResponse(true),
      [IYZICO_PATHS.refund]: () =>
        Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
      [IYZICO_PATHS.detail]: () => jsonResponse({ status: "success" }),
    });
    const res = await handlePayments(
      paymentsRequest({ action: "refund", refund_id: REFUND_ID }, auth),
      s.deps,
    );
    expect(await res.json()).toEqual({
      status: "failed",
      kind: "refund",
      failure_code: "timeout",
      retryable: false,
    });
    expect(s.rpcCalls("payment_refund_report")).toHaveLength(0);
    expect(
      s
        .rpcCalls("payment_record_event")
        .map((c) => (c.body as { p_event_type: string }).p_event_type),
    ).toEqual(["refund", "detail"]);
  });
});

describe("payments", () => {
  it("rejects unknown actions and methods", async () => {
    const s = setup(FAKE_ENV, {});
    expect((await handlePayments(paymentsRequest({ action: "nope" }), s.deps)).status).toBe(400);
    expect(
      (await handlePayments(new Request("http://edge/functions/v1/payments"), s.deps)).status,
    ).toBe(405);
  });
});
