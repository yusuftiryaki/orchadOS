// Response and webhook signatures of iyzico (docs/musteri-yonetimi.md §8.3),
// and a constant-time comparison for secrets.
//
// Response signatures: hex(HMAC-SHA256(secret, fields.join(":"))); prices are
// normalised (no trailing zeros) before signing.

import { hmacSha256Hex } from "./iyzico-auth.ts";
import { normalizePriceForSignature as norm } from "./money.ts";

type Field = unknown;

const str = (v: Field) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

export function responseSignature(secret: string, fields: Field[]): Promise<string> {
  return hmacSha256Hex(secret, fields.map(str).join(":"));
}

// HMAC both values with a fresh random key, then compare the digests: the time
// taken does not depend on where the inputs differ, nor on their lengths.
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const key = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const [ha, hb] = await Promise.all([hmacSha256Hex(key, a), hmacSha256Hex(key, b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

async function matches(expected: string, received: unknown): Promise<boolean> {
  if (typeof received !== "string" || received === "") return false;
  return timingSafeEqual(expected, received.toLowerCase());
}

export interface InitializeResponse {
  conversationId?: Field;
  token?: Field;
  signature?: unknown;
}

export async function initializeSignature(secret: string, r: InitializeResponse): Promise<string> {
  return responseSignature(secret, [r.conversationId, r.token]);
}

export async function verifyInitializeSignature(secret: string, r: InitializeResponse) {
  return matches(await initializeSignature(secret, r), r.signature);
}

export interface RetrieveResponse {
  paymentStatus?: Field;
  paymentId?: Field;
  currency?: Field;
  basketId?: Field;
  conversationId?: Field;
  paidPrice?: Field;
  price?: Field;
  token?: Field;
  signature?: unknown;
}

export async function retrieveSignature(secret: string, r: RetrieveResponse): Promise<string> {
  return responseSignature(secret, [
    r.paymentStatus,
    r.paymentId,
    r.currency,
    r.basketId,
    r.conversationId,
    norm(r.paidPrice),
    norm(r.price),
    r.token,
  ]);
}

export async function verifyRetrieveSignature(secret: string, r: RetrieveResponse) {
  return matches(await retrieveSignature(secret, r), r.signature);
}

// Refund and cancel (void) responses.
export interface RefundResponse {
  paymentId?: Field;
  price?: Field;
  currency?: Field;
  conversationId?: Field;
  signature?: unknown;
}

export async function refundSignature(secret: string, r: RefundResponse): Promise<string> {
  return responseSignature(secret, [r.paymentId, norm(r.price), r.currency, r.conversationId]);
}

export async function verifyRefundSignature(secret: string, r: RefundResponse) {
  return matches(await refundSignature(secret, r), r.signature);
}

// Webhook V3 (Checkout Form / hosted payment page notifications), header
// x-iyz-signature-v3.
export interface WebhookBody {
  iyziEventType?: Field;
  iyziPaymentId?: Field;
  token?: Field;
  paymentConversationId?: Field;
  status?: Field;
  iyziReferenceCode?: Field;
}

export function webhookSignatureV3(secret: string, b: WebhookBody): Promise<string> {
  return hmacSha256Hex(
    secret,
    secret +
      str(b.iyziEventType) +
      str(b.iyziPaymentId) +
      str(b.token) +
      str(b.paymentConversationId) +
      str(b.status),
  );
}

export async function verifyWebhookSignatureV3(secret: string, b: WebhookBody, header: unknown) {
  return matches(await webhookSignatureV3(secret, b), header);
}

export function webhookDedupKey(b: WebhookBody): string {
  return `wh:${str(b.iyziReferenceCode)}:${str(b.iyziEventType)}:${str(b.status)}`;
}
