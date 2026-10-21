// invite-user: creates a portal account (owner or viewer) for the operations
// screens (/operasyon), so that the service role key never leaves Supabase
// (docs/deployment.md: it is not put on Vercel).
//
// POST /functions/v1/invite-user
//   Authorization: Bearer <JWT of the calling user>
//   { "org_id": uuid, "email"?: string, "phone"?: "+90..." }
//
// 1. The caller is read from the JWT (Auth API) and must hold the `ops` role in
//    `org_id` (membership, read with the caller's own JWT under RLS).
// 2. A user with that e-mail (or, without e-mail, that phone) already exists:
//    its id is returned, nothing changes (created: false).
// 3. Otherwise the user is created with the service role, e-mail and phone
//    marked as confirmed. With an e-mail it gets a random one-time password,
//    returned once for operations to pass on (WhatsApp); without one there is
//    no way to sign in until phone (SMS) login is enabled, and the account is
//    already keyed by the phone number for that.
//
// Responses: 200 { user_id, created, one_time_password | null }
//            400 invalid_input · 401 unauthorized · 403 forbidden · 409 conflict · 500 failed
// Personal data (e-mail, phone, password) is never logged or echoed in errors.
//
// No imports on purpose: plain fetch against the Auth and REST APIs keeps the
// function free of remote dependencies (local edge runtime, CI, deploys).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+[1-9][0-9]{6,14}$/;

// No 0/O, 1/l/I: the password is read out or typed from a phone screen.
const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_LENGTH = 14;

type ErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "method_not_allowed"
  | "failed";

const STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  unauthorized: 401,
  forbidden: 403,
  conflict: 409,
  method_not_allowed: 405,
  failed: 500,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const fail = (code: ErrorCode) => json({ error: code }, STATUS[code]);

function oneTimePassword(): string {
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % PASSWORD_ALPHABET.length);
  let out = "";
  while (out.length < PASSWORD_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(32))) {
      if (byte < limit && out.length < PASSWORD_LENGTH) {
        out += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
      }
    }
  }
  return out;
}

interface Input {
  orgId: string;
  email: string | null;
  phone: string | null;
}

function parseInput(body: unknown): Input | null {
  if (!body || typeof body !== "object") return null;
  const { org_id, email, phone } = body as Record<string, unknown>;
  const clean = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
  const input = {
    orgId: clean(org_id) ?? "",
    email: clean(email)?.toLowerCase() ?? null,
    phone: clean(phone),
  };
  if (!UUID_RE.test(input.orgId)) return null;
  if (!input.email && !input.phone) return null;
  if (input.email && !EMAIL_RE.test(input.email)) return null;
  if (input.phone && !PHONE_RE.test(input.phone)) return null;
  return input;
}

// The caller as the Auth API sees the bearer token (signature and expiry).
async function callerId(authorization: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, authorization },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return typeof user?.id === "string" ? user.id : null;
}

// Requests made as the caller: row level security and the ops_* functions
// decide, exactly as for the web app.
function asCaller(authorization: string) {
  return { apikey: ANON_KEY, authorization, "content-type": "application/json" };
}

async function isOps(authorization: string, userId: string, orgId: string): Promise<boolean> {
  const query = new URLSearchParams({
    select: "role",
    user_id: `eq.${userId}`,
    org_id: `eq.${orgId}`,
    role: "eq.ops",
  });
  const res = await fetch(`${SUPABASE_URL}/rest/v1/membership?${query}`, {
    headers: asCaller(authorization),
  });
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function existingUserId(authorization: string, input: Input): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ops_find_user_id`, {
    method: "POST",
    headers: asCaller(authorization),
    body: JSON.stringify({
      p_org_id: input.orgId,
      // E-mail wins: it is the login today; the phone is matched only without one.
      p_email: input.email,
      p_phone: input.email ? null : input.phone,
    }),
  });
  if (!res.ok) throw new Error(`ops_find_user_id failed with ${res.status}`);
  const id = await res.json();
  return typeof id === "string" ? id : null;
}

async function createUser(input: Input, invitedBy: string) {
  const password = input.email ? oneTimePassword() : null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...(input.email ? { email: input.email, email_confirm: true, password } : {}),
      ...(input.phone ? { phone: input.phone, phone_confirm: true } : {}),
      app_metadata: { invited_by: invitedBy, invited_at: new Date().toISOString() },
    }),
  });
  if (res.status === 422) return { conflict: true as const };
  if (!res.ok) throw new Error(`create user failed with ${res.status}`);
  const user = await res.json();
  return { conflict: false as const, id: String(user.id), password };
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== "POST") return fail("method_not_allowed");

  const authorization = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return fail("unauthorized");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_input");
  }
  const input = parseInput(body);

  try {
    const caller = await callerId(authorization);
    if (!caller) return fail("unauthorized");
    if (!input) return fail("invalid_input");
    if (!(await isOps(authorization, caller, input.orgId))) return fail("forbidden");

    const existing = await existingUserId(authorization, input);
    if (existing) return json({ user_id: existing, created: false, one_time_password: null });

    const created = await createUser(input, caller);
    if (created.conflict) {
      // Taken by the other identifier (e.g. the phone of a user with another e-mail).
      return fail("conflict");
    }
    return json({ user_id: created.id, created: true, one_time_password: created.password });
  } catch (error) {
    // Status codes only; never the request body.
    console.error("invite-user:", error instanceof Error ? error.message : "unknown error");
    return fail("failed");
  }
}

Deno.serve(handle);
