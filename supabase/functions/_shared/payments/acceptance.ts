// Acceptance rules for a Checkout Form retrieve answer
// (docs/musteri-yonetimi.md §8.5). Pure: the caller checks the signature.
//
// succeeded needs all of: valid signature; status = success and
// paymentStatus = SUCCESS; conversationId = payment.id and basketId =
// payment.order_id; currency = TRY; price = payment.amount_kurus;
// fraudStatus = 1. A SUCCESS that fails any of the reference / currency /
// amount checks is never written as failed: money may have moved, so it goes
// to pending_review (ops, plus a provider_mismatch void opened by the database).

import { priceToKurus } from "./money.ts";
import type { ConfirmExpectation, ConfirmItem, ConfirmResult } from "./types.ts";

export interface RetrieveAnswer {
  status?: unknown;
  paymentStatus?: unknown;
  errorCode?: unknown;
  paymentId?: unknown;
  conversationId?: unknown;
  basketId?: unknown;
  currency?: unknown;
  price?: unknown;
  paidPrice?: unknown;
  installment?: unknown;
  fraudStatus?: unknown;
  cardAssociation?: unknown;
  cardFamily?: unknown;
  lastFourDigits?: unknown;
  itemTransactions?: unknown;
}

// paymentStatus values of a form the buyer has not finished (3DS pending etc.).
const NOT_COMPLETED = new Set([
  "INIT_THREEDS",
  "CALLBACK_THREEDS",
  "BKM_POS_SELECTED",
  "CALLBACK_PECCO",
]);

const text = (v: unknown): string | null =>
  typeof v === "string" ? v : typeof v === "number" ? String(v) : null;

export function providerErrorCode(errorCode: unknown): string {
  const code = text(errorCode)
    ?.toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 40);
  return code ? `iyzico_${code}` : "iyzico_error";
}

function fraud(v: unknown): -1 | 0 | 1 | null {
  const n = typeof v === "string" ? Number(v) : v;
  return n === -1 || n === 0 || n === 1 ? n : null;
}

function installment(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

function items(v: unknown): ConfirmItem[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((it) => {
    if (!it || typeof it !== "object") return [];
    const row = it as Record<string, unknown>;
    const itemId = text(row.itemId);
    if (!itemId) return [];
    return [
      {
        itemId,
        providerItemId: text(row.paymentTransactionId),
        amountKurus: priceToKurus(text(row.price)),
      },
    ];
  });
}

function last4(v: unknown): string | null {
  const s = text(v);
  return s && /^[0-9]{4}$/.test(s) ? s : null;
}

export function evaluateRetrieve(
  answer: RetrieveAnswer,
  expected: ConfirmExpectation,
  signatureValid: boolean,
): ConfirmResult {
  const providerAmountKurus = priceToKurus(text(answer.price));
  const base: ConfirmResult = {
    outcome: "not_completed",
    providerPaymentId: text(answer.paymentId),
    providerAmountKurus,
    paidKurus: priceToKurus(text(answer.paidPrice)),
    installment: installment(answer.installment),
    card:
      answer.cardAssociation || answer.cardFamily || answer.lastFourDigits
        ? {
            association: text(answer.cardAssociation),
            family: text(answer.cardFamily),
            last4: last4(answer.lastFourDigits),
          }
        : null,
    items: items(answer.itemTransactions),
    fraudStatus: fraud(answer.fraudStatus),
    failureCode: null,
    raw: answer,
  };

  const paymentStatus = text(answer.paymentStatus);

  if (answer.status === "success" && paymentStatus === "SUCCESS") {
    if (!signatureValid) return { ...base, outcome: "failed", failureCode: "signature_invalid" };
    if (answer.conversationId !== expected.paymentId || answer.basketId !== expected.orderId) {
      return {
        ...base,
        outcome: "pending_review",
        failureCode: "reference_mismatch",
      };
    }
    if (
      answer.currency !== expected.currency ||
      providerAmountKurus === null ||
      providerAmountKurus !== expected.amountKurus ||
      base.paidKurus === null
    ) {
      return {
        ...base,
        outcome: "pending_review",
        failureCode: "amount_mismatch",
      };
    }
    if (base.fraudStatus === -1)
      return { ...base, outcome: "failed", failureCode: "fraud_rejected" };
    if (base.fraudStatus !== 1)
      return {
        ...base,
        outcome: "pending_review",
        failureCode: "fraud_review",
      };
    return { ...base, outcome: "succeeded" };
  }

  if (paymentStatus === "FAILURE") {
    return {
      ...base,
      outcome: "failed",
      failureCode: answer.errorCode ? providerErrorCode(answer.errorCode) : "payment_failed",
    };
  }

  if (paymentStatus === null || NOT_COMPLETED.has(paymentStatus) || answer.status !== "success") {
    // Not paid (yet). A failure without paymentStatus is an API error (e.g. an
    // unknown or expired token): the code is kept for the event log only.
    return {
      ...base,
      outcome: "not_completed",
      failureCode: answer.status === "success" ? null : providerErrorCode(answer.errorCode),
    };
  }

  // A paymentStatus we do not know: never guess, let ops look.
  return { ...base, outcome: "pending_review", failureCode: "unknown_status" };
}
