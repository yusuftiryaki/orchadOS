import { describe, expect, it } from "vitest";
import { evaluateRetrieve } from "../../../../../supabase/functions/_shared/payments/acceptance.ts";
import { ITEM_ID, ORDER_ID, PAYMENT_ID } from "./helpers";

const expected = {
  paymentId: PAYMENT_ID,
  orderId: ORDER_ID,
  amountKurus: 1200000,
  currency: "TRY" as const,
};

const success = {
  status: "success",
  paymentStatus: "SUCCESS",
  paymentId: "28000001",
  conversationId: PAYMENT_ID,
  basketId: ORDER_ID,
  currency: "TRY",
  price: 12000.0,
  paidPrice: "12000.00",
  installment: 1,
  fraudStatus: 1,
  cardAssociation: "MASTER_CARD",
  cardFamily: "Bonus",
  lastFourDigits: "0008",
  binNumber: "552879",
  itemTransactions: [{ itemId: ITEM_ID, paymentTransactionId: "29000001", price: 12000 }],
};

describe("evaluateRetrieve", () => {
  it("succeeds when every rule holds", () => {
    const r = evaluateRetrieve(success, expected, true);
    expect(r.outcome).toBe("succeeded");
    expect(r.failureCode).toBeNull();
    expect(r.providerPaymentId).toBe("28000001");
    expect(r.providerAmountKurus).toBe(1200000);
    expect(r.paidKurus).toBe(1200000);
    expect(r.installment).toBe(1);
    expect(r.card).toEqual({ association: "MASTER_CARD", family: "Bonus", last4: "0008" });
    expect(r.items).toEqual([
      { itemId: ITEM_ID, providerItemId: "29000001", amountKurus: 1200000 },
    ]);
  });

  it("fraudStatus 0 -> pending_review", () => {
    const r = evaluateRetrieve({ ...success, fraudStatus: 0 }, expected, true);
    expect(r).toMatchObject({
      outcome: "pending_review",
      fraudStatus: 0,
      failureCode: "fraud_review",
    });
  });

  it("fraudStatus -1 -> failed (fraud_rejected)", () => {
    const r = evaluateRetrieve({ ...success, fraudStatus: -1 }, expected, true);
    expect(r).toMatchObject({ outcome: "failed", fraudStatus: -1, failureCode: "fraud_rejected" });
  });

  it("missing fraudStatus is not a success", () => {
    expect(evaluateRetrieve({ ...success, fraudStatus: undefined }, expected, true).outcome).toBe(
      "pending_review",
    );
  });

  it("invalid signature -> failed (signature_invalid)", () => {
    expect(evaluateRetrieve(success, expected, false)).toMatchObject({
      outcome: "failed",
      failureCode: "signature_invalid",
    });
  });

  it("SUCCESS with another amount -> pending_review, never failed", () => {
    const r = evaluateRetrieve(
      { ...success, price: "11000.00", paidPrice: "11000.00" },
      expected,
      true,
    );
    expect(r).toMatchObject({
      outcome: "pending_review",
      failureCode: "amount_mismatch",
      providerAmountKurus: 1100000,
    });
  });

  it("SUCCESS with an unparseable amount -> pending_review", () => {
    const r = evaluateRetrieve({ ...success, price: "12000.005" }, expected, true);
    expect(r).toMatchObject({
      outcome: "pending_review",
      failureCode: "amount_mismatch",
      providerAmountKurus: null,
    });
  });

  it("SUCCESS in another currency -> pending_review", () => {
    const r = evaluateRetrieve({ ...success, currency: "USD" }, expected, true);
    expect(r).toMatchObject({ outcome: "pending_review", failureCode: "amount_mismatch" });
  });

  it.each([
    ["conversationId", "99999999-9999-4999-8999-999999999999"],
    ["basketId", "99999999-9999-4999-8999-999999999999"],
  ])("SUCCESS with another %s -> pending_review (reference_mismatch)", (field, value) => {
    const r = evaluateRetrieve({ ...success, [field]: value, fraudStatus: -1 }, expected, true);
    expect(r).toMatchObject({
      outcome: "pending_review",
      failureCode: "reference_mismatch",
      providerAmountKurus: 1200000,
    });
  });

  it("FAILURE -> failed with the provider code", () => {
    const r = evaluateRetrieve(
      {
        status: "failure",
        paymentStatus: "FAILURE",
        errorCode: "10051",
        conversationId: PAYMENT_ID,
      },
      expected,
      false,
    );
    expect(r).toMatchObject({ outcome: "failed", failureCode: "iyzico_10051" });
  });

  it.each(["INIT_THREEDS", "CALLBACK_THREEDS", "BKM_POS_SELECTED"])(
    "%s -> not_completed",
    (paymentStatus) => {
      expect(evaluateRetrieve({ status: "success", paymentStatus }, expected, true).outcome).toBe(
        "not_completed",
      );
    },
  );

  it("an API error without paymentStatus -> not_completed", () => {
    const r = evaluateRetrieve({ status: "failure", errorCode: "5115" }, expected, false);
    expect(r).toMatchObject({ outcome: "not_completed", failureCode: "iyzico_5115" });
  });

  it("a success without paymentStatus is not a finished form", () => {
    const r = evaluateRetrieve({ status: "success" }, expected, false);
    expect(r).toMatchObject({ outcome: "not_completed", failureCode: "payment_status_missing" });
  });

  it("drops a malformed card number tail", () => {
    expect(
      evaluateRetrieve({ ...success, lastFourDigits: "55287900" }, expected, true).card?.last4,
    ).toBeNull();
  });
});
