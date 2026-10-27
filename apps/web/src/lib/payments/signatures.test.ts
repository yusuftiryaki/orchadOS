import { describe, expect, it } from "vitest";
import {
  hmacSha256Hex,
  iyzicoHeaders,
} from "../../../../../supabase/functions/_shared/payments/iyzico-auth.ts";
import {
  initializeSignature,
  refundSignature,
  retrieveSignature,
  timingSafeEqual,
  verifyInitializeSignature,
  verifyRefundSignature,
  verifyRetrieveSignature,
  verifyWebhookSignatureV3,
  webhookDedupKey,
  webhookSignatureV3,
} from "../../../../../supabase/functions/_shared/payments/iyzico-signatures.ts";
import { hmacHex } from "./helpers";

const SECRET = "sandbox-secret";

describe("IYZWSv2", () => {
  // Fixed vector, computed independently with node:crypto.
  it("matches the fixed vector", async () => {
    const body = '{"locale":"tr","conversationId":"123456789"}';
    const headers = await iyzicoHeaders(
      "sandbox-key",
      SECRET,
      "/payment/iyzipos/checkoutform/initialize/auth/ecom",
      body,
      "123456789",
    );
    expect(headers["x-iyzi-rnd"]).toBe("123456789");
    expect(headers.authorization).toBe(
      "IYZWSv2 YXBpS2V5OnNhbmRib3gta2V5JnJhbmRvbUtleToxMjM0NTY3ODkmc2lnbmF0dXJlOjk4NGEyYzcxOTE5ZGNhZWZhNjQ4Y2FhZTVkOWQ4YzI2MGYxYzVhNTJkZjM5MTFmY2U5Mzc0NmUwYTkyZTY3YzI=",
    );
    const decoded = Buffer.from(
      headers.authorization.slice("IYZWSv2 ".length),
      "base64",
    ).toString();
    expect(decoded).toBe(
      "apiKey:sandbox-key&randomKey:123456789&signature:984a2c71919dcaefa648caae5d9d8c260f1c5a52df3911fce93746e0a92e67c2",
    );
  });

  it("uses a fresh random key by default", async () => {
    const a = await iyzicoHeaders("k", SECRET, "/p", "{}");
    const b = await iyzicoHeaders("k", SECRET, "/p", "{}");
    expect(a["x-iyzi-rnd"]).not.toBe(b["x-iyzi-rnd"]);
  });

  it("hmacSha256Hex agrees with node:crypto", async () => {
    expect(await hmacSha256Hex("k", "message ğüşİ")).toBe(hmacHex("k", "message ğüşİ"));
  });
});

describe("response signatures", () => {
  it("initialize: conversationId:token", async () => {
    const r = { conversationId: "c1", token: "tok" };
    const sig = hmacHex(SECRET, "c1:tok");
    expect(await initializeSignature(SECRET, r)).toBe(sig);
    expect(await verifyInitializeSignature(SECRET, { ...r, signature: sig })).toBe(true);
    expect(await verifyInitializeSignature(SECRET, { ...r, signature: sig.toUpperCase() })).toBe(
      true,
    );
    expect(await verifyInitializeSignature(SECRET, { ...r, token: "tok2", signature: sig })).toBe(
      false,
    );
    expect(await verifyInitializeSignature(SECRET, r)).toBe(false);
  });

  const retrieve = {
    paymentStatus: "SUCCESS",
    paymentId: "pid",
    currency: "TRY",
    basketId: "b1",
    conversationId: "c1",
    paidPrice: "120.50",
    price: 120.0,
    token: "tok",
  };

  it("retrieve: fields in order, prices normalised", async () => {
    const sig = hmacHex(SECRET, "SUCCESS:pid:TRY:b1:c1:120.5:120:tok");
    expect(await retrieveSignature(SECRET, retrieve)).toBe(sig);
    expect(await verifyRetrieveSignature(SECRET, { ...retrieve, signature: sig })).toBe(true);
    // "120.50" and "120.5" sign the same.
    expect(
      await verifyRetrieveSignature(SECRET, { ...retrieve, paidPrice: "120.5", signature: sig }),
    ).toBe(true);
  });

  it.each([
    ["paymentStatus", "FAILURE"],
    ["paymentId", "other"],
    ["currency", "USD"],
    ["basketId", "b2"],
    ["conversationId", "c2"],
    ["paidPrice", "121"],
    ["price", "1"],
    ["token", "tok2"],
  ])("retrieve: tampered %s fails", async (field, value) => {
    const sig = hmacHex(SECRET, "SUCCESS:pid:TRY:b1:c1:120.5:120:tok");
    expect(
      await verifyRetrieveSignature(SECRET, { ...retrieve, [field]: value, signature: sig }),
    ).toBe(false);
  });

  it("refund: paymentId:price:currency:conversationId", async () => {
    const r = { paymentId: "pid", price: "10.50", currency: "TRY", conversationId: "r1" };
    const sig = hmacHex(SECRET, "pid:10.5:TRY:r1");
    expect(await refundSignature(SECRET, r)).toBe(sig);
    expect(await verifyRefundSignature(SECRET, { ...r, signature: sig })).toBe(true);
    expect(await verifyRefundSignature(SECRET, { ...r, price: "11", signature: sig })).toBe(false);
    expect(
      await verifyRefundSignature(SECRET, { ...r, signature: hmacHex("other", "pid:10.5:TRY:r1") }),
    ).toBe(false);
  });
});

describe("webhook V3", () => {
  const body = {
    iyziEventType: "CHECKOUT_FORM_AUTH",
    iyziPaymentId: 12345,
    token: "tok",
    paymentConversationId: "c1",
    status: "SUCCESS",
    iyziReferenceCode: "ref-1",
  };
  const sig = hmacHex(SECRET, `${SECRET}CHECKOUT_FORM_AUTH12345tokc1SUCCESS`);

  it("valid", async () => {
    expect(await webhookSignatureV3(SECRET, body)).toBe(sig);
    expect(await verifyWebhookSignatureV3(SECRET, body, sig)).toBe(true);
  });

  it("invalid or missing", async () => {
    expect(await verifyWebhookSignatureV3(SECRET, { ...body, status: "FAILURE" }, sig)).toBe(false);
    expect(await verifyWebhookSignatureV3(SECRET, body, null)).toBe(false);
    expect(await verifyWebhookSignatureV3(SECRET, body, "")).toBe(false);
  });

  it("dedup key", () => {
    expect(webhookDedupKey(body)).toBe("wh:ref-1:CHECKOUT_FORM_AUTH:SUCCESS");
  });
});

describe("timingSafeEqual", () => {
  it("compares values", async () => {
    expect(await timingSafeEqual("cron-local", "cron-local")).toBe(true);
    expect(await timingSafeEqual("cron-local", "cron-locaL")).toBe(false);
    expect(await timingSafeEqual("cron-local", "cron-local-longer")).toBe(false);
    expect(await timingSafeEqual("", "x")).toBe(false);
  });
});
