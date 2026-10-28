// Robot check of customer-signup and demo-start (docs/hukuk/kararlar.md H03,
// T12). Two providers, chosen by the Edge secret CAPTCHA_PROVIDER:
//   turnstile (default)  Cloudflare Turnstile: the browser gets a token from
//                        Cloudflare, siteverify checks it (TURNSTILE_SECRET_KEY).
//   altcha               Self-hosted proof of work (the open ALTCHA scheme): the
//                        function issues an HMAC-signed challenge with an
//                        expiry (ALTCHA_HMAC_KEY), the browser finds the number,
//                        the function checks the signature, the hash, the
//                        expiry and the purpose and refuses a solution already
//                        used (private.captcha_spent, shared by every function
//                        instance). No request leaves our infrastructure.
// An unknown provider or a missing key keeps the door shut ("unconfigured",
// fail closed). Switching to altcha on a hosted project first needs the
// privacy text changed (docs/deployment.md › Robot doğrulaması).
//
// Pure TypeScript without imports or Deno APIs (Web Crypto and fetch only):
// the web app's unit tests (apps/web/src/lib/site/captcha-shared.test.ts)
// import this file. Nothing here logs; tokens and keys never leave it.

export type CaptchaProvider = "turnstile" | "altcha";

// "" and "turnstile" are Turnstile; anything else unknown is null (closed).
export function parseCaptchaProvider(value: string | undefined): CaptchaProvider | null {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "" || v === "turnstile") return "turnstile";
  if (v === "altcha") return "altcha";
  return null;
}

export interface CaptchaEnv {
  provider: CaptchaProvider | null;
  turnstileSecret: string;
  altchaKey: string;
}

// The provider's settings; with a prefix (demo-start: "DEMO_") the prefixed
// key wins, an empty value counts as unset. The provider itself never falls
// back: on the shared demo host (docs/demo-turu.md §15.1) the test site's
// CAPTCHA_PROVIDER must not switch the live demo, whose web widget follows its
// own deployment. An unset DEMO_CAPTCHA_PROVIDER is Turnstile.
export function captchaEnv(get: (name: string) => string | undefined, prefix = ""): CaptchaEnv {
  const pick = (name: string) => (prefix ? get(`${prefix}${name}`) : "") || get(name) || "";
  return {
    provider: parseCaptchaProvider(get(`${prefix}CAPTCHA_PROVIDER`)),
    turnstileSecret: pick("TURNSTILE_SECRET_KEY"),
    altchaKey: pick("ALTCHA_HMAC_KEY"),
  };
}

// An ALTCHA key shorter than this is a misconfiguration (an HMAC key needs
// the entropy of the hash: `openssl rand -hex 32`).
export const ALTCHA_KEY_MIN = 32;

// The chosen provider has what it needs.
export function captchaConfigured(env: CaptchaEnv): boolean {
  if (env.provider === "turnstile") return env.turnstileSecret !== "";
  if (env.provider === "altcha") return env.altchaKey.length >= ALTCHA_KEY_MIN;
  return false;
}

// How register treats the captcha:
//   verify        the chosen provider is configured: a valid token is required;
//   optional      altcha configured and SIGNUP_TURNSTILE_DISABLED=1 (the local
//                 stack only, supabase/config.toml): a sent token is checked,
//                 a missing one passes, so the tests can try both;
//   skip          nothing configured and SIGNUP_TURNSTILE_DISABLED=1 (local);
//   unconfigured  anything else: sign-ups refused (fail closed).
// Turnstile keeps its rule: its secret wins over the flag.
export type CaptchaMode = "verify" | "optional" | "skip" | "unconfigured";

export function captchaMode(env: CaptchaEnv, disabledFlag: string | undefined): CaptchaMode {
  const disabled = disabledFlag === "1";
  if (env.provider === null) return "unconfigured";
  if (captchaConfigured(env)) {
    return env.provider === "altcha" && disabled ? "optional" : "verify";
  }
  return disabled ? "skip" : "unconfigured";
}

// --- ALTCHA ------------------------------------------------------------------

export type CaptchaPurpose = "signup" | "demo";

export interface AltchaChallenge {
  algorithm: "SHA-256";
  challenge: string;
  maxnumber: number;
  salt: string;
  signature: string;
}

// The number is drawn from [0, maxnumber]: about 50 000 hashes on average,
// a second or two on a phone.
export const ALTCHA_MAX_NUMBER = 100_000;
// A challenge must be solved and sent within this time.
export const ALTCHA_TTL_MS = 10 * 60 * 1000;

const encoder = new TextEncoder();

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmacHex(key: string, value: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", k, encoder.encode(value)));
}

function sameText(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function randomInt(maxInclusive: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % (maxInclusive + 1);
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

// A new challenge for this purpose: the expiry and the purpose ride in the
// salt, which the signed hash covers.
export async function createAltchaChallenge(
  key: string,
  purpose: CaptchaPurpose,
  nowMs: number,
  options: { maxNumber?: number; number?: number } = {},
): Promise<AltchaChallenge> {
  const maxnumber = options.maxNumber ?? ALTCHA_MAX_NUMBER;
  const expires = Math.floor((nowMs + ALTCHA_TTL_MS) / 1000);
  const salt = `${randomHex(12)}?expires=${expires}&purpose=${purpose}&`;
  const number = options.number ?? randomInt(maxnumber);
  const challenge = await sha256Hex(`${salt}${number}`);
  return {
    algorithm: "SHA-256",
    challenge,
    maxnumber,
    salt,
    signature: await hmacHex(key, challenge),
  };
}

export interface AltchaPayload {
  algorithm: string;
  challenge: string;
  number: number;
  salt: string;
  signature: string;
}

// The browser's answer: base64 of the JSON payload (the ALTCHA widget format).
export function encodeAltchaPayload(payload: AltchaPayload): string {
  return btoa(JSON.stringify(payload));
}

function decodePayload(token: string): AltchaPayload | null {
  try {
    const p = JSON.parse(atob(token));
    if (!p || typeof p !== "object") return null;
    const ok =
      typeof p.algorithm === "string" &&
      typeof p.challenge === "string" &&
      typeof p.salt === "string" &&
      typeof p.signature === "string" &&
      Number.isSafeInteger(p.number) &&
      p.number >= 0;
    return ok ? (p as AltchaPayload) : null;
  } catch {
    return null;
  }
}

export type AltchaResult =
  | { ok: true; challenge: string; expiresMs: number }
  | { ok: false; reason: "malformed" | "signature" | "solution" | "expired" | "purpose" };

// Checks a solution without remembering it (verifyCaptcha below refuses a
// replay).
export async function verifyAltcha(
  key: string,
  token: string,
  purpose: CaptchaPurpose,
  nowMs: number,
): Promise<AltchaResult> {
  const p = decodePayload(token);
  if (!p || p.algorithm !== "SHA-256" || !/^[0-9a-f]{64}$/.test(p.challenge)) {
    return { ok: false, reason: "malformed" };
  }
  if (!sameText(await hmacHex(key, p.challenge), p.signature)) {
    return { ok: false, reason: "signature" };
  }
  if (!sameText(await sha256Hex(`${p.salt}${p.number}`), p.challenge)) {
    return { ok: false, reason: "solution" };
  }
  const params = new URLSearchParams(p.salt.split("?")[1] ?? "");
  const expires = Number(params.get("expires"));
  if (!Number.isFinite(expires) || expires * 1000 <= nowMs) return { ok: false, reason: "expired" };
  if (params.get("purpose") !== purpose) return { ok: false, reason: "purpose" };
  return { ok: true, challenge: p.challenge, expiresMs: expires * 1000 };
}

// Where used solutions are remembered until their challenge expires. The
// functions use the database (captcha_spend, private.captcha_spent: one table
// for every instance, so a replay fails wherever it lands); MemorySpent below
// serves the unit tests.
export interface SpentStore {
  // True the first time a challenge is used; false on a replay or an error.
  use(challenge: string, expiresMs: number, nowMs: number): boolean | Promise<boolean>;
}

export class MemorySpent implements SpentStore {
  private spent = new Map<string, number>();

  constructor(private readonly max = 50_000) {}

  use(challenge: string, expiresMs: number, nowMs: number): boolean {
    if (this.spent.size >= this.max) {
      for (const [c, exp] of this.spent) if (exp <= nowMs) this.spent.delete(c);
      // Still full: refuse rather than forget what was used.
      if (this.spent.size >= this.max) return false;
    }
    if (this.spent.has(challenge)) return false;
    this.spent.set(challenge, expiresMs);
    return true;
  }
}

// The database store of a function: `rpc` calls a PostgREST function with the
// service role. A failed call counts as a replay (fail closed).
export function databaseSpent(
  rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>,
  purpose: CaptchaPurpose,
): SpentStore {
  return {
    async use(challenge, expiresMs) {
      try {
        const fresh = await rpc("captcha_spend", {
          p_challenge: challenge,
          p_purpose: purpose,
          p_expires_at: new Date(expiresMs).toISOString(),
        });
        return fresh === true;
      } catch {
        return false;
      }
    },
  };
}

// --- Both providers ---------------------------------------------------------

export interface VerifyContext {
  purpose: CaptchaPurpose;
  ip: string | null;
  nowMs: number;
  spent: SpentStore;
  fetch?: typeof fetch;
}

// The token passes the configured provider. Callers decide before whether a
// token is needed at all (captchaMode, demoMode).
export async function verifyCaptcha(
  env: CaptchaEnv,
  token: string | null,
  ctx: VerifyContext,
): Promise<boolean> {
  if (!token || !captchaConfigured(env)) return false;
  if (env.provider === "altcha") {
    const result = await verifyAltcha(env.altchaKey, token, ctx.purpose, ctx.nowMs);
    return result.ok && (await ctx.spent.use(result.challenge, result.expiresMs, ctx.nowMs));
  }
  const form = new URLSearchParams({ secret: env.turnstileSecret, response: token });
  if (ctx.ip) form.set("remoteip", ctx.ip);
  const res = await (ctx.fetch ?? fetch)(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: form },
  );
  if (!res.ok) return false;
  const result = await res.json();
  return result?.success === true;
}
