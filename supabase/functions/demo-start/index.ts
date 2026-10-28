// demo-start: opens a short-lived, read-only demo account for the guided tour
// (docs/demo-turu.md §3, §7). Auth keeps sign-ups and anonymous sign-ins
// closed; like customer-signup, this function opens the account with the
// service role. The database (demo_admit, demo_start, the write guard and the
// account lockdown) decides everything else.
//
// POST /functions/v1/demo-start   (verify_jwt = false: checked per action)
//
// { "action": "start", client_ip?, captcha_token? }
//   x-orchados-proxy-secret: SIGNUP_PROXY_SECRET (Next server only; then
//   client_ip is trusted, otherwise cf-connecting-ip / x-forwarded-for)
//   Each of TURNSTILE_SECRET_KEY, SIGNUP_HASH_SECRET and SIGNUP_PROXY_SECRET
//   is read from its DEMO_-prefixed name first (_shared/demo.ts demoSecrets):
//   the demo shares the test project with the test site's sign-up for now.
//   0. ORCHADOS_DEMO_MODE (with the Turnstile secret, _shared/demo.ts
//      demoMode): unset or unknown → 503 demo_closed; "public" needs a live
//      Turnstile secret (not one of Cloudflare's test keys); "dev" verifies
//      Turnstile only when a secret is set.
//   1. Turnstile, when required.
//   2. ip_hash = HMAC-SHA256(SIGNUP_HASH_SECRET, "demo:" + IP bucket): the
//      IPv4 address, or the /64 of an IPv6 address ("unknown" without an IP).
//      demo_admit checks the per-IP and total limits and counts the request.
//   3. Admin API: ziyaretci-<uuid>@<visitor e-mail domain>, e-mail confirmed,
//      app_metadata {demo: true}; no password, phone or user_metadata.
//   4. demo_start writes the demo session and owner access to the demo
//      parcels; on any error the account is deleted at once.
//   5. Admin API generate_link (magiclink) → the hashed token, which the
//      browser exchanges with verifyOtp for a session of its own.
//   200 {token_hash, verification_type, expires_at, next}
//   · 400 {error: "invalid_input" | "captcha_failed"} · 429 {error: "rate_limited"}
//   · 503 {error: "demo_closed" | "demo_capacity"} · 500 {error: "failed"}
//
// { "action": "cleanup" }   x-orchados-cron-secret: ORCHADOS_CRON_SECRET
//   Every 15 minutes (pg_cron, private.dispatch_demo_cleanup): deletes the
//   accounts demo_expired_accounts names, in rounds of 200; an id that fails
//   to delete is not tried again in this run, and the loop stops after a
//   round without a new deletion or after 10 rounds. Then the deleted
//   accounts' GoTrue audit rows (best effort) and the number of due accounts
//   the rules keep (logged as a number only).
//   200 {deleted, failed, skipped} · 401 {error: "unauthorized"}
//
// No response and no log line carries an IP, an e-mail, a token or a secret.

import {
  type DemoErrorCode,
  type DemoStartResponse,
  demoEmail,
  demoMode,
  demoSecrets,
  ipBucket,
  parseDemoRequest,
  statusFor,
} from "../_shared/demo.ts";
import { clientIp, hmacHex, timingSafeEqual } from "../_shared/signup.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const {
  hashSecret: HASH_SECRET,
  proxySecret: PROXY_SECRET,
  turnstileSecret: TURNSTILE_SECRET,
} = demoSecrets((name) => Deno.env.get(name));
const CRON_SECRET = Deno.env.get("ORCHADOS_CRON_SECRET") ?? "";
const MODE = demoMode({ mode: Deno.env.get("ORCHADOS_DEMO_MODE"), turnstileSecret: TURNSTILE_SECRET });

const CLEANUP_BATCH = 200;
const CLEANUP_ROUNDS = 10;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const fail = (code: DemoErrorCode) => json({ error: code }, statusFor(code));

const serviceHeaders = {
  apikey: SERVICE_ROLE_KEY,
  authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

class Failure extends Error {}

// A PostgREST error: the raised message (e.g. demo_capacity) is the code.
class RpcError extends Failure {
  constructor(
    fn: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(`${fn} failed with ${status}`);
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) {
    let code = "";
    try {
      code = String(JSON.parse(text)?.message ?? "");
    } catch {
      // Not JSON: the status says enough.
    }
    throw new RpcError(fn, res.status, code);
  }
  return (text ? JSON.parse(text) : null) as T;
}

async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: serviceHeaders,
  });
  await res.body?.cancel();
  if (!res.ok && res.status !== 404) throw new Failure(`delete user failed with ${res.status}`);
}

async function captchaPassed(token: string | null, ip: string | null): Promise<boolean> {
  if (!token) return false;
  const form = new URLSearchParams({ secret: TURNSTILE_SECRET, response: token });
  if (ip) form.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  if (!res.ok) return false;
  const result = await res.json();
  return result?.success === true;
}

type Admit =
  | { ok: true; org_id: string; ttl_seconds: number; email_domain: string }
  | { ok: false; error: "demo_closed" | "rate_limited" | "demo_capacity" };

interface StartResult {
  org_id: string;
  expires_at: string;
  parcel_ids: string[];
  next: string;
}

async function createAccount(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ email, email_confirm: true, app_metadata: { demo: true } }),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Failure(`create user failed with ${res.status}`);
  }
  const user = await res.json();
  if (typeof user?.id !== "string") throw new Failure("create user returned no id");
  return user.id;
}

async function magicLink(email: string): Promise<{ tokenHash: string; type: string }> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Failure(`generate link failed with ${res.status}`);
  }
  const link = await res.json();
  // GoTrue answers with the properties at the top level (older versions
  // nest them under `properties`).
  const props = link?.hashed_token ? link : link?.properties;
  if (typeof props?.hashed_token !== "string" || !props.hashed_token) {
    throw new Failure("generate link returned no token");
  }
  return {
    tokenHash: props.hashed_token,
    type: typeof props.verification_type === "string" ? props.verification_type : "magiclink",
  };
}

const ADMIT_ERRORS = new Set(["demo_closed", "rate_limited", "demo_capacity"]);
const START_ERRORS = new Set(["demo_closed", "demo_capacity"]);

async function start(req: Request, clientIpBody: string | null, captchaToken: string | null) {
  if (!MODE.open) {
    console.log("demo-start: demo_mode_closed");
    return fail("demo_closed");
  }
  if (!HASH_SECRET) throw new Failure("SIGNUP_HASH_SECRET (or DEMO_SIGNUP_HASH_SECRET) is not set");

  const ip = clientIp(req.headers, clientIpBody, PROXY_SECRET);
  if (MODE.requireTurnstile && !(await captchaPassed(captchaToken, ip))) return fail("captcha_failed");

  const ipHash = await hmacHex(HASH_SECRET, `demo:${ipBucket(ip) ?? "unknown"}`);
  const admit = await rpc<Admit>("demo_admit", { p_ip_hash: ipHash });
  if (!admit?.ok) {
    const code = admit?.error;
    if (code && ADMIT_ERRORS.has(code)) return fail(code);
    throw new Failure("unexpected demo_admit result");
  }

  const email = demoEmail(crypto.randomUUID(), admit.email_domain);
  const userId = await createAccount(email);
  let result: StartResult;
  let link: { tokenHash: string; type: string };
  try {
    result = await rpc<StartResult>("demo_start", { p_user_id: userId, p_ip_hash: ipHash });
    link = await magicLink(email);
  } catch (cause) {
    await deleteUser(userId).catch(() => console.error("demo-start: delete after failed start failed"));
    if (cause instanceof RpcError && START_ERRORS.has(cause.code)) {
      return fail(cause.code as DemoErrorCode);
    }
    throw cause;
  }

  const body: DemoStartResponse = {
    token_hash: link.tokenHash,
    verification_type: link.type,
    expires_at: result.expires_at,
    next: result.next,
  };
  return json(body);
}

async function cleanup(req: Request): Promise<Response> {
  const sent = req.headers.get("x-orchados-cron-secret");
  if (!CRON_SECRET || sent === null || !timingSafeEqual(sent, CRON_SECRET)) {
    return fail("unauthorized");
  }
  const failed = new Set<string>();
  const deleted: string[] = [];
  for (let round = 0; round < CLEANUP_ROUNDS; round++) {
    const ids = await rpc<string[]>("demo_expired_accounts", {
      p_limit: CLEANUP_BATCH,
      p_exclude: [...failed],
    });
    let fresh = 0;
    for (const id of ids ?? []) {
      if (failed.has(id) || deleted.includes(id)) continue;
      try {
        await deleteUser(id);
        deleted.push(id);
        fresh++;
      } catch {
        failed.add(id);
      }
    }
    if (fresh === 0) break;
  }

  let purged = 0;
  if (deleted.length > 0) {
    purged = await rpc<number>("demo_purge_audit_log", { p_user_ids: deleted }).catch(() => 0);
  }
  const skipped = await rpc<number>("demo_undeletable_count", {});
  console.log(
    `demo-start: cleanup deleted=${deleted.length} failed=${failed.size} audit_rows=${purged} undeletable=${skipped}`,
  );
  return json({ deleted: deleted.length, failed: failed.size, skipped });
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_input");
  }
  const parsed = parseDemoRequest(body);
  if (!parsed.ok) return json({ error: "invalid_input", field: parsed.field }, 400);
  try {
    if (parsed.value.action === "cleanup") return await cleanup(req);
    return await start(req, parsed.value.clientIp, parsed.value.captchaToken);
  } catch (cause) {
    // Status codes only; never the request body.
    console.error("demo-start:", cause instanceof Error ? cause.message : "unknown error");
    return fail("failed");
  }
}

Deno.serve(handle);
