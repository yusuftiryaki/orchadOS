// Provider-independent payment interface (docs/musteri-yonetimi.md §8.2).
//
// Everything under _shared/payments is plain TypeScript: no Deno APIs and only
// relative imports with a .ts extension, so the same code runs in the Edge
// Functions (Deno) and in the web app's Vitest suite (Node 22).

export type PaymentProviderId = "iyzico" | "fake";

export interface CheckoutItem {
  id: string; // payment_item.id
  name: string;
  amountKurus: number;
}

export interface CheckoutBuyer {
  id: string;
  name: string;
  surname: string;
  identityNumber: string;
  email: string;
  gsmNumber: string;
  registrationAddress: string;
  city: string;
  country: string;
  zipCode?: string;
  ip: string;
  registrationDate?: string; // "YYYY-MM-DD HH:mm:ss"
}

export interface CheckoutBilling {
  contactName: string;
  address: string;
  city: string;
  country: string;
  zipCode?: string;
}

export interface StartCheckoutInput {
  paymentId: string;
  orderId: string;
  amountKurus: number;
  currency: "TRY";
  items: CheckoutItem[];
  buyer: CheckoutBuyer;
  billing: CheckoutBilling;
  callbackUrl: string;
  returnOrigin: string;
  installments: number[];
}

export type StartCheckoutResult =
  | {
      ok: true;
      redirectUrl: string;
      providerToken: string;
      expiresAt: Date;
      raw: unknown;
    }
  | { ok: false; error: string; raw: unknown };

// Taken from the payment row, never from the order (§5.4).
export interface ConfirmExpectation {
  paymentId: string;
  orderId: string;
  amountKurus: number;
  currency: "TRY";
}

export type ConfirmOutcome = "succeeded" | "failed" | "pending_review" | "not_completed";

export interface ConfirmCard {
  association: string | null;
  family: string | null;
  last4: string | null;
}

export interface ConfirmItem {
  itemId: string;
  providerItemId: string | null;
  amountKurus: number | null;
}

export interface ConfirmResult {
  outcome: ConfirmOutcome;
  providerPaymentId: string | null;
  providerAmountKurus: number | null;
  paidKurus: number | null;
  installment: number | null;
  card: ConfirmCard | null;
  items: ConfirmItem[];
  fraudStatus: -1 | 0 | 1 | null;
  // For not_completed: null when the buyer has not finished the form; set
  // when the provider answered with an error and the state is unknown.
  failureCode: string | null;
  raw: unknown;
}

export interface WebhookVerification {
  valid: boolean;
  // Reason code when invalid: signature_missing, signature_invalid, invalid_body.
  reason: string | null;
  providerToken: string | null;
  eventType: string | null;
  dedupKey: string | null;
  raw: unknown;
}

export interface RefundInput {
  refundId: string;
  kind: "void" | "refund";
  providerPaymentId: string;
  providerItemId: string | null;
  amountKurus: number;
  currency: "TRY";
  ip: string;
}

// "unknown": the provider may or may not have moved the money (timeout, or a
// response we cannot trust). The refund row stays `processing` for ops.
export type RefundResult =
  | { status: "succeeded"; providerRef: string | null; raw: unknown }
  | { status: "failed"; failureCode: string; retryable: boolean; raw: unknown }
  | { status: "unknown"; failureCode: string; raw: unknown; detail?: unknown };

export interface PaymentProvider {
  id: PaymentProviderId;
  startCheckout(input: StartCheckoutInput): Promise<StartCheckoutResult>;
  readCallback(form: URLSearchParams): { providerToken: string | null };
  confirm(token: string, expected: ConfirmExpectation): Promise<ConfirmResult>;
  verifyWebhook(headers: Headers, rawBody: string): Promise<WebhookVerification>;
  refund(input: RefundInput): Promise<RefundResult>;
}

// Thrown by confirm() when the provider could not be asked (timeout, network,
// unreadable answer). The attempt is left as it is; reconciliation retries.
export class ProviderUnavailableError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ProviderUnavailableError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type Env = Record<string, string | undefined>;
