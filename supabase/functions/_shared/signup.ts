// Self sign-up rules of the customer-signup Edge Function
// (docs/musteri-yonetimi.md §7): input validation, client IP, hashes, the
// account match rules and the phone-code check of `complete`.
//
// Pure TypeScript without imports or Deno APIs (Web Crypto only): the web
// app's unit tests (apps/web/src/lib/billing/signup.test.ts) import this file.
// Nothing here logs; errors name a field, never a value.

export const PHONE_TR_RE = /^\+905[0-9]{9}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TEXT_VERSION_RE = /^[a-z0-9][a-z0-9.-]{1,40}$/;
// IPv4 or IPv6 (loose: characters and length only; the value is only hashed).
const IP_RE = /^[0-9a-fA-F:.]{2,45}$/;

export const PASSWORD_MIN = 8;
// bcrypt ignores bytes after 72.
export const PASSWORD_MAX = 72;

export type ContactPreference = "whatsapp" | "sms";

export interface SignupConsents {
  kvkk_notice_version: string;
  explicit_text_version: string;
  explicit_service_improvement: boolean;
  explicit_marketing: boolean;
}

export interface RegisterInput {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  contactPreference: ContactPreference;
  consents: SignupConsents;
  clientIp: string | null;
  captchaToken: string | null;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string };

const invalid = (field: string): Parsed<never> => ({ ok: false, field });

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// The `register` body. Field names in errors are the request's keys.
export function parseRegister(body: unknown): Parsed<RegisterInput> {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return invalid("body");
  const b = body as Record<string, unknown>;

  const fullName = (str(b.full_name) ?? "").trim().replace(/\s+/g, " ");
  if (fullName.length < 2 || fullName.length > 120) return invalid("full_name");

  const phone = (str(b.phone) ?? "").trim();
  if (!PHONE_TR_RE.test(phone)) return invalid("phone");

  const email = (str(b.email) ?? "").trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return invalid("email");

  const password = str(b.password) ?? "";
  if (
    password.length < PASSWORD_MIN ||
    new TextEncoder().encode(password).length > PASSWORD_MAX
  ) {
    return invalid("password");
  }

  const contactPreference = str(b.contact_preference);
  if (contactPreference !== "whatsapp" && contactPreference !== "sms") {
    return invalid("contact_preference");
  }

  const c = b.consents;
  if (!c || typeof c !== "object" || Array.isArray(c))
    return invalid("consents");
  const consents = c as Record<string, unknown>;
  const kvkk = str(consents.kvkk_notice_version);
  if (!kvkk || !TEXT_VERSION_RE.test(kvkk))
    return invalid("kvkk_notice_version");
  const explicit = str(consents.explicit_text_version);
  if (!explicit || !TEXT_VERSION_RE.test(explicit))
    return invalid("explicit_text_version");
  if (typeof consents.explicit_service_improvement !== "boolean") {
    return invalid("explicit_service_improvement");
  }
  if (typeof consents.explicit_marketing !== "boolean")
    return invalid("explicit_marketing");

  let clientIp: string | null = null;
  if (b.client_ip !== undefined && b.client_ip !== null) {
    clientIp = str(b.client_ip)?.trim() ?? null;
    if (!clientIp || !IP_RE.test(clientIp)) return invalid("client_ip");
  }
  let captchaToken: string | null = null;
  if (b.captcha_token !== undefined && b.captcha_token !== null) {
    captchaToken = str(b.captcha_token);
    if (!captchaToken || captchaToken.length > 4096)
      return invalid("captcha_token");
  }

  return {
    ok: true,
    value: {
      fullName,
      phone,
      email,
      password,
      contactPreference,
      // Neither explicit consent is asked at sign-up (docs/hukuk/kararlar.md
      // H06, H31, T27): both are stored as false whatever the request says,
      // so an old client keeps working and a direct POST grants nothing.
      // signup_complete applies the same rule in the database.
      consents: {
        kvkk_notice_version: kvkk,
        explicit_text_version: explicit,
        explicit_service_improvement: false,
        explicit_marketing: false,
      },
      clientIp,
      captchaToken,
    },
  };
}

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

// hex(HMAC-SHA256(secret, value)): the ip_hash, phone_hash and email_hash of
// the database.
export async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

// Compares in time independent of where the strings differ.
export function timingSafeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  const length = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// How register treats the captcha: "verify" with TURNSTILE_SECRET_KEY set;
// without it sign-ups stay closed ("unconfigured", fail closed) unless
// SIGNUP_TURNSTILE_DISABLED=1, which only the local stack sets
// (supabase/config.toml), never a hosted project.
export type CaptchaMode = "verify" | "skip" | "unconfigured";

export function captchaMode(
  secret: string,
  disabledFlag: string | undefined,
): CaptchaMode {
  if (secret) return "verify";
  return disabledFlag === "1" ? "skip" : "unconfigured";
}

// The client's IP: the body's client_ip when the Next server proved itself
// with the proxy secret, otherwise Cloudflare's header, otherwise the first
// x-forwarded-for value.
export function clientIp(
  headers: { get(name: string): string | null },
  bodyIp: string | null,
  proxySecret: string,
): string | null {
  const sent = headers.get("x-orchados-proxy-secret");
  if (
    proxySecret &&
    sent !== null &&
    timingSafeEqual(sent, proxySecret) &&
    bodyIp
  )
    return bodyIp;
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || null;
}

// A row of signup_find_account.
export interface AccountMatch {
  user_id: string;
  matched_by: "email" | "phone" | "profile_phone";
  self_signup: boolean;
  phone_confirmed: boolean;
  signup_completed: boolean;
  // When the pending sign-up was written (else when the account was created).
  started_at: string;
}

export type MatchOutcome =
  // Open the account.
  | "create"
  // The phone belongs to an account (its verified owner, a sign-up in
  // progress or another customer's profile): answer as for a new sign-up and
  // change nothing; the code step sends a login code that only reaches the
  // phone's owner (docs/hukuk/kararlar.md H33).
  | "send_code"
  // The e-mail belongs to another account and the phone to none: the generic
  // "not_completed" error, never told apart from other conflicts (H33).
  | "conflict";

export interface MatchDecision {
  // Stale self sign-ups past the grace period: deleted before going on.
  staleUserIds: string[];
  outcome: MatchOutcome;
}

// A stale sign-up younger than this still belongs to whoever is entering its
// code: a register with the same e-mail or phone does not replace it.
export const STALE_GRACE_MS = 30 * 60 * 1000;

export const isStale = (m: AccountMatch) =>
  m.self_signup && !m.phone_confirmed && !m.signup_completed;

const pastGrace = (m: AccountMatch, nowMs: number) => {
  const started = Date.parse(m.started_at);
  return Number.isFinite(started) && nowMs - started > STALE_GRACE_MS;
};

// §7.1 step 5, in order: stale accounts past the grace period go; a phone
// that still belongs to an account (by the account's phone or a customer
// profile) goes to the code step without changes, whoever holds the e-mail; a
// taken e-mail with a free phone is a conflict. Nothing here attaches the new
// e-mail or password to an existing account.
export function decideMatches(
  matches: AccountMatch[],
  nowMs: number,
): MatchDecision {
  const stale = [
    ...new Set(
      matches
        .filter((m) => isStale(m) && pastGrace(m, nowMs))
        .map((m) => m.user_id),
    ),
  ];
  const live = matches.filter((m) => !stale.includes(m.user_id));
  let outcome: MatchOutcome = "create";
  if (
    live.some(
      (m) => m.matched_by === "phone" || m.matched_by === "profile_phone",
    )
  ) {
    outcome = "send_code";
  } else if (live.some((m) => m.matched_by === "email")) {
    outcome = "conflict";
  }
  return { staleUserIds: stale, outcome };
}

// H33: every register answer after the rate limits takes at least this long,
// so a new account (Auth hashes the password, the pending row is written) and
// a registered phone or e-mail (no writes) cannot be told apart by timing.
export const REGISTER_MIN_MS = 1500;

// How long to wait before answering a register that started at `startedMs`.
export function registerDelayMs(
  startedMs: number,
  nowMs: number,
  minMs = REGISTER_MIN_MS,
): number {
  return Math.max(0, startedMs + minMs - nowMs);
}

// The claims of a JWT (already verified by the Auth API), or null.
export function jwtClaims(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0)),
    );
    const claims = JSON.parse(json);
    return claims && typeof claims === "object" ? claims : null;
  } catch {
    return null;
  }
}

// The claims belong to a demo visitor (app_metadata.demo, docs/demo-turu.md
// §7): Edge paths that write with the service role refuse them.
export function isDemoClaims(claims: Record<string, unknown> | null): boolean {
  const meta = claims?.app_metadata;
  return (
    !!meta &&
    typeof meta === "object" &&
    (meta as { demo?: unknown }).demo === true
  );
}

// §7.2: when the session was last opened with a phone code (amr method otp or
// sms), in epoch seconds, or null. signup_complete requires it to be after
// the pending sign-up was written.
export function latestPhoneCodeAt(
  claims: Record<string, unknown> | null,
): number | null {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr) {
    if (!entry || typeof entry !== "object") continue;
    const { method, timestamp } = entry as {
      method?: unknown;
      timestamp?: unknown;
    };
    if ((method !== "otp" && method !== "sms") || typeof timestamp !== "number")
      continue;
    if (!Number.isFinite(timestamp)) continue;
    if (latest === null || timestamp > latest) latest = timestamp;
  }
  return latest;
}

// §7.3: self sign-up accounts whose phone was not verified within 24 hours.
export function isExpiredUnverified(
  user: {
    app_metadata?: Record<string, unknown> | null;
    phone_confirmed_at?: string | null;
    created_at?: string | null;
  },
  nowMs: number,
): boolean {
  if (user.app_metadata?.signup !== "self" || user.phone_confirmed_at)
    return false;
  const created = user.created_at ? Date.parse(user.created_at) : NaN;
  return Number.isFinite(created) && nowMs - created > 24 * 60 * 60 * 1000;
}
