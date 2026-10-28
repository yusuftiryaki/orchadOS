// Rules of the demo-start Edge Function (docs/demo-turu.md §4, §7): request
// parsing, error codes and statuses, the IP bucket of the rate limits, the
// ORCHADOS_DEMO_MODE switch and the visitor e-mail.
//
// Pure TypeScript without imports or Deno APIs (Web Crypto only): the web
// app's unit tests (apps/web/src/lib/demo/demo-shared.test.ts) import this
// file. Nothing here logs; errors name a field, never a value.

// RFC 2606: reserved and undeliverable. private.demo_org.visitor_email_domain
// holds the domain actually used (a hosted GoTrue may refuse this one).
export const DEFAULT_DEMO_EMAIL_DOMAIN = "demo.orchados.invalid";

export function demoEmail(id: string, domain: string): string {
  return `ziyaretci-${id}@${domain}`;
}

export type DemoErrorCode =
  | "invalid_input"
  | "captcha_failed"
  | "rate_limited"
  | "demo_closed"
  | "demo_capacity"
  | "failed"
  | "unauthorized"
  | "demo_read_only";

const STATUS: Record<DemoErrorCode, number> = {
  invalid_input: 400,
  captcha_failed: 400,
  rate_limited: 429,
  demo_closed: 503,
  demo_capacity: 503,
  failed: 500,
  unauthorized: 401,
  demo_read_only: 403,
};

export function statusFor(code: DemoErrorCode): number {
  return STATUS[code];
}

export interface DemoStartResponse {
  // The magic link's hashed token: the browser calls
  // verifyOtp({ token_hash, type: verification_type }).
  token_hash: string;
  verification_type: string;
  expires_at: string;
  next: string;
}

export interface DemoErrorResponse {
  error: DemoErrorCode;
}

export type DemoRequest =
  | { action: "start"; clientIp: string | null; captchaToken: string | null }
  | { action: "cleanup" }
  | { action: "challenge" };

export type ParsedDemo = { ok: true; value: DemoRequest } | { ok: false; field: string };

// IPv4 or IPv6 (loose: characters and length only; ipBucket decides).
const IP_RE = /^[0-9a-fA-F:.]{2,45}$/;

export function parseDemoRequest(body: unknown): ParsedDemo {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, field: "body" };
  const b = body as Record<string, unknown>;
  if (b.action === "cleanup") return { ok: true, value: { action: "cleanup" } };
  if (b.action === "challenge") return { ok: true, value: { action: "challenge" } };
  if (b.action !== "start") return { ok: false, field: "action" };

  let clientIp: string | null = null;
  if (b.client_ip !== undefined && b.client_ip !== null) {
    clientIp = typeof b.client_ip === "string" ? b.client_ip.trim() : null;
    if (!clientIp || !IP_RE.test(clientIp)) return { ok: false, field: "client_ip" };
  }
  let captchaToken: string | null = null;
  if (b.captcha_token !== undefined && b.captcha_token !== null) {
    captchaToken = typeof b.captcha_token === "string" ? b.captcha_token : null;
    if (!captchaToken || captchaToken.length > 4096) return { ok: false, field: "captcha_token" };
  }
  return { ok: true, value: { action: "start", clientIp, captchaToken } };
}

function ipv4(value: string): string | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  for (const part of parts) {
    if (!/^[0-9]{1,3}$/.test(part) || Number(part) > 255) return null;
  }
  return value;
}

// The eight hextets of an IPv6 address (an embedded IPv4 tail allowed), or null.
function ipv6Hextets(value: string): number[] | null {
  let text = value.toLowerCase();
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(":");
  if (text.includes(".")) {
    const v4 = ipv4(text.slice(lastColon + 1));
    if (!v4) return null;
    const [a, b, c, d] = v4.split(".").map(Number);
    tail = [(a << 8) | b, (c << 8) | d];
    // Drop the IPv4 part and its separator, but keep a "::" right before it
    // ("::1.2.3.4").
    text = text.slice(0, lastColon + 1);
    if (!text.endsWith("::")) text = text.slice(0, -1);
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const group = (s: string): number[] | null => {
    if (s === "") return [];
    const out: number[] = [];
    for (const h of s.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
      out.push(parseInt(h, 16));
    }
    return out;
  };
  const head = group(halves[0]);
  const rest = halves.length === 2 ? group(halves[1]) : [];
  if (!head || !rest) return null;
  const known = head.length + rest.length + tail.length;
  if (halves.length === 2) {
    if (known > 7) return null;
    return [...head, ...new Array(8 - known).fill(0), ...rest, ...tail];
  }
  return known === 8 ? [...head, ...tail] : null;
}

// The rate limit bucket of a client IP: an IPv4 address as is, an IPv6
// address as its /64 ("2001:db8:0:1::/64"), an IPv4-mapped IPv6 address as
// the IPv4 address. Anything else is null (the caller uses "unknown").
export function ipBucket(ip: string | null): string | null {
  if (!ip) return null;
  const value = ip.trim();
  if (!value || value.length > 45) return null;
  if (!value.includes(":")) return ipv4(value);
  const hextets = ipv6Hextets(value);
  if (!hextets) return null;
  if (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) {
    return [hextets[6] >> 8, hextets[6] & 0xff, hextets[7] >> 8, hextets[7] & 0xff].join(".");
  }
  return `${hextets
    .slice(0, 4)
    .map((h) => h.toString(16))
    .join(":")}::/64`;
}

// Cloudflare's documented test secret keys (always pass, always fail, token
// already spent): never good enough for a public demo.
const TURNSTILE_DUMMY_SECRET = /^[123]x0+AA$/;

export interface DemoModeEnv {
  mode?: string;
  turnstileSecret?: string;
  // CAPTCHA_PROVIDER (_shared/captcha.ts): "" or "turnstile", or "altcha";
  // any other value keeps the demo closed.
  provider?: string;
  altchaKey?: string;
}

// How start treats the robot check: "required" needs a valid token, "if_sent"
// checks a token when one comes (dev with the self-hosted check: local stack
// and CI), "off" skips it.
export type DemoCaptcha = "required" | "if_sent" | "off";

// Same as captcha.ts ALTCHA_KEY_MIN.
const ALTCHA_KEY_MIN = 32;

// ORCHADOS_DEMO_MODE: unset or unknown keeps start closed; "dev" opens it
// (the robot check only when its key is set: local, CI, a short smoke test);
// "public" opens it only with a live key of the chosen provider (a real
// Turnstile secret, or an ALTCHA key of at least 32 characters), always
// checked.
export function demoMode(env: DemoModeEnv): { open: boolean; captcha: DemoCaptcha } {
  const provider = (env.provider ?? "").trim().toLowerCase() || "turnstile";
  if (provider !== "turnstile" && provider !== "altcha")
    return { open: false, captcha: "required" };
  if (provider === "altcha") {
    const keyOk = (env.altchaKey ?? "").length >= ALTCHA_KEY_MIN;
    if (env.mode === "dev") return { open: true, captcha: keyOk ? "if_sent" : "off" };
    if (env.mode === "public") return { open: keyOk, captcha: "required" };
    return { open: false, captcha: "required" };
  }
  const secret = env.turnstileSecret ?? "";
  if (env.mode === "dev") return { open: true, captcha: secret !== "" ? "required" : "off" };
  if (env.mode === "public") {
    return { open: secret !== "" && !TURNSTILE_DUMMY_SECRET.test(secret), captcha: "required" };
  }
  return { open: false, captcha: "required" };
}

export interface DemoSecrets {
  turnstileSecret: string;
  hashSecret: string;
  proxySecret: string;
}

// The secrets demo-start uses. A DEMO_* name wins over the shared one, so the
// demo can live on a project whose sign-up already holds the shared names
// (shared hosting on the test project, docs/demo-turu.md §15.1): its live
// Turnstile secret is bound to the demo hostname, and its proxy secret is the
// demo Vercel project's, not the test site's. An empty value counts as unset.
export function demoSecrets(get: (name: string) => string | undefined): DemoSecrets {
  const pick = (name: string) => get(`DEMO_${name}`) || get(name) || "";
  return {
    turnstileSecret: pick("TURNSTILE_SECRET_KEY"),
    hashSecret: pick("SIGNUP_HASH_SECRET"),
    proxySecret: pick("SIGNUP_PROXY_SECRET"),
  };
}
