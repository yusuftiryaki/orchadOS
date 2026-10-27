// Fake provider for local development, CI and the hosted test project
// (docs/musteri-yonetimi.md §8.6). It is chosen only when PAYMENT_PROVIDER is
// "fake" and PAYMENT_FAKE_ALLOWED is "1" (provider.ts); the database refuses a
// succeeded fake payment unless org_billing_setting.allow_fake_payments is on.
//
// - token: fake_<paymentId>_<random>; the checkout page is
//   <returnOrigin>/odeme/sahte?token=…&tutar=… (apps/web), valid 30 minutes.
// - confirm: decided by the `outcome` the fake page posted with the callback
//   (success | failure | review), or that a signed fake webhook carried. Both
//   are read on the same provider instance before confirm(); without one the
//   payment is not_completed (reconciliation).
// - webhook: x-fake-signature = hex(HMAC-SHA256(FAKE_WEBHOOK_SECRET, body)),
//   body {"token": …, "outcome": …}.
// - refund: always succeeds.

import { hmacSha256Hex } from "./iyzico-auth.ts";
import { timingSafeEqual } from "./iyzico-signatures.ts";
import { kurusToPrice } from "./money.ts";
import type { ConfirmResult, PaymentProvider, WebhookVerification } from "./types.ts";

export const FAKE_TOKEN_TTL_MS = 30 * 60 * 1000;
export const FAKE_OUTCOMES = ["success", "failure", "review"] as const;
export type FakeOutcome = (typeof FAKE_OUTCOMES)[number];

const TOKEN_RE = /^fake_[0-9a-f-]{36}_[0-9a-z]{8,32}$/;

export const isFakeToken = (token: string) => TOKEN_RE.test(token);

const isOutcome = (v: unknown): v is FakeOutcome =>
  typeof v === "string" && (FAKE_OUTCOMES as readonly string[]).includes(v);

function randomSuffix(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface FakeConfig {
  webhookSecret?: string;
}

export function fakeProvider(config: FakeConfig = {}): PaymentProvider {
  // token -> outcome seen in this request (callback form or signed webhook).
  const outcomes = new Map<string, FakeOutcome>();

  return {
    id: "fake",

    async startCheckout(input) {
      const providerToken = `fake_${input.paymentId}_${randomSuffix()}`;
      const url = new URL("/odeme/sahte", input.returnOrigin);
      url.searchParams.set("token", providerToken);
      url.searchParams.set("tutar", kurusToPrice(input.amountKurus));
      return {
        ok: true,
        redirectUrl: url.toString(),
        providerToken,
        expiresAt: new Date(Date.now() + FAKE_TOKEN_TTL_MS),
        raw: { provider: "fake" },
      };
    },

    readCallback(form) {
      const token = form.get("token");
      if (!token || !isFakeToken(token)) return { providerToken: null };
      const outcome = form.get("outcome");
      if (isOutcome(outcome)) outcomes.set(token, outcome);
      return { providerToken: token };
    },

    async confirm(token, expected): Promise<ConfirmResult> {
      const outcome = outcomes.get(token);
      const paid = outcome === "success" || outcome === "review";
      const base: ConfirmResult = {
        outcome: "not_completed",
        providerPaymentId: paid ? `fake_pay_${expected.paymentId}` : null,
        providerAmountKurus: paid ? expected.amountKurus : null,
        paidKurus: paid ? expected.amountKurus : null,
        installment: paid ? 1 : null,
        card: paid ? { association: "FAKE", family: "Sahte", last4: "0000" } : null,
        items: [],
        fraudStatus: outcome === "success" ? 1 : outcome === "review" ? 0 : null,
        failureCode: null,
        raw: { provider: "fake", outcome: outcome ?? null },
      };
      if (outcome === "success") return { ...base, outcome: "succeeded" };
      if (outcome === "review")
        return {
          ...base,
          outcome: "pending_review",
          failureCode: "fraud_review",
        };
      if (outcome === "failure")
        return { ...base, outcome: "failed", failureCode: "card_declined" };
      return base;
    },

    async verifyWebhook(headers, rawBody): Promise<WebhookVerification> {
      const invalid = (reason: string): WebhookVerification => ({
        valid: false,
        reason,
        providerToken: null,
        eventType: null,
        dedupKey: null,
        raw: null,
      });
      const header = headers.get("x-fake-signature");
      if (!header) return invalid("signature_missing");
      if (!config.webhookSecret) return invalid("signature_invalid");
      const expected = await hmacSha256Hex(config.webhookSecret, rawBody);
      if (!(await timingSafeEqual(expected, header.toLowerCase())))
        return invalid("signature_invalid");
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return invalid("invalid_body");
      }
      const token = body?.token;
      if (typeof token !== "string" || !isFakeToken(token) || !isOutcome(body.outcome)) {
        return invalid("invalid_body");
      }
      outcomes.set(token, body.outcome);
      return {
        valid: true,
        reason: null,
        providerToken: token,
        eventType: "fake",
        dedupKey: `wh:fake:${token}:${body.outcome}`,
        raw: { outcome: body.outcome },
      };
    },

    async refund(input) {
      return {
        status: "succeeded",
        providerRef: `fake_refund_${input.refundId}`,
        raw: { provider: "fake" },
      };
    },
  };
}
