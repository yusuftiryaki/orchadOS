import { describe, expect, it } from "vitest";
import {
  DbError,
  FINALIZE_RESULT_KEYS,
  PAYMENT_BEGIN_KEYS,
  REFUND_CLAIM_KEYS,
  authUserId,
  opsCanProcessRefund,
  paymentAttachToken,
  paymentAttemptsToReconcile,
  paymentBegin,
  paymentByToken,
  paymentFinalize,
  paymentRecordEvent,
  paymentRefundClaim,
  paymentRefundReport,
  reasonCode,
  type DbConfig,
} from "../../../../../supabase/functions/_shared/payments/db.ts";
import { jsonResponse, ORDER_ID, PAYMENT_ID, REFUND_ID, routedFetch, USER_ID } from "./helpers";

function cfg(routes: Parameters<typeof routedFetch>[0]) {
  const { impl, calls } = routedFetch(routes);
  const config: DbConfig = {
    url: "http://kong:8000",
    serviceRoleKey: "service",
    anonKey: "anon",
    fetchImpl: impl,
  };
  return { config, calls };
}

const headers = (init?: RequestInit) => init?.headers as Record<string, string>;

describe("contract key lists (§6.9)", () => {
  it("payment_begin", () => {
    expect([...PAYMENT_BEGIN_KEYS]).toEqual([
      "payment_id",
      "order_id",
      "order_number",
      "amount_kurus",
      "currency",
      "items",
      "buyer",
      "identity_number_required",
      "billing",
    ]);
  });

  it("payment_finalize p_result", () => {
    expect([...FINALIZE_RESULT_KEYS]).toEqual([
      "provider_payment_id",
      "provider_amount_kurus",
      "paid_kurus",
      "installment",
      "card_association",
      "card_family",
      "card_last4",
      "fraud_status",
      "failure_code",
      "items",
    ]);
  });

  it("payment_refund_claim", () => {
    expect([...REFUND_CLAIM_KEYS]).toEqual([
      "refund_id",
      "number",
      "kind",
      "amount_kurus",
      "currency",
      "provider",
      "provider_payment_id",
      "provider_item_id",
      "payment_succeeded_at",
      "payment_amount_kurus",
    ]);
  });
});

describe("rpc request bodies", () => {
  it("payment_begin (no p_ip_hash), with the service role", async () => {
    const { config, calls } = cfg({
      "/rpc/payment_begin": () => jsonResponse({ payment_id: PAYMENT_ID }),
    });
    await paymentBegin(config, {
      orderId: ORDER_ID,
      userId: USER_ID,
      provider: "iyzico",
      returnOrigin: "https://a.b",
    });
    expect(calls[0].url).toBe("http://kong:8000/rest/v1/rpc/payment_begin");
    expect(calls[0].body).toEqual({
      p_order_id: ORDER_ID,
      p_user_id: USER_ID,
      p_provider: "iyzico",
      p_return_origin: "https://a.b",
    });
    expect(headers(calls[0].init)).toMatchObject({
      apikey: "service",
      authorization: "Bearer service",
    });
  });

  it("payment_attach_token", async () => {
    const { config, calls } = cfg({
      "/rpc/payment_attach_token": () => new Response(null, { status: 204 }),
    });
    await paymentAttachToken(config, PAYMENT_ID, "tok", new Date("2026-10-27T10:00:00Z"));
    expect(calls[0].body).toEqual({
      p_payment_id: PAYMENT_ID,
      p_token: "tok",
      p_expires_at: "2026-10-27T10:00:00.000Z",
    });
  });

  it("payment_by_token: first row or null", async () => {
    const row = { id: PAYMENT_ID, order_id: ORDER_ID, provider: "iyzico" };
    const one = cfg({ "/rpc/payment_by_token": () => jsonResponse([row]) });
    expect(await paymentByToken(one.config, "tok")).toEqual(row);
    expect(one.calls[0].body).toEqual({ p_token: "tok" });
    const none = cfg({ "/rpc/payment_by_token": () => jsonResponse([]) });
    expect(await paymentByToken(none.config, "tok")).toBeNull();
  });

  it("payment_record_event", async () => {
    const { config, calls } = cfg({ "/rpc/payment_record_event": () => jsonResponse(true) });
    const isNew = await paymentRecordEvent(config, {
      provider: "iyzico",
      eventType: "webhook",
      dedupKey: "wh:r:e:s",
      paymentId: PAYMENT_ID,
      refundId: null,
      httpStatus: null,
      outcome: "CHECKOUT_FORM_AUTH",
      payload: { status: "SUCCESS" },
    });
    expect(isNew).toBe(true);
    expect(calls[0].body).toEqual({
      p_provider: "iyzico",
      p_event_type: "webhook",
      p_dedup_key: "wh:r:e:s",
      p_payment_id: PAYMENT_ID,
      p_refund_id: null,
      p_signature_valid: true,
      p_http_status: null,
      p_outcome: "CHECKOUT_FORM_AUTH",
      p_payload: { status: "SUCCESS" },
    });
  });

  it("payment_finalize: p_result has exactly the §6.9 keys", async () => {
    const { config, calls } = cfg({ "/rpc/payment_finalize": () => jsonResponse("succeeded") });
    const result = {
      provider_payment_id: "p",
      provider_amount_kurus: 100,
      paid_kurus: 100,
      installment: 1,
      card_association: "MASTER_CARD",
      card_family: "Bonus",
      card_last4: "0008",
      fraud_status: 1 as const,
      failure_code: null,
      items: [{ payment_item_id: "i", provider_item_id: "t" }],
    };
    expect(await paymentFinalize(config, PAYMENT_ID, "succeeded", result)).toBe("succeeded");
    const body = calls[0].body as {
      p_payment_id: string;
      p_outcome: string;
      p_result: Record<string, unknown>;
    };
    expect(body.p_payment_id).toBe(PAYMENT_ID);
    expect(body.p_outcome).toBe("succeeded");
    expect(Object.keys(body.p_result).sort()).toEqual([...FINALIZE_RESULT_KEYS].sort());
  });

  it("payment_attempts_to_reconcile", async () => {
    const { config, calls } = cfg({
      "/rpc/payment_attempts_to_reconcile": () => jsonResponse([{ id: PAYMENT_ID }]),
    });
    expect(await paymentAttemptsToReconcile(config)).toHaveLength(1);
    expect(calls[0].body).toEqual({ p_limit: 50 });
  });

  it("payment_refund_claim and payment_refund_report", async () => {
    const { config, calls } = cfg({
      "/rpc/payment_refund_claim": () => jsonResponse({ refund_id: REFUND_ID }),
      "/rpc/payment_refund_report": () => new Response(null, { status: 204 }),
    });
    await paymentRefundClaim(config, REFUND_ID);
    await paymentRefundReport(config, {
      refundId: REFUND_ID,
      outcome: "failed",
      kind: "refund",
      failureCode: "x",
      retryable: false,
    });
    expect(calls[0].body).toEqual({ p_refund_id: REFUND_ID });
    expect(calls[1].body).toEqual({
      p_refund_id: REFUND_ID,
      p_outcome: "failed",
      p_kind: "refund",
      p_provider_ref: null,
      p_failure_code: "x",
      p_retryable: false,
    });
  });

  it("ops_can_process_refund runs with the caller's JWT", async () => {
    const { config, calls } = cfg({ "/rpc/ops_can_process_refund": () => jsonResponse(true) });
    expect(await opsCanProcessRefund(config, REFUND_ID, "Bearer user-jwt")).toBe(true);
    expect(headers(calls[0].init)).toMatchObject({
      apikey: "anon",
      authorization: "Bearer user-jwt",
    });
    expect(calls[0].body).toEqual({ p_refund_id: REFUND_ID });
  });

  it("authUserId asks the Auth API", async () => {
    const { config, calls } = cfg({ "/auth/v1/user": () => jsonResponse({ id: USER_ID }) });
    expect(await authUserId(config, "Bearer user-jwt")).toBe(USER_ID);
    expect(headers(calls[0].init)).toMatchObject({
      apikey: "anon",
      authorization: "Bearer user-jwt",
    });
    expect(await authUserId(config, null)).toBeNull();
    expect(await authUserId(config, "Basic x")).toBeNull();
  });
});

describe("errors", () => {
  it("our functions' messages are reason codes", async () => {
    const { config } = cfg({
      "/rpc/payment_begin": () =>
        jsonResponse({ code: "P0001", message: "order_not_payable", details: null }, 400),
    });
    const err = await paymentBegin(config, {
      orderId: ORDER_ID,
      userId: USER_ID,
      provider: "fake",
      returnOrigin: "x",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(DbError);
    expect(err).toMatchObject({ code: "order_not_payable", httpStatus: 400 });
  });

  it("other messages are mapped from the SQLSTATE, never passed on", () => {
    expect(
      reasonCode(400, {
        code: "23514",
        message: 'new row violates check constraint "x" Failing row contains (Ali)',
      }),
    ).toBe("db_error");
    expect(reasonCode(404, { code: "P0002", message: "No rows" })).toBe("not_found");
    expect(
      reasonCode(403, { code: "42501", message: "permission denied for function payment_begin" }),
    ).toBe("forbidden");
    expect(reasonCode(404, { code: "PGRST202", message: "Could not find the function" })).toBe(
      "rpc_missing",
    );
    expect(reasonCode(401, null)).toBe("forbidden");
    expect(reasonCode(500, "boom")).toBe("db_error");
  });

  it("network failures become db_unreachable", async () => {
    const config: DbConfig = {
      url: "http://kong:8000",
      serviceRoleKey: "s",
      anonKey: "a",
      fetchImpl: () => Promise.reject(new TypeError("fetch failed")),
    };
    await expect(paymentByToken(config, "t")).rejects.toMatchObject({ code: "db_unreachable" });
  });
});
