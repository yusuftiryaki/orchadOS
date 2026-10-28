import "server-only";
import { supabaseEnv } from "@/lib/env";
import type { DemoStartError } from "@/lib/i18n/messages/demo";
import type {
  DemoErrorCode,
  DemoStartResponse,
} from "../../../../../supabase/functions/_shared/demo";

// Calls the demo-start Edge Function (docs/demo-turu.md §7) from the /demo
// server action. Only the Next server knows SIGNUP_PROXY_SECRET; with it the
// function trusts client_ip. The answer carries a single-use token for the
// visitor's browser (verifyOtp there, never on the server); it is not logged.

export type DemoStartResult =
  { ok: true; value: DemoStartResponse } | { ok: false; error: DemoStartError };

const START_ERRORS: readonly DemoErrorCode[] = [
  "invalid_input",
  "captcha_failed",
  "rate_limited",
  "demo_closed",
  "demo_capacity",
  "failed",
];

// HTTP status and body of the function → error code. A missing function or a
// gateway error is "unavailable".
export function demoStartErrorOf(status: number, body: unknown): DemoStartError {
  const code =
    body && typeof body === "object" && "error" in body ? (body as { error: unknown }).error : null;
  if (typeof code === "string" && (START_ERRORS as readonly string[]).includes(code)) {
    return code as DemoStartError;
  }
  if (status === 404 || status >= 500) return "unavailable";
  return "failed";
}

function isStartResponse(value: unknown): value is DemoStartResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.token_hash === "string" &&
    v.token_hash !== "" &&
    typeof v.verification_type === "string" &&
    typeof v.expires_at === "string" &&
    typeof v.next === "string"
  );
}

export async function requestDemoStart(input: {
  captchaToken: string | null;
  clientIp: string | null;
}): Promise<DemoStartResult> {
  const { url, anonKey } = supabaseEnv();
  const secret = process.env.SIGNUP_PROXY_SECRET;
  const body = {
    action: "start",
    ...(input.clientIp ? { client_ip: input.clientIp } : {}),
    ...(input.captchaToken ? { captcha_token: input.captchaToken } : {}),
  };
  try {
    const res = await fetch(`${url}/functions/v1/demo-start`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: anonKey,
        ...(secret ? { "x-orchados-proxy-secret": secret } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) return { ok: false, error: demoStartErrorOf(res.status, json) };
    return isStartResponse(json) ? { ok: true, value: json } : { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
