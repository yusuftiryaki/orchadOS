// send-sms: Supabase Auth "Send SMS" hook. Auth calls it instead of an SMS
// provider of its own whenever a login code (phone OTP) is to be sent.
//
// POST /functions/v1/send-sms   (from Supabase Auth only; verify_jwt = false)
//   Standard Webhooks headers: webhook-id, webhook-timestamp, webhook-signature
//   { "user": { "phone": "905321234567", ... }, "sms": { "otp": "123456" } }
//
// 1. The signature is checked with SEND_SMS_HOOK_SECRET ("v1,whsec_<base64>",
//    the secret shown when the hook is set up); timestamps older than five
//    minutes are rejected.
// 2. phone_login_code_requested() applies the limits per number (5 codes an
//    hour; locked after 5 wrong codes in 15 minutes) and counts the code.
// 3. The code goes out through the message provider (../_shared/providers.ts):
//    the record provider unless a real one is configured, so locally and in
//    tests the code lands in private.message_outbox.
//
// Responses: 200 {} · 200 { error: { http_code, message } } (Auth passes it on
// to the client) · 401 bad signature · 400 bad payload.
// Neither the number nor the code is ever logged.

import { renderLoginCode } from "../_shared/messaging.ts";
import { chooseProvider, recordProvider } from "../_shared/providers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const HOOK_SECRET = Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "";

const TOLERANCE_S = 5 * 60;
const encoder = new TextEncoder();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// An error Auth hands to the client (signInWithOtp fails with this message).
const hookError = (httpCode: number, message: string) =>
  json({ error: { http_code: httpCode, message } });

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Standard Webhooks (https://www.standardwebhooks.com): HMAC-SHA256 over
// "<id>.<timestamp>.<body>", base64, any of the space separated "v1,<sig>".
async function verifySignature(req: Request, body: string): Promise<boolean> {
  const id = req.headers.get("webhook-id");
  const timestamp = req.headers.get("webhook-timestamp");
  const signatures = req.headers.get("webhook-signature");
  if (!id || !timestamp || !signatures || !HOOK_SECRET) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_S) return false;

  const secret = HOOK_SECRET.replace(/^v1,/, "").replace(/^whsec_/, "");
  let keyBytes: Uint8Array;
  try {
    keyBytes = base64ToBytes(secret);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const expected = bytesToBase64(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}.${timestamp}.${body}`)),
  );
  return signatures
    .split(" ")
    .map((s) => s.split(","))
    .some(([version, sig]) => version === "v1" && typeof sig === "string" && timingSafeEqual(sig, expected));
}

const serviceHeaders = () => ({
  apikey: SERVICE_ROLE_KEY,
  authorization: `Bearer ${SERVICE_ROLE_KEY}`,
});

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const body = await req.text();
  if (!(await verifySignature(req, body))) return json({ error: "unauthorized" }, 401);

  let phone: string;
  let otp: string;
  try {
    const payload = JSON.parse(body);
    phone = `+${String(payload?.user?.phone ?? "").replace(/^\+/, "")}`;
    otp = String(payload?.sms?.otp ?? "");
  } catch {
    return json({ error: "invalid_input" }, 400);
  }
  if (!/^\+[1-9][0-9]{6,14}$/.test(phone) || !/^[0-9]{4,10}$/.test(otp)) {
    return json({ error: "invalid_input" }, 400);
  }

  try {
    const limit = await fetch(`${SUPABASE_URL}/rest/v1/rpc/phone_login_code_requested`, {
      method: "POST",
      headers: { ...serviceHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ p_phone: phone }),
    });
    if (!limit.ok) throw new Error(`phone_login_code_requested failed with ${limit.status}`);
    const verdict = await limit.json();
    if (verdict === "locked") return hookError(429, "phone_locked");
    if (verdict !== "ok") return hookError(429, "too_many_codes");

    const provider = chooseProvider(
      (name) => Deno.env.get(name),
      () => recordProvider(SUPABASE_URL, serviceHeaders()),
    );
    const result = await provider.send({
      to: phone,
      channel: "sms",
      body: renderLoginCode(otp),
      purpose: "login_code",
    });
    if (!result.ok) {
      console.error("send-sms: provider error", result.error);
      return hookError(502, "sms_not_sent");
    }
    return json({});
  } catch (error) {
    console.error("send-sms:", error instanceof Error ? error.message : "unknown error");
    return hookError(500, "sms_not_sent");
  }
}

Deno.serve(handle);
