// customer-signup: self sign-up of a customer (docs/musteri-yonetimi.md §7).
// Auth keeps sign-ups closed (enable_signup = false); this function opens the
// account with the service role and the customer profile is created only after
// the phone is verified with an SMS code.
//
// POST /functions/v1/customer-signup   (verify_jwt = false: checked per action)
//
// { "action": "register", full_name, phone ("+905…"), email, password,
//   contact_preference ("whatsapp" | "sms"),
//   consents: { kvkk_notice_version, explicit_text_version,
//               explicit_service_improvement, explicit_marketing },
//   client_ip?, captcha_token?, ticket? }
//   x-orchados-proxy-secret: SIGNUP_PROXY_SECRET (Next server only; then
//   client_ip is trusted, otherwise cf-connecting-ip / x-forwarded-for)
//   1. Validation; the robot check (_shared/captcha.ts): CAPTCHA_PROVIDER
//      turnstile (default, TURNSTILE_SECRET_KEY) or altcha (self-hosted proof
//      of work, ALTCHA_HMAC_KEY). Without the chosen provider's key, or with
//      an unknown provider, register is closed (503 signup_closed) unless
//      SIGNUP_TURNSTILE_DISABLED=1 (local stack only, supabase/config.toml). Sign-ups are also closed while no org has
//      accepts_signups (signup_register_attempt): that is the server-side
//      switch; the web flag ORCHADOS_SIGNUP_ENABLED only hides /kayit.
//   2. Rate limits: signup_register_attempt with HMAC-SHA256 (SIGNUP_HASH_SECRET)
//      of the IP, the phone and the e-mail (10 per IP an hour, 3 per phone and
//      5 per e-mail a day).
//   3. Accounts holding the e-mail or phone (signup_find_account): stale self
//      sign-ups (phone never verified) started more than 30 minutes ago are
//      deleted, younger ones count as taken, except the registrant's own (the
//      body's `ticket`, from this browser's previous register, is its pending
//      sign-up's: signup_ticket_users). A phone that belongs to an account
//      (its verified owner, someone else's sign-up in progress, another
//      customer's profile) gets the same 200 as a new sign-up and nothing
//      changes: the web's code step then asks only for a login code, which
//      only reaches the phone's verified owner. A taken e-mail with a free
//      phone gets the generic 409 not_completed (docs/hukuk/kararlar.md H33:
//      no answer tells which one is registered).
//   4. Admin API: the account, e-mail confirmed (password login needs it),
//      phone not confirmed, app_metadata.signup = "self".
//   5. signup_prepare stores the pending sign-up and signup_set_ticket the
//      SHA-256 of the new ticket; on failure the account goes.
//   Every 200 carries a fresh `ticket` (an unstored one for a registered
//   phone): the web keeps it in an httpOnly cookie and sends it with
//   send_code and complete, which binds them to this register.
//   Every answer after the rate limits (200 or 409) waits until
//   REGISTER_MIN_MS has passed since the request came in, so a new account
//   and a registered phone or e-mail take the same time (H33).
//   200 {next: "verify_phone", ticket} · 400 {error: "invalid_input", field} |
//   {error: "captcha_failed"} · 409 {error: "not_completed"}
//   · 429 {error: "too_many_attempts"} · 503 {error: "signup_closed"} · 500 {error: "failed"}
//
// { "action": "challenge" }   CAPTCHA_PROVIDER=altcha only
//   A signed proof-of-work challenge for the sign-up form (10 minutes; the
//   Next server asks for it). 200 {algorithm, challenge, maxnumber, salt,
//   signature} · 400 {error: "invalid_input", field: "action"} with another
//   provider · 503 {error: "signup_closed"} without ALTCHA_HMAC_KEY
//
// { "action": "send_code", phone, ticket }   (the web's code step, server side)
//   The phone confirmation code of the pending self sign-up this ticket's
//   register wrote: signup_code_grant (service role; one a minute, six per
//   sign-up) leaves a 30-second marker, this request asks Auth for the code
//   (/auth/v1/resend), the Send SMS hook sends it and consumes the marker,
//   and signup_code_release drops whatever is left once Auth answered. So
//   the marker only ever covers this one server-initiated send. Always 200 {}
//   after at least SEND_CODE_MIN_MS (granted or not, sent or not: H33);
//   400 invalid_input for a malformed phone or ticket.
//
// { "action": "complete", ticket? }   Authorization: Bearer <the user's access token>
//   After verifyOtp: the session must come from a phone code (amr otp/sms
//   whose timestamp matches the phone_confirmed_at that code stamped; an
//   e-mail code is "otp" too: latestPhoneCodeAt) with the phone confirmed.
//   Every complete of a pending sign-up proves the registrant
//   (signup_owner_check; no ticket never skips it): the `ticket` of the
//   register that wrote it (the web's cookie; `claim` for a password
//   session), or a session opened with the account's password. Otherwise 403
//   signup_mismatch and the phone is never left confirmed on that account:
//   the check itself quarantines an unfinished self sign-up with a confirmed
//   phone (phone confirmation cleared, sessions ended, row flagged
//   delete_failed) and then the account is deleted; if the delete fails
//   twice the quarantine stays and an ALERT line goes to the log. One written
//   before tickets is quarantined the same way, not deleted, and its
//   registrant finishes with their password.
//   signup_complete then checks that the confirmed phone is the pending one
//   and the code is newer than the pending sign-up (else 403) and writes the
//   owner profile and the consent records.
//   A demo visitor's token (app_metadata.demo) is refused before any service
//   role call (docs/demo-turu.md §6.3).
//   200 {status: "completed" | "already_completed" | "no_pending"}
//   · 401 {error: "unauthorized"}
//   · 403 {error: "phone_not_verified" | "signup_mismatch" | "demo_read_only"}
//
// { "action": "claim" }   Authorization: Bearer <the user's access token>
//   /kayit/dogrula, before it asks for the code: a session opened with the
//   account's password (amr password) gets a fresh ticket for its pending
//   sign-up (signup_set_ticket replaces the stored one). verifyOtp replaces
//   the session with the code's, so the ticket carries the password proof to
//   complete.
//   200 {ticket} | {status: "no_pending"} · 401 {error: "unauthorized"}
//   · 403 {error: "password_required" | "demo_read_only"}
//
// { "action": "cleanup" }   x-orchados-cron-secret: ORCHADOS_CRON_SECRET
//   Hourly (pg_cron, private.dispatch_signup_cleanup): deletes self sign-up
//   accounts whose phone was not verified within 24 hours, except those whose
//   sign-up is under ops review (signup_review_user_ids). 200 {deleted: n} · 401
//
// No response and no log line carries a phone number, e-mail or password.

import {
  captchaConfigured,
  captchaEnv,
  captchaMode,
  createAltchaChallenge,
  databaseSpent,
  verifyCaptcha,
} from "../_shared/captcha.ts";
import {
  type AccountMatch,
  clientIp,
  completeTicket,
  decideMatches,
  hasPasswordAmr,
  hmacHex,
  isDemoClaims,
  isExpiredUnverified,
  jwtClaims,
  latestPhoneCodeAt,
  parseRegister,
  type RegisterInput,
  registerDelayMs,
  ticketHash,
  newTicket,
  PHONE_TR_RE,
  TICKET_RE,
  timingSafeEqual,
} from "../_shared/signup.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const HASH_SECRET = Deno.env.get("SIGNUP_HASH_SECRET") ?? "";
const PROXY_SECRET = Deno.env.get("SIGNUP_PROXY_SECRET") ?? "";
const CRON_SECRET = Deno.env.get("ORCHADOS_CRON_SECRET") ?? "";
const CAPTCHA_ENV = captchaEnv((name) => Deno.env.get(name));
const CAPTCHA = captchaMode(CAPTCHA_ENV, Deno.env.get("SIGNUP_TURNSTILE_DISABLED"));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

const error = (code: string, status: number, extra: Record<string, string> = {}) =>
  json({ error: code, ...extra }, status);

const serviceHeaders = {
  apikey: SERVICE_ROLE_KEY,
  authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

class Failure extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Failure(`${fn} failed with ${res.status}`, res.status);
  // Functions returning void answer with an empty body.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// Solved self-hosted challenges, in the database for every instance.
const spentChallenges = databaseSpent(rpc, "signup");

// The send_code answer takes at least this long, whether a code went out or
// not (H33).
const SEND_CODE_MIN_MS = 1500;

async function deleteUser(id: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: "DELETE",
    headers: serviceHeaders,
  });
  if (!res.ok && res.status !== 404) throw new Failure(`delete user failed with ${res.status}`);
}

async function captchaPassed(token: string | null, ip: string | null): Promise<boolean> {
  if (CAPTCHA === "skip" || (CAPTCHA === "optional" && !token)) return true;
  return verifyCaptcha(CAPTCHA_ENV, token, {
    purpose: "signup",
    ip,
    nowMs: Date.now(),
    spent: spentChallenges,
  });
}

async function challenge(): Promise<Response> {
  if (CAPTCHA_ENV.provider !== "altcha") return error("invalid_input", 400, { field: "action" });
  if (!captchaConfigured(CAPTCHA_ENV)) return error("signup_closed", 503);
  return json(await createAltchaChallenge(CAPTCHA_ENV.altchaKey, "signup", Date.now()));
}

type CreateResult = { kind: "created"; id: string } | { kind: "conflict" };

async function createAccount(input: RegisterInput): Promise<CreateResult> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      phone: input.phone,
      email_confirm: true,
      phone_confirm: false,
      app_metadata: { signup: "self" },
    }),
  });
  // Two registers of one phone at once: the loser gets 422, or a 500 when
  // Auth hits the unique index mid-insert. Both are read again.
  if (res.status === 422 || res.status === 500) return { kind: "conflict" };
  if (!res.ok) throw new Failure(`create user failed with ${res.status}`);
  const user = await res.json();
  return { kind: "created", id: String(user.id) };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function register(req: Request, body: unknown): Promise<Response> {
  const startedMs = Date.now();
  const parsed = parseRegister(body);
  if (!parsed.ok) return error("invalid_input", 400, { field: parsed.field });
  const input = parsed.value;
  if (!HASH_SECRET) throw new Failure("SIGNUP_HASH_SECRET is not set");
  if (CAPTCHA === "unconfigured") {
    // Fail closed: no sign-up without a captcha on a hosted project.
    console.error("customer-signup: the captcha provider is not configured; sign-ups refused");
    return error("signup_closed", 503);
  }

  const ip = clientIp(req.headers, input.clientIp, PROXY_SECRET);
  if (!(await captchaPassed(input.captchaToken, ip))) return error("captcha_failed", 400);

  const attempt = await rpc<string>("signup_register_attempt", {
    p_ip_hash: await hmacHex(HASH_SECRET, ip ?? "unknown"),
    p_phone_hash: await hmacHex(HASH_SECRET, input.phone),
    p_email_hash: await hmacHex(HASH_SECRET, input.email),
  });
  if (attempt === "closed") return error("signup_closed", 503);
  if (attempt === "too_many") return error("too_many_attempts", 429);
  if (attempt !== "ok") throw new Failure("unexpected attempt result");

  // From here on the answer depends on who holds the phone or e-mail: same
  // time for every outcome (H33).
  const answer = async (response: Response) => {
    await sleep(registerDelayMs(startedMs, Date.now()));
    return response;
  };

  // The registrant's own sign-up in progress, by the previous ticket.
  const own = new Set(
    input.ticket
      ? await rpc<string[]>("signup_ticket_users", {
          p_ticket_hash: await ticketHash(input.ticket),
        })
      : [],
  );
  const ticket = newTicket();

  // A 422 from Auth means someone took the e-mail or phone meanwhile: the
  // matches are read again once.
  for (let round = 0; round < 2; round++) {
    const matches = await rpc<AccountMatch[]>("signup_find_account", {
      p_email: input.email,
      p_phone: input.phone,
    });
    const decision = decideMatches(
      matches.map((m) => ({ ...m, ticket_match: own.has(m.user_id) })),
      Date.now(),
    );
    for (const id of decision.staleUserIds) await deleteUser(id);
    // An unstored ticket: it matches nothing, so the code step asks for no
    // confirmation code and complete opens no pending sign-up with it.
    if (decision.outcome === "send_code") return answer(json({ next: "verify_phone", ticket }));
    if (decision.outcome === "conflict") return answer(error("not_completed", 409));

    const created = await createAccount(input);
    if (created.kind === "conflict") continue;
    try {
      await rpc("signup_prepare", {
        p_user_id: created.id,
        p_full_name: input.fullName,
        p_email: input.email,
        p_phone: input.phone,
        p_contact_preference: input.contactPreference,
        p_consents: input.consents,
        p_ip_hash: ip ? await hmacHex(HASH_SECRET, ip) : null,
      });
      await rpc("signup_set_ticket", {
        p_user_id: created.id,
        p_ticket_hash: await ticketHash(ticket),
      });
    } catch (cause) {
      await deleteUser(created.id);
      throw cause;
    }
    return answer(json({ next: "verify_phone", ticket }));
  }
  throw new Failure("account conflict did not resolve");
}

async function sendCode(body: unknown): Promise<Response> {
  const startedMs = Date.now();
  const b = body as { phone?: unknown; ticket?: unknown };
  const phone = typeof b.phone === "string" ? b.phone : "";
  const ticket = typeof b.ticket === "string" ? b.ticket : "";
  if (!PHONE_TR_RE.test(phone)) return error("invalid_input", 400, { field: "phone" });
  if (!TICKET_RE.test(ticket)) return error("invalid_input", 400, { field: "ticket" });
  try {
    const grant = await rpc<string>("signup_code_grant", { p_phone: phone, p_ticket: ticket });
    if (grant === "granted") {
      try {
        // Auth's answer is not passed on: a limit or a failed send gets the
        // same 200 as a number without a pending sign-up.
        const res = await fetch(`${SUPABASE_URL}/auth/v1/resend`, {
          method: "POST",
          headers: { apikey: ANON_KEY, "content-type": "application/json" },
          body: JSON.stringify({ type: "sms", phone }),
        });
        if (!res.ok) console.error("customer-signup: send_code resend failed with", res.status);
      } finally {
        await rpc("signup_code_release", { p_phone: phone });
      }
    }
  } catch (cause) {
    console.error("customer-signup: send_code:", cause instanceof Error ? cause.message : "unknown error");
  }
  await sleep(registerDelayMs(startedMs, Date.now(), SEND_CODE_MIN_MS));
  return json({});
}

interface SessionUser {
  user: { id: string; phone_confirmed_at?: string | null };
  claims: Record<string, unknown> | null;
}

// The bearer token's user (checked by Auth) and claims, or an error answer.
async function sessionUser(req: Request): Promise<SessionUser | Response> {
  const authorization = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
  if (!token) return error("unauthorized", 401);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!res.ok) return error("unauthorized", 401);
  const user = await res.json();
  if (typeof user?.id !== "string") return error("unauthorized", 401);
  const claims = jwtClaims(token);
  // A demo visitor (docs/demo-turu.md §6.3): the service role below would not
  // carry its claim past the database's write guard.
  if (isDemoClaims(claims)) return error("demo_read_only", 403);
  return { user, claims };
}

async function complete(req: Request, body: unknown): Promise<Response> {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { user, claims } = session;

  const codeAt = latestPhoneCodeAt(claims, user.phone_confirmed_at);
  if (!user.phone_confirmed_at || codeAt === null) return error("phone_not_verified", 403);
  const codeAtIso = new Date(codeAt * 1000).toISOString();

  // The pending sign-up must be the session's: its ticket, or the password.
  const ticket = completeTicket(body);
  const check = await rpc<string>("signup_owner_check", {
    p_user_id: user.id,
    p_ticket_hash: ticket === null ? null : await ticketHash(ticket),
    p_password: hasPasswordAmr(claims),
  });
  if (check === "mismatch") {
    // Someone else's unfinished sign-up with this phone. The check already
    // quarantined it (phone confirmation cleared, sessions ended, flagged
    // delete_failed); now it goes. If it cannot go, the quarantine stays for
    // ops and the log carries an alert.
    let deleted = false;
    for (let round = 0; round < 2 && !deleted; round++) {
      try {
        await deleteUser(user.id);
        deleted = true;
      } catch (cause) {
        if (round === 1) {
          console.error(
            "ALERT customer-signup: hijack candidate quarantined but not deleted (delete_failed):",
            cause instanceof Error ? cause.message : "unknown error",
          );
        }
      }
    }
    return error("signup_mismatch", 403);
  }
  if (check === "refused") return error("signup_mismatch", 403);
  if (check !== "ok" && check !== "no_pending" && check !== "already_completed") {
    throw new Failure("unexpected owner check result");
  }
  // signup_complete checks the rest in one transaction: a self sign-up whose
  // confirmed phone is the pending one, and a code newer than the pending row.
  const status = await rpc<string>("signup_complete", {
    p_user_id: user.id,
    p_code_at: codeAtIso,
  });
  if (status === "phone_mismatch") return error("phone_not_verified", 403);
  return json({ status });
}

async function claim(req: Request): Promise<Response> {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  if (!hasPasswordAmr(session.claims)) return error("password_required", 403);
  const ticket = newTicket();
  try {
    await rpc("signup_set_ticket", {
      p_user_id: session.user.id,
      p_ticket_hash: await ticketHash(ticket),
    });
  } catch (cause) {
    // invalid_input (400): no unfinished sign-up for this account.
    if (cause instanceof Failure && cause.status === 400) return json({ status: "no_pending" });
    throw cause;
  }
  return json({ ticket });
}

async function cleanup(req: Request): Promise<Response> {
  const sent = req.headers.get("x-orchados-cron-secret");
  if (!CRON_SECRET || sent === null || !timingSafeEqual(sent, CRON_SECRET)) {
    return error("unauthorized", 401);
  }
  const now = Date.now();
  const underReview = new Set(await rpc<string[]>("signup_review_user_ids", {}));
  const expired: string[] = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: serviceHeaders,
    });
    if (!res.ok) throw new Failure(`list users failed with ${res.status}`);
    const users = ((await res.json())?.users ?? []) as Parameters<typeof isExpiredUnverified>[0][];
    for (const user of users) {
      const id = String((user as { id: unknown }).id);
      if (isExpiredUnverified(user, now) && !underReview.has(id)) expired.push(id);
    }
    if (users.length < 1000) break;
  }
  for (const id of expired) await deleteUser(id);
  return json({ deleted: expired.length });
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return error("method_not_allowed", 405);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("invalid_input", 400, { field: "body" });
  }
  const action = body && typeof body === "object" ? (body as { action?: unknown }).action : null;
  try {
    if (action === "register") return await register(req, body);
    if (action === "send_code") return await sendCode(body);
    if (action === "complete") return await complete(req, body);
    if (action === "claim") return await claim(req);
    if (action === "cleanup") return await cleanup(req);
    if (action === "challenge") return await challenge();
    return error("invalid_input", 400, { field: "action" });
  } catch (cause) {
    // Status codes only; never the request body.
    console.error("customer-signup:", cause instanceof Error ? cause.message : "unknown error");
    return error("failed", 500);
  }
}

Deno.serve(handle);
