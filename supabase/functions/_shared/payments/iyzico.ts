// iyzico Checkout Form adapter (docs/musteri-yonetimi.md §8.3). REST with
// IYZWSv2 and Web Crypto; no SDK. Every request times out after 15 s; a
// `status: failure` answer becomes the reason code iyzico_<errorCode>.
//
// Card data never reaches us: the buyer types it on iyzico's page. Buyer
// details are sent in the initialize request only and are never logged.

import { evaluateRetrieve, providerErrorCode, type RetrieveAnswer } from "./acceptance.ts";
import { iyzicoHeaders } from "./iyzico-auth.ts";
import {
  verifyInitializeSignature,
  verifyRefundSignature,
  verifyRetrieveSignature,
  verifyWebhookSignatureV3,
  webhookDedupKey,
} from "./iyzico-signatures.ts";
import { kurusToPrice } from "./money.ts";
import {
  ProviderUnavailableError,
  type ConfirmExpectation,
  type ConfirmResult,
  type FetchLike,
  type PaymentProvider,
  type RefundInput,
  type RefundResult,
  type StartCheckoutInput,
  type StartCheckoutResult,
  type WebhookVerification,
} from "./types.ts";

export const IYZICO_TIMEOUT_MS = 15_000;

export const IYZICO_PATHS = {
  initialize: "/payment/iyzipos/checkoutform/initialize/auth/ecom",
  retrieve: "/payment/iyzipos/checkoutform/auth/ecom/detail",
  cancel: "/payment/cancel",
  refund: "/payment/refund",
  detail: "/payment/detail",
} as const;

export interface IyzicoConfig {
  apiKey: string;
  secretKey: string;
  baseUrl: string; // https://sandbox-api.iyzipay.com or https://api.iyzipay.com
  timeoutMs?: number;
}

type Json = Record<string, unknown>;

export type IyzicoCall =
  | { kind: "ok"; httpStatus: number; body: Json }
  | { kind: "timeout" }
  | { kind: "network" }
  | { kind: "unreadable"; httpStatus: number };

export function iyzicoClient(config: IyzicoConfig, fetchImpl: FetchLike) {
  const base = config.baseUrl.replace(/\/+$/, "");
  return async function post(path: string, payload: Json): Promise<IyzicoCall> {
    const body = JSON.stringify(payload);
    const headers = await iyzicoHeaders(config.apiKey, config.secretKey, path, body);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? IYZICO_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${base}${path}`, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      let parsed: unknown;
      try {
        parsed = await res.json();
      } catch {
        return { kind: "unreadable", httpStatus: res.status };
      }
      if (!parsed || typeof parsed !== "object")
        return { kind: "unreadable", httpStatus: res.status };
      return { kind: "ok", httpStatus: res.status, body: parsed as Json };
    } catch (err) {
      return controller.signal.aborted || (err as Error)?.name === "AbortError"
        ? { kind: "timeout" }
        : { kind: "network" };
    } finally {
      clearTimeout(timer);
    }
  };
}

function callError(call: Exclude<IyzicoCall, { kind: "ok" }>): string {
  switch (call.kind) {
    case "timeout":
      return "provider_timeout";
    case "network":
      return "provider_unreachable";
    case "unreadable":
      return `iyzico_http_${call.httpStatus}`;
  }
}

function initializeBody(i: StartCheckoutInput): Json {
  const price = kurusToPrice(i.amountKurus);
  return {
    locale: "tr",
    conversationId: i.paymentId,
    price,
    paidPrice: price,
    currency: i.currency,
    basketId: i.orderId,
    paymentGroup: "PRODUCT",
    callbackUrl: i.callbackUrl,
    enabledInstallments: i.installments,
    buyer: {
      id: i.buyer.id,
      name: i.buyer.name,
      surname: i.buyer.surname,
      identityNumber: i.buyer.identityNumber,
      email: i.buyer.email,
      gsmNumber: i.buyer.gsmNumber,
      registrationAddress: i.buyer.registrationAddress,
      city: i.buyer.city,
      country: i.buyer.country,
      ...(i.buyer.zipCode ? { zipCode: i.buyer.zipCode } : {}),
      ip: i.buyer.ip,
      ...(i.buyer.registrationDate ? { registrationDate: i.buyer.registrationDate } : {}),
    },
    billingAddress: {
      contactName: i.billing.contactName,
      address: i.billing.address,
      city: i.billing.city,
      country: i.billing.country,
      ...(i.billing.zipCode ? { zipCode: i.billing.zipCode } : {}),
    },
    // No shippingAddress: every item is VIRTUAL (a service).
    basketItems: i.items.map((it) => ({
      id: it.id,
      name: it.name,
      category1: "Hizmet",
      itemType: "VIRTUAL",
      price: kurusToPrice(it.amountKurus),
    })),
  };
}

export function iyzicoProvider(config: IyzicoConfig, fetchImpl: FetchLike): PaymentProvider {
  const post = iyzicoClient(config, fetchImpl);
  const secret = config.secretKey;

  return {
    id: "iyzico",

    async startCheckout(input) {
      const itemsTotal = input.items.reduce((sum, it) => sum + it.amountKurus, 0);
      if (input.items.length === 0 || itemsTotal !== input.amountKurus) {
        return { ok: false, error: "basket_total_mismatch", raw: null };
      }
      const call = await post(IYZICO_PATHS.initialize, initializeBody(input));
      if (call.kind !== "ok") return { ok: false, error: callError(call), raw: null };
      const r = call.body;
      if (r.status !== "success")
        return { ok: false, error: providerErrorCode(r.errorCode), raw: r };
      if (!(await verifyInitializeSignature(secret, r)) || r.conversationId !== input.paymentId) {
        return { ok: false, error: "signature_invalid", raw: r };
      }
      if (typeof r.token !== "string" || typeof r.paymentPageUrl !== "string") {
        return { ok: false, error: "iyzico_incomplete_response", raw: r };
      }
      const ttl =
        typeof r.tokenExpireTime === "number" && r.tokenExpireTime > 0 ? r.tokenExpireTime : 1800;
      return {
        ok: true,
        redirectUrl: r.paymentPageUrl,
        providerToken: r.token,
        expiresAt: new Date(Date.now() + ttl * 1000),
        raw: r,
      } satisfies StartCheckoutResult;
    },

    readCallback(form) {
      const token = form.get("token");
      return { providerToken: token && token.length <= 200 ? token : null };
    },

    async confirm(token: string, expected: ConfirmExpectation): Promise<ConfirmResult> {
      const call = await post(IYZICO_PATHS.retrieve, {
        locale: "tr",
        conversationId: expected.paymentId,
        token,
      });
      if (call.kind !== "ok") throw new ProviderUnavailableError(callError(call));
      const r = call.body as RetrieveAnswer & Json;
      const signatureValid = await verifyRetrieveSignature(secret, r);
      return evaluateRetrieve(r, expected, signatureValid);
    },

    async verifyWebhook(headers, rawBody): Promise<WebhookVerification> {
      const invalid = (reason: string, raw: unknown = null): WebhookVerification => ({
        valid: false,
        reason,
        providerToken: null,
        eventType: null,
        dedupKey: null,
        raw,
      });
      const header = headers.get("x-iyz-signature-v3");
      if (!header) return invalid("signature_missing");
      let body: Json;
      try {
        const parsed = JSON.parse(rawBody);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          return invalid("invalid_body");
        body = parsed as Json;
      } catch {
        return invalid("invalid_body");
      }
      const fields = {
        iyziEventType: body.iyziEventType as string | undefined,
        iyziPaymentId: body.iyziPaymentId as string | number | undefined,
        token: body.token as string | undefined,
        paymentConversationId: body.paymentConversationId as string | undefined,
        status: body.status as string | undefined,
        iyziReferenceCode: body.iyziReferenceCode as string | undefined,
      };
      if (!(await verifyWebhookSignatureV3(secret, fields, header)))
        return invalid("signature_invalid");
      if (typeof fields.token !== "string" || fields.token === "") return invalid("invalid_body");
      return {
        valid: true,
        reason: null,
        providerToken: fields.token,
        eventType: typeof fields.iyziEventType === "string" ? fields.iyziEventType : null,
        dedupKey: webhookDedupKey(fields),
        raw: body,
      };
    },

    async refund(input: RefundInput): Promise<RefundResult> {
      const price = kurusToPrice(input.amountKurus);
      let call: IyzicoCall;
      if (input.kind === "void") {
        call = await post(IYZICO_PATHS.cancel, {
          locale: "tr",
          conversationId: input.refundId,
          paymentId: input.providerPaymentId,
          ip: input.ip,
        });
      } else {
        if (!input.providerItemId)
          return {
            status: "failed",
            failureCode: "item_missing",
            retryable: false,
            raw: null,
          };
        call = await post(IYZICO_PATHS.refund, {
          locale: "tr",
          conversationId: input.refundId,
          paymentTransactionId: input.providerItemId,
          price,
          currency: input.currency,
          ip: input.ip,
        });
      }

      if (call.kind === "ok" && call.body.status === "failure") {
        return {
          status: "failed",
          failureCode: providerErrorCode(call.body.errorCode),
          retryable: false,
          raw: call.body,
        };
      }
      if (call.kind === "ok" && call.body.status === "success") {
        const r = call.body;
        if ((await verifyRefundSignature(secret, r)) && r.conversationId === input.refundId) {
          const ref = r.hostReference ?? r.paymentTransactionId ?? r.paymentId ?? null;
          return {
            status: "succeeded",
            providerRef: ref === null ? null : String(ref),
            raw: r,
          };
        }
        return { status: "unknown", failureCode: "signature_invalid", raw: r };
      }

      // No usable answer: the refund may or may not have happened (a card
      // refund is not idempotent, so it is never retried blindly). Read the
      // payment detail for the record; ops resolves the row
      // (ops_resolve_refund) with the provider reference.
      const failureCode = call.kind === "ok" ? "iyzico_unexpected_response" : callError(call);
      const detail = await post(IYZICO_PATHS.detail, {
        locale: "tr",
        conversationId: input.refundId,
        paymentId: input.providerPaymentId,
      });
      return {
        status: "unknown",
        failureCode: call.kind === "timeout" ? "timeout" : failureCode,
        raw: call.kind === "ok" ? call.body : null,
        detail: detail.kind === "ok" ? detail.body : null,
      };
    },
  };
}
