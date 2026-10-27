import { createHmac } from "node:crypto";

// Test helpers for the payment layer (supabase/functions/_shared/payments).

export const hmacHex = (key: string, message: string) =>
  createHmac("sha256", key).update(message).digest("hex");

export const PAYMENT_ID = "11111111-1111-4111-8111-111111111111";
export const ORDER_ID = "22222222-2222-4222-8222-222222222222";
export const ITEM_ID = "33333333-3333-4333-8333-333333333333";
export const REFUND_ID = "44444444-4444-4444-8444-444444444444";
export const USER_ID = "55555555-5555-4555-8555-555555555555";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export interface Call {
  url: string;
  init?: RequestInit;
  body: unknown;
}

// A fetch mock routing by URL suffix; records every call with its parsed body.
export function routedFetch(
  routes: Record<string, (body: unknown, init?: RequestInit) => Response | Promise<Response>>,
) {
  const calls: Call[] = [];
  const impl = async (url: string, init?: RequestInit): Promise<Response> => {
    const raw = typeof init?.body === "string" ? init.body : null;
    let body: unknown = raw;
    try {
      body = raw === null ? null : JSON.parse(raw);
    } catch {
      body = raw;
    }
    calls.push({ url, init, body });
    for (const [suffix, handler] of Object.entries(routes)) {
      if (url.endsWith(suffix)) return handler(body, init);
    }
    return jsonResponse({ message: "unexpected" }, 599);
  };
  return { impl, calls };
}
