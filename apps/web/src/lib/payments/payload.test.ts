import { describe, expect, it } from "vitest";
import { TCKN_PATTERN } from "../../../../../supabase/functions/_shared/payments/identity.ts";
import { safePayload } from "../../../../../supabase/functions/_shared/payments/payload.ts";

describe("safePayload", () => {
  it("keeps allowlisted fields and drops personal and card data", () => {
    const raw = {
      status: "success",
      paymentStatus: "SUCCESS",
      paymentId: "28000001",
      price: 120,
      fraudStatus: 1,
      lastFourDigits: "0008",
      binNumber: "552879",
      cardToken: "ct",
      cardUserKey: "cuk",
      token: "secret-token",
      signature: "abc",
      errorMessage: "Ali Veli kartı reddedildi",
      paymentPageUrl: "https://sandbox-cpp.iyzipay.com?token=x",
      checkoutFormContent: "<script>",
      buyer: {
        name: "Ali",
        identityNumber: "11111111111",
        email: "a@example.com",
        gsmNumber: "+905350000000",
      },
      billingAddress: { address: "Nidakule" },
      itemTransactions: [
        {
          itemId: "i1",
          paymentTransactionId: "t1",
          price: 120,
          convertedPayout: { iyziCommissionFee: 1 },
          subMerchantKey: "x",
        },
      ],
    };
    const out = safePayload(raw);
    expect(out).toEqual({
      status: "success",
      paymentStatus: "SUCCESS",
      paymentId: "28000001",
      price: 120,
      fraudStatus: 1,
      lastFourDigits: "0008",
      itemTransactions: [{ itemId: "i1", paymentTransactionId: "t1", price: 120 }],
    });
    const text = JSON.stringify(out);
    for (const pii of [
      "Ali",
      "11111111111",
      "a@example.com",
      "+905350000000",
      "552879",
      "secret-token",
      "Nidakule",
    ]) {
      expect(text).not.toContain(pii);
    }
  });

  it("drops nested objects under allowed keys and truncates strings", () => {
    const out = safePayload({ status: { nested: true }, errorCode: "x".repeat(500) });
    expect(out).toEqual({ errorCode: "x".repeat(100) });
  });

  it("returns an empty object for non-objects", () => {
    expect(safePayload(null)).toEqual({});
    expect(safePayload("text")).toEqual({});
    expect(safePayload([1, 2])).toEqual({});
  });

  it("never keeps a TCKN-shaped value, wherever the provider puts it (T13, H16)", () => {
    const raw = {
      status: "failure",
      errorCode: "10000000146",
      errorMessage: "Kimlik 10000000146 geçersiz",
      buyer: { identityNumber: "10000000146" },
      identityNumber: "10000000146",
      reason: "buyer 10000000146",
      itemTransactions: [{ itemId: "10000000146", price: 1 }],
    };
    const out = JSON.stringify(safePayload(raw));
    expect(out).not.toMatch(TCKN_PATTERN);
    // Our uuids stay intact even when a group holds eleven digits.
    const id = "0a1b2c3d-0000-4000-8000-a12345678901";
    expect(safePayload({ conversationId: id })).toEqual({ conversationId: id });
  });
});
