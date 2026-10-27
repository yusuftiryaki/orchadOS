import { afterEach, describe, expect, it, vi } from "vitest";
import {
  iyzicoProvider,
  IYZICO_PATHS,
} from "../../../../../supabase/functions/_shared/payments/iyzico.ts";
import { choosePaymentProvider } from "../../../../../supabase/functions/_shared/payments/provider.ts";
import { ProviderUnavailableError } from "../../../../../supabase/functions/_shared/payments/types.ts";
import {
  hmacHex,
  ITEM_ID,
  jsonResponse,
  ORDER_ID,
  PAYMENT_ID,
  REFUND_ID,
  routedFetch,
} from "./helpers";

const SECRET = "sandbox-secret";
const BASE = "https://sandbox-api.iyzipay.com";
const ENV = { IYZICO_API_KEY: "sandbox-key", IYZICO_SECRET_KEY: SECRET, IYZICO_BASE_URL: BASE };
const expected = {
  paymentId: PAYMENT_ID,
  orderId: ORDER_ID,
  amountKurus: 1200000,
  currency: "TRY" as const,
};

const startInput = {
  paymentId: PAYMENT_ID,
  orderId: ORDER_ID,
  amountKurus: 1200000,
  currency: "TRY" as const,
  items: [{ id: ITEM_ID, name: "Bahçe 1", amountKurus: 1200000 }],
  buyer: {
    id: "u1",
    name: "Ayşe",
    surname: "Yılmaz",
    identityNumber: "11111111111",
    email: "ayse@example.com",
    gsmNumber: "+905350000000",
    registrationAddress: "Örnek Mah. 1",
    city: "Gaziantep",
    country: "Turkey",
    ip: "203.0.113.7",
    registrationDate: "2026-10-01 10:00:00",
  },
  billing: {
    contactName: "Ayşe Yılmaz",
    address: "Örnek Mah. 1",
    city: "Gaziantep",
    country: "Turkey",
  },
  callbackUrl: "https://x.supabase.co/functions/v1/payment-callback",
  returnOrigin: "https://orchados.vercel.app",
  installments: [1],
};

function provider() {
  const p = choosePaymentProvider("iyzico", ENV);
  if (!p) throw new Error("no provider");
  return p;
}

afterEach(() => vi.unstubAllGlobals());

describe("iyzico startCheckout", () => {
  it("sends a signed initialize request and returns the payment page", async () => {
    const { impl, calls } = routedFetch({
      [IYZICO_PATHS.initialize]: () =>
        jsonResponse({
          status: "success",
          conversationId: PAYMENT_ID,
          token: "tok-1",
          tokenExpireTime: 1800,
          paymentPageUrl: "https://sandbox-cpp.iyzipay.com?token=tok-1",
          signature: hmacHex(SECRET, `${PAYMENT_ID}:tok-1`),
        }),
    });
    vi.stubGlobal("fetch", vi.fn(impl));
    const r = await provider().startCheckout(startInput);
    expect(r).toMatchObject({
      ok: true,
      providerToken: "tok-1",
      redirectUrl: "https://sandbox-cpp.iyzipay.com?token=tok-1",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${BASE}${IYZICO_PATHS.initialize}`);
    const headers = calls[0].init?.headers as Record<string, string>;
    const rnd = headers["x-iyzi-rnd"];
    const sig = hmacHex(SECRET, rnd + IYZICO_PATHS.initialize + (calls[0].init?.body as string));
    expect(Buffer.from(headers.authorization.slice(8), "base64").toString()).toBe(
      `apiKey:sandbox-key&randomKey:${rnd}&signature:${sig}`,
    );
    expect(calls[0].body).toMatchObject({
      locale: "tr",
      conversationId: PAYMENT_ID,
      basketId: ORDER_ID,
      price: "12000.00",
      paidPrice: "12000.00",
      currency: "TRY",
      enabledInstallments: [1],
      basketItems: [{ id: ITEM_ID, itemType: "VIRTUAL", price: "12000.00" }],
    });
    expect(calls[0].body).not.toHaveProperty("shippingAddress");
  });

  it("maps a failure answer to iyzico_<errorCode>", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          status: "failure",
          errorCode: "1001",
          errorMessage: "api bilgileri bulunamadı",
        }),
      ),
    );
    expect(await provider().startCheckout(startInput)).toMatchObject({
      ok: false,
      error: "iyzico_1001",
    });
  });

  it("rejects an unsigned answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          status: "success",
          conversationId: PAYMENT_ID,
          token: "t",
          paymentPageUrl: "https://x",
          signature: "00",
        }),
      ),
    );
    expect(await provider().startCheckout(startInput)).toMatchObject({
      ok: false,
      error: "signature_invalid",
    });
  });

  it("refuses a basket whose items do not add up", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const r = await provider().startCheckout({ ...startInput, amountKurus: 1 });
    expect(r).toMatchObject({ ok: false, error: "basket_total_mismatch" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("times out after the configured limit", async () => {
    const hanging = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    const p = iyzicoProvider(
      { apiKey: "k", secretKey: SECRET, baseUrl: BASE, timeoutMs: 20 },
      hanging,
    );
    expect(await p.startCheckout(startInput)).toMatchObject({
      ok: false,
      error: "provider_timeout",
    });
  });
});

function signedRetrieve(overrides: Record<string, unknown> = {}) {
  const r: Record<string, unknown> = {
    status: "success",
    paymentStatus: "SUCCESS",
    paymentId: "28000001",
    conversationId: PAYMENT_ID,
    basketId: ORDER_ID,
    currency: "TRY",
    price: 12000.0,
    paidPrice: 12000.0,
    installment: 1,
    fraudStatus: 1,
    token: "tok-1",
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
      "12000",
      "12000",
      r.token,
    ].join(":"),
  );
  return r;
}

describe("iyzico confirm", () => {
  it("retrieves and accepts a signed success", async () => {
    const { impl, calls } = routedFetch({
      [IYZICO_PATHS.retrieve]: () => jsonResponse(signedRetrieve()),
    });
    vi.stubGlobal("fetch", vi.fn(impl));
    const r = await provider().confirm("tok-1", expected);
    expect(r.outcome).toBe("succeeded");
    expect(calls[0].body).toEqual({ locale: "tr", conversationId: PAYMENT_ID, token: "tok-1" });
  });

  it("fails a success whose signature does not match", async () => {
    const tampered = { ...signedRetrieve(), paymentId: "28000002" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(tampered)),
    );
    expect(await provider().confirm("tok-1", expected)).toMatchObject({
      outcome: "failed",
      failureCode: "signature_invalid",
    });
  });

  it("throws when the provider cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("fetch failed"))),
    );
    await expect(provider().confirm("tok-1", expected)).rejects.toBeInstanceOf(
      ProviderUnavailableError,
    );
  });
});

describe("iyzico webhook", () => {
  const body = {
    iyziEventType: "CHECKOUT_FORM_AUTH",
    iyziEventTime: 1700000000000,
    iyziReferenceCode: "ref-1",
    iyziPaymentId: 28000001,
    token: "tok-1",
    paymentConversationId: PAYMENT_ID,
    status: "SUCCESS",
  };
  const raw = JSON.stringify(body);
  const sig = hmacHex(SECRET, `${SECRET}CHECKOUT_FORM_AUTH28000001tok-1${PAYMENT_ID}SUCCESS`);

  it("valid", async () => {
    const v = await provider().verifyWebhook(new Headers({ "x-iyz-signature-v3": sig }), raw);
    expect(v).toMatchObject({
      valid: true,
      providerToken: "tok-1",
      eventType: "CHECKOUT_FORM_AUTH",
      dedupKey: "wh:ref-1:CHECKOUT_FORM_AUTH:SUCCESS",
    });
  });

  it("invalid", async () => {
    const v = await provider().verifyWebhook(
      new Headers({ "x-iyz-signature-v3": sig }),
      raw.replace("SUCCESS", "FAILURE"),
    );
    expect(v).toMatchObject({ valid: false, reason: "signature_invalid", providerToken: null });
  });

  it("missing header", async () => {
    expect(await provider().verifyWebhook(new Headers(), raw)).toMatchObject({
      valid: false,
      reason: "signature_missing",
    });
  });

  it("malformed body", async () => {
    const v = await provider().verifyWebhook(
      new Headers({ "x-iyz-signature-v3": sig }),
      "not json",
    );
    expect(v).toMatchObject({ valid: false, reason: "invalid_body" });
  });
});

describe("iyzico refund", () => {
  const input = {
    refundId: REFUND_ID,
    kind: "refund" as const,
    providerPaymentId: "28000001",
    providerItemId: "29000001",
    amountKurus: 50000,
    currency: "TRY" as const,
    ip: "203.0.113.9",
  };

  it("refunds an item transaction and checks the answer's signature", async () => {
    const answer = {
      status: "success",
      paymentId: "28000001",
      paymentTransactionId: "29000001",
      price: 500.0,
      currency: "TRY",
      conversationId: REFUND_ID,
      hostReference: "host-1",
      signature: hmacHex(SECRET, `28000001:500:TRY:${REFUND_ID}`),
    };
    const { impl, calls } = routedFetch({ [IYZICO_PATHS.refund]: () => jsonResponse(answer) });
    vi.stubGlobal("fetch", vi.fn(impl));
    expect(await provider().refund(input)).toMatchObject({
      status: "succeeded",
      providerRef: "host-1",
    });
    expect(calls[0].body).toEqual({
      locale: "tr",
      conversationId: REFUND_ID,
      paymentTransactionId: "29000001",
      price: "500.00",
      currency: "TRY",
      ip: "203.0.113.9",
    });
  });

  it("voids through /payment/cancel", async () => {
    const answer = {
      status: "success",
      paymentId: "28000001",
      price: 12000,
      currency: "TRY",
      conversationId: REFUND_ID,
      signature: hmacHex(SECRET, `28000001:12000:TRY:${REFUND_ID}`),
    };
    const { impl, calls } = routedFetch({ [IYZICO_PATHS.cancel]: () => jsonResponse(answer) });
    vi.stubGlobal("fetch", vi.fn(impl));
    expect(await provider().refund({ ...input, kind: "void", amountKurus: 1200000 })).toMatchObject(
      { status: "succeeded" },
    );
    expect(calls[0].body).toEqual({
      locale: "tr",
      conversationId: REFUND_ID,
      paymentId: "28000001",
      ip: "203.0.113.9",
    });
  });

  it("maps a refused refund", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ status: "failure", errorCode: "5093" })),
    );
    expect(await provider().refund(input)).toMatchObject({
      status: "failed",
      failureCode: "iyzico_5093",
      retryable: false,
    });
  });

  it("an answer with a bad signature leaves the outcome unknown", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          status: "success",
          paymentId: "28000001",
          price: 500,
          currency: "TRY",
          conversationId: REFUND_ID,
          signature: "00",
        }),
      ),
    );
    expect(await provider().refund(input)).toMatchObject({
      status: "unknown",
      failureCode: "signature_invalid",
    });
  });

  it("reads /payment/detail after a timeout and stays unknown", async () => {
    const calls: string[] = [];
    const impl = (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.endsWith(IYZICO_PATHS.detail))
        return Promise.resolve(jsonResponse({ status: "success", paymentId: "28000001" }));
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    };
    const p = iyzicoProvider(
      { apiKey: "k", secretKey: SECRET, baseUrl: BASE, timeoutMs: 20 },
      impl,
    );
    const r = await p.refund(input);
    expect(r).toMatchObject({
      status: "unknown",
      failureCode: "timeout",
      detail: { status: "success" },
    });
    expect(calls).toEqual([`${BASE}${IYZICO_PATHS.refund}`, `${BASE}${IYZICO_PATHS.detail}`]);
  });
});
