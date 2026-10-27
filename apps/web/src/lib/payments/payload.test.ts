import { describe, expect, it } from "vitest";
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
});
