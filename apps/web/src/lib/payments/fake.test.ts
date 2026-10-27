import { describe, expect, it } from "vitest";
import {
  fakeProvider,
  isFakeToken,
} from "../../../../../supabase/functions/_shared/payments/fake.ts";
import {
  choosePaymentProvider,
  enabledInstallments,
  fakePaymentsAllowed,
} from "../../../../../supabase/functions/_shared/payments/provider.ts";
import { hmacHex, ITEM_ID, ORDER_ID, PAYMENT_ID } from "./helpers";

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
  items: [{ id: ITEM_ID, name: "Bahçe", amountKurus: 1200000 }],
  buyer: {
    id: "u",
    name: "A",
    surname: "B",
    identityNumber: "11111111111",
    email: "a@example.com",
    gsmNumber: "+905350000000",
    registrationAddress: "x",
    city: "Gaziantep",
    country: "Turkey",
    ip: "203.0.113.1",
  },
  billing: { contactName: "A B", address: "x", city: "Gaziantep", country: "Turkey" },
  callbackUrl: "http://127.0.0.1:54321/functions/v1/payment-callback",
  returnOrigin: "http://localhost:3000",
  installments: [1],
};

describe("fake provider", () => {
  it("starts a checkout on /odeme/sahte for 30 minutes", async () => {
    const before = Date.now();
    const r = await fakeProvider().startCheckout(startInput);
    if (!r.ok) throw new Error("expected ok");
    expect(isFakeToken(r.providerToken)).toBe(true);
    expect(r.providerToken.startsWith(`fake_${PAYMENT_ID}_`)).toBe(true);
    const url = new URL(r.redirectUrl);
    expect(url.origin + url.pathname).toBe("http://localhost:3000/odeme/sahte");
    expect(url.searchParams.get("token")).toBe(r.providerToken);
    expect(url.searchParams.get("tutar")).toBe("12000.00");
    const ttl = r.expiresAt.getTime() - before;
    expect(ttl).toBeGreaterThanOrEqual(30 * 60 * 1000 - 50);
    expect(ttl).toBeLessThanOrEqual(30 * 60 * 1000 + 1000);
  });

  it.each([
    ["success", "succeeded", null],
    ["failure", "failed", "card_declined"],
    ["review", "pending_review", "fraud_review"],
  ])("callback outcome %s -> %s", async (outcome, result, failureCode) => {
    const p = fakeProvider();
    const token = `fake_${PAYMENT_ID}_abcdef0123456789`;
    expect(p.readCallback(new URLSearchParams({ token, outcome })).providerToken).toBe(token);
    const r = await p.confirm(token, expected);
    expect(r.outcome).toBe(result);
    expect(r.failureCode).toBe(failureCode);
    if (result === "succeeded") expect(r.providerAmountKurus).toBe(1200000);
  });

  it("without an outcome the payment is not completed", async () => {
    const p = fakeProvider();
    const token = `fake_${PAYMENT_ID}_abcdef0123456789`;
    expect((await p.confirm(token, expected)).outcome).toBe("not_completed");
    p.readCallback(new URLSearchParams({ token, outcome: "maybe" }));
    expect((await p.confirm(token, expected)).outcome).toBe("not_completed");
  });

  it("rejects tokens that are not fake tokens", () => {
    expect(
      fakeProvider().readCallback(new URLSearchParams({ token: "iyzico-token" })).providerToken,
    ).toBeNull();
  });

  it("verifies the webhook signature", async () => {
    const p = fakeProvider({ webhookSecret: "fake-webhook-local" });
    const token = `fake_${PAYMENT_ID}_abcdef0123456789`;
    const body = JSON.stringify({ token, outcome: "success" });
    const ok = await p.verifyWebhook(
      new Headers({ "x-fake-signature": hmacHex("fake-webhook-local", body) }),
      body,
    );
    expect(ok).toMatchObject({
      valid: true,
      providerToken: token,
      dedupKey: `wh:fake:${token}:success`,
    });
    expect((await p.confirm(token, expected)).outcome).toBe("succeeded");

    const bad = await p.verifyWebhook(
      new Headers({ "x-fake-signature": hmacHex("other", body) }),
      body,
    );
    expect(bad).toMatchObject({ valid: false, reason: "signature_invalid" });
    const missing = await p.verifyWebhook(new Headers(), body);
    expect(missing).toMatchObject({ valid: false, reason: "signature_missing" });
    const noSecret = await fakeProvider().verifyWebhook(
      new Headers({ "x-fake-signature": hmacHex("", body) }),
      body,
    );
    expect(noSecret.valid).toBe(false);
  });

  it("refunds always succeed", async () => {
    const r = await fakeProvider().refund({
      refundId: "r1",
      kind: "void",
      providerPaymentId: "p",
      providerItemId: null,
      amountKurus: 1,
      currency: "TRY",
      ip: "127.0.0.1",
    });
    expect(r.status).toBe("succeeded");
  });
});

describe("choosePaymentProvider", () => {
  const iyzicoEnv = {
    IYZICO_API_KEY: "k",
    IYZICO_SECRET_KEY: "s",
    IYZICO_BASE_URL: "https://sandbox-api.iyzipay.com",
  };

  it("returns null for an empty or unknown id", () => {
    expect(choosePaymentProvider("", iyzicoEnv)).toBeNull();
    expect(choosePaymentProvider(undefined, iyzicoEnv)).toBeNull();
    expect(choosePaymentProvider("manual", iyzicoEnv)).toBeNull();
    expect(choosePaymentProvider("stripe", iyzicoEnv)).toBeNull();
  });

  it("needs the iyzico keys", () => {
    expect(choosePaymentProvider("iyzico", iyzicoEnv)?.id).toBe("iyzico");
    expect(choosePaymentProvider("iyzico", { ...iyzicoEnv, IYZICO_SECRET_KEY: "" })).toBeNull();
  });

  it("fake needs both flags", () => {
    expect(choosePaymentProvider("fake", {})).toBeNull();
    expect(choosePaymentProvider("fake", { PAYMENT_PROVIDER: "fake" })).toBeNull();
    expect(choosePaymentProvider("fake", { PAYMENT_FAKE_ALLOWED: "1" })).toBeNull();
    expect(
      choosePaymentProvider("fake", { PAYMENT_PROVIDER: "iyzico", PAYMENT_FAKE_ALLOWED: "1" }),
    ).toBeNull();
    expect(
      choosePaymentProvider("fake", { PAYMENT_PROVIDER: "fake", PAYMENT_FAKE_ALLOWED: "true" }),
    ).toBeNull();
    expect(
      choosePaymentProvider("fake", { PAYMENT_PROVIDER: "fake", PAYMENT_FAKE_ALLOWED: "1" })?.id,
    ).toBe("fake");
    expect(fakePaymentsAllowed({ PAYMENT_PROVIDER: "fake", PAYMENT_FAKE_ALLOWED: "1" })).toBe(true);
  });

  it("reads enabled installments", () => {
    expect(enabledInstallments({})).toEqual([1]);
    expect(enabledInstallments({ IYZICO_ENABLED_INSTALLMENTS: "6, 1,3,x,13" })).toEqual([1, 3, 6]);
    expect(enabledInstallments({ IYZICO_ENABLED_INSTALLMENTS: "" })).toEqual([1]);
  });
});
