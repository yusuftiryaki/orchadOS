// Chooses the payment provider for an id (PAYMENT_PROVIDER for new payments,
// payment.provider for callbacks, webhooks, reconciliation and refunds).
//
// null when the id is empty or unknown, when iyzico is not configured, and for
// "fake" unless both locks are open: PAYMENT_PROVIDER === "fake" and
// PAYMENT_FAKE_ALLOWED === "1" (never set on the pilot project).

import { fakeProvider } from "./fake.ts";
import { iyzicoProvider } from "./iyzico.ts";
import type { Env, FetchLike, PaymentProvider } from "./types.ts";

export function fakePaymentsAllowed(env: Env): boolean {
  return env.PAYMENT_PROVIDER === "fake" && env.PAYMENT_FAKE_ALLOWED === "1";
}

export function choosePaymentProvider(
  id: string | null | undefined,
  env: Env,
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): PaymentProvider | null {
  switch (id) {
    case "iyzico": {
      const apiKey = env.IYZICO_API_KEY;
      const secretKey = env.IYZICO_SECRET_KEY;
      const baseUrl = env.IYZICO_BASE_URL;
      if (!apiKey || !secretKey || !baseUrl) return null;
      return iyzicoProvider({ apiKey, secretKey, baseUrl }, fetchImpl);
    }
    case "fake":
      return fakePaymentsAllowed(env)
        ? fakeProvider({ webhookSecret: env.FAKE_WEBHOOK_SECRET })
        : null;
    default:
      return null;
  }
}

// IYZICO_ENABLED_INSTALLMENTS, e.g. "1" (default) or "1,2,3,6".
export function enabledInstallments(env: Env): number[] {
  const list = (env.IYZICO_ENABLED_INSTALLMENTS ?? "1")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
  return list.length > 0 ? [...new Set(list)].sort((a, b) => a - b) : [1];
}
