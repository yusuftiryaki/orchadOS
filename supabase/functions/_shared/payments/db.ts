// Typed wrappers over the payment_* database functions (docs/musteri-yonetimi.md
// §6.9), called through PostgREST (`/rest/v1/rpc/<fn>`) with the service role.
// ops_can_process_refund is called with the caller's own JWT.
//
// The *_KEYS / *_COLUMNS constants are the contract the database functions
// (İP12-A2) are tested against. PostgREST errors become reason codes: the
// message of our functions is already a short code (§6.10); anything else is
// mapped from the SQLSTATE. Error texts and values are never passed on.

import type { Env, FetchLike } from "./types.ts";

export const PAYMENT_BEGIN_KEYS = [
  "payment_id",
  "order_id",
  "order_number",
  "amount_kurus",
  "currency",
  "items",
  "buyer",
  "billing",
] as const;
export const PAYMENT_BEGIN_ITEM_KEYS = [
  "payment_item_id",
  "line_no",
  "name",
  "amount_kurus",
] as const;
export const PAYMENT_BEGIN_BUYER_KEYS = [
  "id",
  "first_name",
  "last_name",
  "identity_number",
  "email",
  "phone",
  "address",
  "district",
  "city",
  "country",
  "postal_code",
  "registered_at",
] as const;
export const PAYMENT_BEGIN_BILLING_KEYS = [
  "contact_name",
  "address",
  "city",
  "country",
  "postal_code",
] as const;

export const FINALIZE_RESULT_KEYS = [
  "provider_payment_id",
  "provider_amount_kurus",
  "paid_kurus",
  "installment",
  "card_association",
  "card_family",
  "card_last4",
  "fraud_status",
  "failure_code",
  "items",
] as const;
export const FINALIZE_ITEM_KEYS = ["payment_item_id", "provider_item_id"] as const;

export const REFUND_CLAIM_KEYS = [
  "refund_id",
  "number",
  "kind",
  "amount_kurus",
  "currency",
  "provider",
  "provider_payment_id",
  "provider_item_id",
  "payment_succeeded_at",
  "payment_amount_kurus",
] as const;

// Columns this code reads from the table-returning functions (the design
// leaves them to A2; these are the ones B needs).
export const PAYMENT_BY_TOKEN_COLUMNS = [
  "id",
  "order_id",
  "provider",
  "status",
  "amount_kurus",
  "currency",
  "token_expires_at",
  "return_origin",
] as const;
export const RECONCILE_COLUMNS = [
  "id",
  "order_id",
  "provider",
  "status",
  "amount_kurus",
  "currency",
  "provider_token",
  "token_expires_at",
] as const;

export type PaymentRowStatus =
  "initiated" | "pending_review" | "succeeded" | "failed" | "expired" | "voided";
export type FinalizeOutcome = "succeeded" | "failed" | "pending_review" | "expired";
export type PaymentEventType =
  "initialize" | "callback" | "webhook" | "retrieve" | "reconcile" | "cancel" | "refund" | "detail";

export interface PaymentBeginItem {
  payment_item_id: string;
  line_no: number;
  name: string;
  amount_kurus: number;
}

// Buyer personal data: kept in memory only until the provider request.
export interface PaymentBeginBuyer {
  id: string;
  first_name: string;
  last_name: string;
  identity_number: string;
  email: string;
  phone: string;
  address: string;
  district: string | null;
  city: string;
  country: string;
  postal_code: string | null;
  registered_at: string | null;
}

export interface PaymentBeginResult {
  payment_id: string;
  order_id: string;
  order_number: string;
  amount_kurus: number;
  currency: "TRY";
  items: PaymentBeginItem[];
  buyer: PaymentBeginBuyer;
  billing: {
    contact_name: string;
    address: string;
    city: string;
    country: string;
    postal_code: string | null;
  };
}

export interface PaymentByToken {
  id: string;
  order_id: string;
  provider: "iyzico" | "fake" | "manual";
  status: PaymentRowStatus;
  amount_kurus: number;
  currency: "TRY";
  token_expires_at: string | null;
  return_origin: string | null;
}

export interface ReconcileRow {
  id: string;
  order_id: string;
  provider: "iyzico" | "fake" | "manual";
  status: PaymentRowStatus;
  amount_kurus: number;
  currency: "TRY";
  provider_token: string | null;
  token_expires_at: string | null;
}

export interface FinalizeResult {
  provider_payment_id: string | null;
  provider_amount_kurus: number | null;
  paid_kurus: number | null;
  installment: number | null;
  card_association: string | null;
  card_family: string | null;
  card_last4: string | null;
  fraud_status: -1 | 0 | 1 | null;
  failure_code: string | null;
  items: { payment_item_id: string; provider_item_id: string | null }[];
}

export interface RefundClaim {
  refund_id: string;
  number: string;
  kind: "void" | "refund" | "manual";
  amount_kurus: number;
  currency: "TRY";
  provider: "iyzico" | "fake" | "manual";
  provider_payment_id: string | null;
  provider_item_id: string | null;
  payment_succeeded_at: string | null;
  payment_amount_kurus: number;
}

export interface PaymentEventInput {
  provider: "iyzico" | "fake" | "manual";
  eventType: PaymentEventType;
  dedupKey: string;
  paymentId: string | null;
  refundId: string | null;
  httpStatus: number | null;
  outcome: string | null;
  payload: Record<string, unknown>;
}

export interface DbConfig {
  url: string;
  serviceRoleKey: string;
  anonKey: string;
  fetchImpl?: FetchLike;
}

export function dbConfigFromEnv(env: Env, fetchImpl?: FetchLike): DbConfig {
  return {
    url: env.SUPABASE_URL ?? "",
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    anonKey: env.SUPABASE_ANON_KEY ?? "",
    fetchImpl,
  };
}

export class DbError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
  ) {
    super(code);
    this.name = "DbError";
  }
}

const SQLSTATE_CODES: Record<string, string> = {
  "42501": "forbidden",
  P0002: "not_found",
  "22023": "invalid_input",
  "23505": "exists",
  "55000": "payment_not_open",
  PGRST202: "rpc_missing",
};

export function reasonCode(httpStatus: number, error: unknown): string {
  const e = (error && typeof error === "object" ? error : {}) as {
    code?: unknown;
    message?: unknown;
  };
  if (typeof e.message === "string" && /^[a-z][a-z0-9_]{1,40}$/.test(e.message)) return e.message;
  if (typeof e.code === "string" && SQLSTATE_CODES[e.code]) return SQLSTATE_CODES[e.code];
  if (httpStatus === 401 || httpStatus === 403) return "forbidden";
  return "db_error";
}

async function rpc<T>(
  cfg: DbConfig,
  name: string,
  args: Record<string, unknown>,
  authorization = `Bearer ${cfg.serviceRoleKey}`,
  apikey = cfg.serviceRoleKey,
): Promise<T> {
  const doFetch = cfg.fetchImpl ?? ((input: string, init?: RequestInit) => fetch(input, init));
  let res: Response;
  try {
    res = await doFetch(`${cfg.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey, authorization, "content-type": "application/json" },
      body: JSON.stringify(args),
    });
  } catch {
    throw new DbError("db_unreachable", 0);
  }
  const text = await res.text();
  let body: unknown = null;
  if (text !== "") {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!res.ok) throw new DbError(reasonCode(res.status, body), res.status);
  return body as T;
}

const first = <T>(rows: unknown): T | null =>
  Array.isArray(rows) ? ((rows[0] as T | undefined) ?? null) : ((rows as T | null) ?? null);

export function paymentBegin(
  cfg: DbConfig,
  a: {
    orderId: string;
    userId: string;
    provider: "iyzico" | "fake";
    returnOrigin: string;
  },
) {
  return rpc<PaymentBeginResult>(cfg, "payment_begin", {
    p_order_id: a.orderId,
    p_user_id: a.userId,
    p_provider: a.provider,
    p_return_origin: a.returnOrigin,
  });
}

export async function paymentAttachToken(
  cfg: DbConfig,
  paymentId: string,
  token: string,
  expiresAt: Date,
) {
  await rpc<unknown>(cfg, "payment_attach_token", {
    p_payment_id: paymentId,
    p_token: token,
    p_expires_at: expiresAt.toISOString(),
  });
}

export async function paymentByToken(cfg: DbConfig, token: string): Promise<PaymentByToken | null> {
  return first<PaymentByToken>(await rpc<unknown>(cfg, "payment_by_token", { p_token: token }));
}

// true: the event is new; false: (provider, dedup_key) was already recorded.
// signature_valid is always true: an invalidly signed request is never written.
export async function paymentRecordEvent(cfg: DbConfig, e: PaymentEventInput): Promise<boolean> {
  const out = await rpc<unknown>(cfg, "payment_record_event", {
    p_provider: e.provider,
    p_event_type: e.eventType,
    p_dedup_key: e.dedupKey,
    p_payment_id: e.paymentId,
    p_refund_id: e.refundId,
    p_signature_valid: true,
    p_http_status: e.httpStatus,
    p_outcome: e.outcome,
    p_payload: e.payload,
  });
  return out === true;
}

export function paymentFinalize(
  cfg: DbConfig,
  paymentId: string,
  outcome: FinalizeOutcome,
  result: FinalizeResult,
) {
  return rpc<string>(cfg, "payment_finalize", {
    p_payment_id: paymentId,
    p_outcome: outcome,
    p_result: result,
  });
}

export async function paymentAttemptsToReconcile(
  cfg: DbConfig,
  limit = 50,
): Promise<ReconcileRow[]> {
  const rows = await rpc<unknown>(cfg, "payment_attempts_to_reconcile", {
    p_limit: limit,
  });
  return Array.isArray(rows) ? (rows as ReconcileRow[]) : [];
}

export function paymentRefundClaim(cfg: DbConfig, refundId: string) {
  return rpc<RefundClaim>(cfg, "payment_refund_claim", {
    p_refund_id: refundId,
  });
}

export async function paymentRefundReport(
  cfg: DbConfig,
  a: {
    refundId: string;
    outcome: "succeeded" | "failed";
    kind: "void" | "refund";
    providerRef?: string | null;
    failureCode?: string | null;
    retryable?: boolean | null;
  },
) {
  await rpc<unknown>(cfg, "payment_refund_report", {
    p_refund_id: a.refundId,
    p_outcome: a.outcome,
    p_kind: a.kind,
    p_provider_ref: a.providerRef ?? null,
    p_failure_code: a.failureCode ?? null,
    p_retryable: a.retryable ?? null,
  });
}

// As the caller (ops JWT): the function decides from auth.uid().
export async function opsCanProcessRefund(
  cfg: DbConfig,
  refundId: string,
  authorization: string,
): Promise<boolean> {
  const out = await rpc<unknown>(
    cfg,
    "ops_can_process_refund",
    { p_refund_id: refundId },
    authorization,
    cfg.anonKey,
  );
  return out === true;
}

// The user behind a bearer token, as the Auth API sees it (signature, expiry).
export async function authUserId(
  cfg: DbConfig,
  authorization: string | null,
): Promise<string | null> {
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return null;
  const doFetch = cfg.fetchImpl ?? ((input: string, init?: RequestInit) => fetch(input, init));
  try {
    const res = await doFetch(`${cfg.url}/auth/v1/user`, {
      headers: { apikey: cfg.anonKey, authorization },
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: unknown };
    return typeof user?.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}
