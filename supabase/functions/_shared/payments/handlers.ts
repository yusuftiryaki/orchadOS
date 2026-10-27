// Request handlers of the payment Edge Functions (payments, payment-callback,
// payment-webhook). They live here, free of Deno APIs, so that the web app's
// Vitest suite can drive them with a mocked fetch; each index.ts only passes
// the environment in. Contracts: docs/musteri-yonetimi.md §8.4.
//
// Logging is reason codes only: never buyer data, tokens, bodies or provider
// texts.

import {
  DbError,
  authUserId,
  dbConfigFromEnv,
  opsCanProcessRefund,
  paymentAttachToken,
  paymentAttemptsToReconcile,
  paymentBegin,
  paymentByToken,
  paymentFinalize,
  paymentRecordEvent,
  paymentRefundClaim,
  paymentRefundReport,
  type DbConfig,
  type FinalizeOutcome,
  type FinalizeResult,
  type PaymentBeginResult,
  type PaymentByToken,
  type PaymentEventType,
} from "./db.ts";
import { timingSafeEqual } from "./iyzico-signatures.ts";
import { isAllowedReturnOrigin } from "./origins.ts";
import { safePayload } from "./payload.ts";
import { choosePaymentProvider, enabledInstallments } from "./provider.ts";
import {
  ProviderUnavailableError,
  type ConfirmExpectation,
  type ConfirmResult,
  type Env,
  type FetchLike,
  type PaymentProvider,
  type StartCheckoutInput,
} from "./types.ts";

export interface HandlerDeps {
  env: Env;
  fetchImpl?: FetchLike;
  now?: () => Date;
  log?: (code: string) => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IP_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:.]{2,45})$/;

// An expired token is given up as `expired` only after this grace period.
export const EXPIRE_GRACE_MS = 5 * 60 * 1000;
export const RECONCILE_LIMIT = 50;

const FINAL_STATUSES = new Set(["succeeded", "failed", "voided"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const fail = (error: string, status: number) => json({ error }, status);

function redirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location, "cache-control": "no-store" },
  });
}

function context(deps: HandlerDeps) {
  const fetchImpl = deps.fetchImpl ?? ((input: string, init?: RequestInit) => fetch(input, init));
  return {
    env: deps.env,
    fetchImpl,
    db: dbConfigFromEnv(deps.env, fetchImpl),
    now: deps.now ?? (() => new Date()),
    log: deps.log ?? ((code: string) => console.warn(`payments: ${code}`)),
  };
}

type Ctx = ReturnType<typeof context>;

function finalizeResult(r: ConfirmResult): FinalizeResult {
  return {
    provider_payment_id: r.providerPaymentId,
    provider_amount_kurus: r.providerAmountKurus,
    paid_kurus: r.paidKurus,
    installment: r.installment,
    card_association: r.card?.association ?? null,
    card_family: r.card?.family ?? null,
    card_last4: r.card?.last4 ?? null,
    fraud_status: r.fraudStatus,
    failure_code: r.failureCode,
    items: r.items.map((it) => ({
      payment_item_id: it.itemId,
      provider_item_id: it.providerItemId,
    })),
  };
}

function failedResult(failureCode: string): FinalizeResult {
  return {
    provider_payment_id: null,
    provider_amount_kurus: null,
    paid_kurus: null,
    installment: null,
    card_association: null,
    card_family: null,
    card_last4: null,
    fraud_status: null,
    failure_code: failureCode,
    items: [],
  };
}

const expectationOf = (row: {
  id: string;
  order_id: string;
  amount_kurus: number;
}): ConfirmExpectation => ({
  paymentId: row.id,
  orderId: row.order_id,
  amountKurus: row.amount_kurus,
  currency: "TRY",
});

// Records an event; a failure to record is logged and does not stop the flow
// (the payment state itself is written by payment_finalize).
async function record(
  ctx: Ctx,
  provider: PaymentProvider["id"],
  eventType: PaymentEventType,
  dedupKey: string,
  ids: { paymentId?: string | null; refundId?: string | null },
  outcome: string | null,
  raw: unknown,
): Promise<boolean | null> {
  try {
    return await paymentRecordEvent(ctx.db, {
      provider,
      eventType,
      dedupKey,
      paymentId: ids.paymentId ?? null,
      refundId: ids.refundId ?? null,
      httpStatus: null,
      outcome,
      payload: safePayload(raw),
    });
  } catch (err) {
    ctx.log(`record_event_${err instanceof DbError ? err.code : "error"}`);
    return null;
  }
}

// confirm() plus its event. null when the provider could not be asked.
async function confirmAndRecord(
  ctx: Ctx,
  provider: PaymentProvider,
  eventType: PaymentEventType,
  token: string,
  row: { id: string; order_id: string; amount_kurus: number },
): Promise<ConfirmResult | null> {
  let result: ConfirmResult;
  try {
    result = await provider.confirm(token, expectationOf(row));
  } catch (err) {
    const code = err instanceof ProviderUnavailableError ? err.code : "provider_error";
    ctx.log(`confirm_${code}`);
    await record(
      ctx,
      provider.id,
      eventType,
      `retrieve:${token}:${code}`,
      { paymentId: row.id },
      code,
      null,
    );
    return null;
  }
  await record(
    ctx,
    provider.id,
    eventType,
    `retrieve:${token}:${result.outcome}`,
    { paymentId: row.id },
    result.outcome,
    result.raw,
  );
  return result;
}

async function finalize(
  ctx: Ctx,
  paymentId: string,
  outcome: FinalizeOutcome,
  result: FinalizeResult,
) {
  try {
    await paymentFinalize(ctx.db, paymentId, outcome, result);
    return true;
  } catch (err) {
    ctx.log(`finalize_${err instanceof DbError ? err.code : "error"}`);
    return false;
  }
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- payments

export async function handlePayments(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  const ctx = context(deps);
  const body = await readJson(req);
  switch (body?.action) {
    case "start":
      return start(ctx, req, body);
    case "refund":
      return refund(ctx, req, body);
    case "reconcile":
      return reconcile(ctx, req);
    default:
      return fail("invalid_input", 400);
  }
}

const BEGIN_STATUS: Record<string, [string, number]> = {
  invalid_input: ["invalid_input", 400],
  not_found: ["not_found", 404],
  forbidden: ["not_found", 404],
  order_not_payable: ["order_not_payable", 409],
  billing_profile_incomplete: ["billing_profile_incomplete", 409],
  fake_payments_disabled: ["payments_disabled", 503],
};

// "2026-10-27T10:11:12.000Z" -> "2026-10-27 10:11:12" (iyzico's format).
function iyzicoDate(iso: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 19).replace("T", " ");
}

function checkoutInput(
  begin: PaymentBeginResult,
  env: Env,
  clientIp: string,
  returnOrigin: string,
): StartCheckoutInput {
  const { buyer, billing } = begin;
  return {
    paymentId: begin.payment_id,
    orderId: begin.order_id,
    amountKurus: begin.amount_kurus,
    currency: "TRY",
    items: begin.items.map((it) => ({
      id: it.payment_item_id,
      name: it.name,
      amountKurus: it.amount_kurus,
    })),
    buyer: {
      id: buyer.id,
      name: buyer.first_name,
      surname: buyer.last_name,
      identityNumber: buyer.identity_number,
      email: buyer.email,
      gsmNumber: buyer.phone,
      registrationAddress: [buyer.address, buyer.district].filter(Boolean).join(", "),
      city: buyer.city,
      country: buyer.country,
      zipCode: buyer.postal_code ?? undefined,
      ip: clientIp,
      registrationDate: iyzicoDate(buyer.registered_at),
    },
    billing: {
      contactName: billing.contact_name,
      address: billing.address,
      city: billing.city,
      country: billing.country,
      zipCode: billing.postal_code ?? undefined,
    },
    callbackUrl:
      env.PAYMENT_CALLBACK_URL || `${env.SUPABASE_URL ?? ""}/functions/v1/payment-callback`,
    returnOrigin,
    installments: enabledInstallments(env),
  };
}

async function start(ctx: Ctx, req: Request, body: Record<string, unknown>): Promise<Response> {
  const userId = await authUserId(ctx.db, req.headers.get("authorization"));
  if (!userId) return fail("unauthorized", 401);

  const { order_id: orderId, return_origin: returnOrigin, client_ip: clientIp } = body;
  if (
    typeof orderId !== "string" ||
    !UUID_RE.test(orderId) ||
    typeof returnOrigin !== "string" ||
    typeof clientIp !== "string" ||
    !IP_RE.test(clientIp)
  ) {
    return fail("invalid_input", 400);
  }

  const providerId = ctx.env.PAYMENT_PROVIDER;
  const provider = choosePaymentProvider(providerId, ctx.env, ctx.fetchImpl);
  if (!provider) return fail("payments_disabled", 503);

  if (
    !isAllowedReturnOrigin(
      returnOrigin,
      ctx.env.PAYMENT_RETURN_ORIGINS,
      ctx.env.PAYMENT_ALLOW_PREVIEW_ORIGINS === "1",
    )
  ) {
    return fail("invalid_input", 400);
  }

  let begin: PaymentBeginResult;
  try {
    begin = await paymentBegin(ctx.db, {
      orderId,
      userId,
      provider: provider.id,
      returnOrigin,
    });
  } catch (err) {
    const code = err instanceof DbError ? err.code : "error";
    const mapped = BEGIN_STATUS[code];
    if (mapped) return fail(mapped[0], mapped[1]);
    ctx.log(`begin_${code}`);
    return fail("failed", 500);
  }

  const result = await provider
    .startCheckout(checkoutInput(begin, ctx.env, clientIp, returnOrigin))
    .catch(() => ({ ok: false as const, error: "provider_error", raw: null }));
  // begin (with the buyer's personal data) is not used past this point.
  const paymentId = begin.payment_id;

  await record(
    ctx,
    provider.id,
    "initialize",
    `init:${paymentId}`,
    { paymentId },
    result.ok ? "ok" : result.error,
    result.raw,
  );

  if (!result.ok) {
    ctx.log(`start_${result.error}`);
    await finalize(ctx, paymentId, "failed", failedResult(result.error));
    return fail("provider_error", 502);
  }

  try {
    await paymentAttachToken(ctx.db, paymentId, result.providerToken, result.expiresAt);
  } catch (err) {
    ctx.log(`attach_${err instanceof DbError ? err.code : "error"}`);
    await finalize(ctx, paymentId, "failed", failedResult("attach_failed"));
    return fail("failed", 500);
  }

  return json({ payment_id: paymentId, redirect_url: result.redirectUrl });
}

const CLAIM_STATUS: Record<string, [string, number]> = {
  not_found: ["not_found", 404],
  refund_not_open: ["refund_not_open", 409],
  refund_exceeds_payment: ["refund_not_open", 409],
  invalid_input: ["invalid_input", 400],
};

function attemptId(): string {
  return [...crypto.getRandomValues(new Uint8Array(6))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function refund(ctx: Ctx, req: Request, body: Record<string, unknown>): Promise<Response> {
  const authorization = req.headers.get("authorization");
  const userId = await authUserId(ctx.db, authorization);
  if (!userId || !authorization) return fail("unauthorized", 401);

  const refundId = body.refund_id;
  if (typeof refundId !== "string" || !UUID_RE.test(refundId)) return fail("invalid_input", 400);
  const ip =
    typeof body.client_ip === "string" && IP_RE.test(body.client_ip) ? body.client_ip : "127.0.0.1";

  try {
    if (!(await opsCanProcessRefund(ctx.db, refundId, authorization)))
      return fail("forbidden", 403);
  } catch (err) {
    const code = err instanceof DbError ? err.code : "error";
    if (code === "not_found") return fail("not_found", 404);
    if (code === "forbidden") return fail("forbidden", 403);
    ctx.log(`can_refund_${code}`);
    return fail("failed", 500);
  }

  let claim;
  try {
    claim = await paymentRefundClaim(ctx.db, refundId);
  } catch (err) {
    const code = err instanceof DbError ? err.code : "error";
    const mapped = CLAIM_STATUS[code];
    if (mapped) return fail(mapped[0], mapped[1]);
    ctx.log(`claim_${code}`);
    return fail("failed", 500);
  }
  if (claim.kind === "manual") return fail("refund_not_open", 409);
  const kind = claim.kind;

  const provider =
    claim.provider === "manual"
      ? null
      : choosePaymentProvider(claim.provider, ctx.env, ctx.fetchImpl);
  if (!provider || !claim.provider_payment_id) {
    // Claimed (processing) but nothing was sent: give it back as failed, retryable.
    const failureCode = provider ? "provider_reference_missing" : "payments_disabled";
    await paymentRefundReport(ctx.db, {
      refundId,
      outcome: "failed",
      kind,
      failureCode,
      retryable: true,
    }).catch(() => ctx.log("report_error"));
    return provider
      ? json({
          status: "failed",
          kind,
          failure_code: failureCode,
          retryable: true,
        })
      : fail("payments_disabled", 503);
  }

  const attempt = attemptId();
  const result = await provider
    .refund({
      refundId,
      kind,
      providerPaymentId: claim.provider_payment_id,
      providerItemId: claim.provider_item_id,
      amountKurus: claim.amount_kurus,
      currency: "TRY",
      ip,
    })
    .catch(() => ({
      status: "unknown" as const,
      failureCode: "provider_error",
      raw: null,
    }));

  await record(
    ctx,
    provider.id,
    kind === "void" ? "cancel" : "refund",
    `refund:${refundId}:${attempt}`,
    { refundId },
    result.status === "succeeded" ? "succeeded" : `${result.status}:${result.failureCode}`,
    result.raw,
  );

  if (result.status === "unknown") {
    if ("detail" in result && result.detail) {
      await record(
        ctx,
        provider.id,
        "detail",
        `detail:${refundId}:${attempt}`,
        { refundId },
        "read",
        result.detail,
      );
    }
    // Left `processing`: ops sees it as uncertain after 15 minutes.
    ctx.log(`refund_unknown_${result.failureCode}`);
    return json({
      status: "failed",
      kind,
      failure_code: result.failureCode,
      retryable: false,
    });
  }

  try {
    if (result.status === "succeeded") {
      await paymentRefundReport(ctx.db, {
        refundId,
        outcome: "succeeded",
        kind,
        providerRef: result.providerRef,
      });
      return json({ status: "succeeded", kind });
    }
    await paymentRefundReport(ctx.db, {
      refundId,
      outcome: "failed",
      kind,
      failureCode: result.failureCode,
      retryable: result.retryable,
    });
    return json({
      status: "failed",
      kind,
      failure_code: result.failureCode,
      retryable: result.retryable,
    });
  } catch (err) {
    ctx.log(`report_${err instanceof DbError ? err.code : "error"}`);
    return fail("failed", 500);
  }
}

export async function cronSecretMatches(
  header: string | null,
  secret: string | undefined,
): Promise<boolean> {
  if (!secret || !header) return false;
  return timingSafeEqual(header, secret);
}

async function reconcile(ctx: Ctx, req: Request): Promise<Response> {
  if (
    !(await cronSecretMatches(
      req.headers.get("x-orchados-cron-secret"),
      ctx.env.ORCHADOS_CRON_SECRET,
    ))
  ) {
    return fail("unauthorized", 401);
  }
  let rows;
  try {
    rows = await paymentAttemptsToReconcile(ctx.db, RECONCILE_LIMIT);
  } catch (err) {
    ctx.log(`reconcile_${err instanceof DbError ? err.code : "error"}`);
    return fail("failed", 500);
  }

  let checked = 0;
  let finalized = 0;
  for (const row of rows) {
    if (row.provider === "manual" || !row.provider_token) continue;
    const provider = choosePaymentProvider(row.provider, ctx.env, ctx.fetchImpl);
    if (!provider) continue;
    checked++;
    const result = await confirmAndRecord(ctx, provider, "reconcile", row.provider_token, row);
    if (!result) continue;

    let outcome: FinalizeOutcome | null = null;
    if (result.outcome === "not_completed") {
      const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : NaN;
      if (
        row.status === "initiated" &&
        Number.isFinite(expiresAt) &&
        ctx.now().getTime() - expiresAt > EXPIRE_GRACE_MS
      ) {
        outcome = "expired";
      }
    } else if (result.outcome !== row.status) {
      outcome = result.outcome;
    }
    if (!outcome) continue;
    const data = outcome === "expired" ? failedResult("not_completed") : finalizeResult(result);
    if (await finalize(ctx, row.id, outcome, data)) finalized++;
  }
  return json({ checked, finalized });
}

// ---------------------------------------------------------------- callback

function notFoundRedirect(env: Env): Response {
  const base = (env.PORTAL_BASE_URL ?? "").replace(/\/+$/, "");
  return redirect(`${base}/portal/odeme?hata=odeme_bulunamadi`);
}

function resultRedirect(env: Env, row: PaymentByToken): Response {
  const base = (row.return_origin || env.PORTAL_BASE_URL || "").replace(/\/+$/, "");
  return redirect(`${base}/portal/odeme/${row.id}`);
}

async function readForm(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = await req.json();
      const form = new URLSearchParams();
      if (body && typeof body === "object") {
        for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
          if (typeof v === "string") form.set(k, v);
        }
      }
      return form;
    }
    return new URLSearchParams(await req.text());
  } catch {
    return new URLSearchParams();
  }
}

export async function handleCallback(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  const ctx = context(deps);
  const form = await readForm(req);
  const token = form.get("token");
  if (!token || token.length > 200) return notFoundRedirect(ctx.env);

  let row: PaymentByToken | null;
  try {
    row = await paymentByToken(ctx.db, token);
  } catch (err) {
    ctx.log(`callback_lookup_${err instanceof DbError ? err.code : "error"}`);
    return notFoundRedirect(ctx.env);
  }
  if (!row || row.provider === "manual") return notFoundRedirect(ctx.env);

  // Also the fake lock: null for "fake" unless PAYMENT_PROVIDER=fake and
  // PAYMENT_FAKE_ALLOWED=1. Nothing is written in that case.
  const provider = choosePaymentProvider(row.provider, ctx.env, ctx.fetchImpl);
  if (!provider) {
    ctx.log(row.provider === "fake" ? "callback_fake_locked" : "callback_provider_missing");
    return notFoundRedirect(ctx.env);
  }
  // Only the token is read from the body (and, for the fake provider, its
  // outcome); everything else comes from the provider.
  if (provider.readCallback(form).providerToken !== token) return notFoundRedirect(ctx.env);

  if (FINAL_STATUSES.has(row.status)) return resultRedirect(ctx.env, row);

  const result = await confirmAndRecord(ctx, provider, "callback", token, row);
  if (result) {
    if (result.outcome === "not_completed") {
      await finalize(ctx, row.id, "failed", {
        ...finalizeResult(result),
        failure_code: "not_completed",
      });
    } else {
      await finalize(ctx, row.id, result.outcome, finalizeResult(result));
    }
  }
  // Without an answer the result page waits; reconciliation finishes it.
  return resultRedirect(ctx.env, row);
}

// ---------------------------------------------------------------- webhook

export async function handleWebhook(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method !== "POST") return fail("method_not_allowed", 405);
  const ctx = context(deps);
  const rawBody = await req.text();

  const providerId = req.headers.has("x-fake-signature") ? "fake" : "iyzico";
  const provider = choosePaymentProvider(providerId, ctx.env, ctx.fetchImpl);
  if (!provider) {
    ctx.log(providerId === "fake" ? "webhook_fake_locked" : "webhook_provider_missing");
    return fail("invalid_signature", 401);
  }

  const verified = await provider.verifyWebhook(req.headers, rawBody);
  if (!verified.valid || !verified.providerToken || !verified.dedupKey) {
    // Nothing is written for an invalid request.
    ctx.log(`webhook_${verified.reason ?? "signature_invalid"}`);
    return fail("invalid_signature", 401);
  }
  const token = verified.providerToken;

  let row: PaymentByToken | null = null;
  try {
    row = await paymentByToken(ctx.db, token);
  } catch (err) {
    ctx.log(`webhook_lookup_${err instanceof DbError ? err.code : "error"}`);
    return fail("failed", 500);
  }
  if (row && row.provider !== provider.id) row = null;

  const isNew = await record(
    ctx,
    provider.id,
    "webhook",
    verified.dedupKey,
    { paymentId: row?.id ?? null },
    verified.eventType,
    verified.raw,
  );
  if (isNew === null) return fail("failed", 500);
  if (!isNew || !row || FINAL_STATUSES.has(row.status)) return json({ ok: true });

  const result = await confirmAndRecord(ctx, provider, "retrieve", token, row);
  if (result && result.outcome !== "not_completed") {
    await finalize(ctx, row.id, result.outcome, finalizeResult(result));
  }
  return json({ ok: true });
}

// Environment variables the handlers read (index.ts passes exactly these).
export const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PAYMENT_PROVIDER",
  "PAYMENT_FAKE_ALLOWED",
  "PAYMENT_ALLOW_PREVIEW_ORIGINS",
  "PAYMENT_RETURN_ORIGINS",
  "PAYMENT_CALLBACK_URL",
  "PORTAL_BASE_URL",
  "FAKE_WEBHOOK_SECRET",
  "ORCHADOS_CRON_SECRET",
  "IYZICO_API_KEY",
  "IYZICO_SECRET_KEY",
  "IYZICO_BASE_URL",
  "IYZICO_ENABLED_INSTALLMENTS",
] as const;

export function envFrom(get: (key: string) => string | undefined): Env {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, get(key)]));
}
