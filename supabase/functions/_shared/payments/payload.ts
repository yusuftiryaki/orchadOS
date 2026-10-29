// What of a provider answer may be stored in private.payment_event.payload.
// An allowlist: buyer data, card BIN, card tokens, tokens, page URLs and
// free-text messages are dropped (docs/musteri-yonetimi.md §8.7). A kept
// string that holds a TCKN-shaped number (11 digits) is masked: the TCKN
// never enters an event payload (kararlar.md H16, T13).

import { TCKN_PATTERN } from "./identity.ts";

const TCKN_GLOBAL = new RegExp(TCKN_PATTERN.source, "g");
// Our own ids (conversationId, basketId) are uuids: kept as they are.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function maskTckn(v: string): string {
  return UUID.test(v) ? v : v.replace(TCKN_GLOBAL, "***********");
}

const TOP_LEVEL = new Set([
  "status",
  "paymentStatus",
  "errorCode",
  "errorGroup",
  "locale",
  "systemTime",
  "conversationId",
  "basketId",
  "paymentId",
  "price",
  "paidPrice",
  "currency",
  "installment",
  "fraudStatus",
  "mdStatus",
  "cardAssociation",
  "cardFamily",
  "cardType",
  "lastFourDigits",
  "tokenExpireTime",
  "iyziEventType",
  "iyziEventTime",
  "iyziReferenceCode",
  "iyziPaymentId",
  "paymentConversationId",
  "paymentTransactionId",
  "hostReference",
  "provider",
  "outcome",
  "reason",
]);

const ITEM_FIELDS = new Set([
  "itemId",
  "paymentTransactionId",
  "transactionStatus",
  "price",
  "paidPrice",
]);

const MAX_STRING = 100;
const MAX_ITEMS = 20;

function scalar(v: unknown): string | number | boolean | null | undefined {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return maskTckn(v.slice(0, MAX_STRING));
  return undefined;
}

function pick(source: Record<string, unknown>, allowed: Set<string>) {
  const out: Record<string, string | number | boolean | null> = {};
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) continue;
    const value = scalar(source[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function safePayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const out: Record<string, unknown> = pick(source, TOP_LEVEL);
  if (Array.isArray(source.itemTransactions)) {
    out.itemTransactions = source.itemTransactions
      .slice(0, MAX_ITEMS)
      .filter(
        (it): it is Record<string, unknown> => !!it && typeof it === "object" && !Array.isArray(it),
      )
      .map((it) => pick(it, ITEM_FIELDS));
  }
  return out;
}
