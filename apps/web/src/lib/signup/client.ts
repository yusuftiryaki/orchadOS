import "server-only";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import type { Client } from "@/lib/supabase/types";
import type { SignupInput } from "./validation";

// Calls the customer-signup Edge Function (docs/musteri-yonetimi.md §7) from
// server actions. The request and response bodies carry personal data and
// are never logged; errors are reduced to a code.

export const SIGNUP_ERRORS = [
  "invalid_input",
  "captcha_failed",
  // A taken e-mail; never says which detail is registered (H33).
  "not_completed",
  "too_many_attempts",
  "signup_closed",
  "signup_unavailable",
  "phone_not_verified",
  // complete: the pending sign-up is not this browser's (the ticket).
  "signup_mismatch",
  "failed",
] as const;
export type SignupError = (typeof SIGNUP_ERRORS)[number];

export type CompleteStatus = "completed" | "already_completed" | "no_pending";

// `ticket`: the sign-up ticket of this register (lib/signup/ticket.ts), or
// null from a function deployed before tickets.
export type RegisterResult =
  { ok: true; ticket: string | null } | { ok: false; error: SignupError; field?: string };
export type CompleteResult =
  { ok: true; status: CompleteStatus } | { ok: false; error: SignupError };

const FUNCTION = "customer-signup";

// Only the Next server knows the secret; with it the function trusts the
// client_ip in the body (design §7.1, step 3). Never NEXT_PUBLIC.
function proxyHeaders(): Record<string, string> {
  const secret = process.env.SIGNUP_PROXY_SECRET;
  return secret ? { "x-orchados-proxy-secret": secret } : {};
}

const isSignupError = (value: unknown): value is SignupError =>
  typeof value === "string" && (SIGNUP_ERRORS as readonly string[]).includes(value);

// Codes of a function deployed before H33 (docs/hukuk/kararlar.md): shown
// as the generic not_completed, never told apart.
const LEGACY_CONFLICTS = new Set(["email_taken", "phone_registered"]);

// Maps an HTTP status and body of the function to an error code. A missing
// function (404) or a server error (5xx) is "signup_unavailable", except for
// the function's own 503 signup_closed and 500 failed.
export function signupErrorFromResponse(status: number, body: unknown): SignupError {
  const code =
    body && typeof body === "object" && "error" in body ? (body as { error: unknown }).error : null;
  if (status === 409 && typeof code === "string" && LEGACY_CONFLICTS.has(code)) {
    return "not_completed";
  }
  if (status === 503 && code === "signup_closed") return "signup_closed";
  if (status === 500 && code === "failed") return "failed";
  if (status === 404 || status >= 500) return "signup_unavailable";
  return isSignupError(code) ? code : "failed";
}

interface InvokeError {
  name?: string;
  context?: unknown;
}

async function errorOf(error: InvokeError): Promise<{ error: SignupError; field?: string }> {
  // FunctionsHttpError carries the Response; relay and fetch errors mean the
  // function could not be reached.
  const response = error.context;
  if (error.name !== "FunctionsHttpError" || !(response instanceof Response)) {
    return { error: "signup_unavailable" };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  const field =
    body && typeof body === "object" && typeof (body as { field?: unknown }).field === "string"
      ? (body as { field: string }).field
      : undefined;
  return { error: signupErrorFromResponse(response.status, body), ...(field ? { field } : {}) };
}

export async function registerCustomer(
  supabase: Client,
  input: SignupInput,
  clientIp: string | null,
  captchaToken: string | null,
  // This browser's previous ticket: lets the register replace its own
  // sign-up in progress.
  previousTicket: string | null = null,
): Promise<RegisterResult> {
  const body = {
    action: "register",
    full_name: input.fullName,
    phone: input.phone,
    email: input.email,
    password: input.password,
    contact_preference: input.contactPreference,
    consents: {
      kvkk_notice_version: LEGAL_TEXT_VERSIONS.kvkk_notice,
      explicit_text_version: LEGAL_TEXT_VERSIONS.explicit_consent,
      explicit_service_improvement: input.explicitServiceImprovement,
      explicit_marketing: input.explicitMarketing,
    },
    ...(clientIp ? { client_ip: clientIp } : {}),
    ...(captchaToken ? { captcha_token: captchaToken } : {}),
    ...(previousTicket ? { ticket: previousTicket } : {}),
  };
  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION, {
      body,
      headers: proxyHeaders(),
    });
    if (error) return { ok: false, ...(await errorOf(error)) };
    if (data && typeof data === "object" && (data as { next?: unknown }).next === "verify_phone") {
      const ticket = (data as { ticket?: unknown }).ticket;
      return { ok: true, ticket: typeof ticket === "string" ? ticket : null };
    }
    return { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "signup_unavailable" };
  }
}

// Called with the user's session (supabase-js sends the access token). The
// /kayit code step passes its ticket ("" when the cookie is gone): a pending
// sign-up must then carry it. The signed-in /kayit/dogrula page passes none.
export async function completeSignup(supabase: Client, ticket?: string): Promise<CompleteResult> {
  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION, {
      body: { action: "complete", ...(ticket !== undefined ? { ticket } : {}) },
      headers: proxyHeaders(),
    });
    if (error) return { ok: false, error: (await errorOf(error)).error };
    const status = data && typeof data === "object" ? (data as { status?: unknown }).status : null;
    if (status === "completed" || status === "already_completed" || status === "no_pending") {
      return { ok: true, status };
    }
    return { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "signup_unavailable" };
  }
}
