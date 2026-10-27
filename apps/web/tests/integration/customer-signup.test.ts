import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { requestSignupCode } from "@/lib/billing/signup-code";
import { ageSignups, purgeBillingUsers, purgeSignupAttempts } from "../local-db";
import { anonClient, serviceClient } from "./fixtures";

// Self sign-up against the local stack (docs/musteri-yonetimi.md §7): the
// customer-signup Edge Function opens the account, the SMS code (read from the
// outbox of the send-sms hook's record provider) verifies the phone, complete
// writes the profile and consents. Every request carries the proxy secret and
// a TEST-NET client IP of its own (203.0.113.x) for the per-IP limit.

const PROXY_SECRET = "signup-proxy-local";
const CRON_SECRET = "cron-local";
const EMAIL_DOMAIN = "signup-test.example.test";

const randomDigits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const randomPhone = () => `+90555${randomDigits(7)}`;
const randomEmail = (label: string) => `${label}-${randomDigits(8)}@${EMAIL_DOMAIN}`;
const PASSWORD = "parola-1234";

function body(overrides: Record<string, unknown> = {}) {
  return {
    action: "register",
    full_name: "Deneme Müşteri",
    phone: randomPhone(),
    email: randomEmail("musteri"),
    password: PASSWORD,
    contact_preference: "sms",
    consents: {
      kvkk_notice_version: "kvkk-v1-taslak",
      explicit_text_version: "riza-v1-taslak",
      explicit_service_improvement: true,
      explicit_marketing: false,
    },
    ...overrides,
  };
}

async function signup(
  payload: Record<string, unknown>,
  ip: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${inject("supabase").url}/functions/v1/customer-signup`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-orchados-proxy-secret": PROXY_SECRET,
      ...headers,
    },
    body: JSON.stringify(payload.action === "register" ? { ...payload, client_ip: ip } : payload),
  });
  return { status: res.status, json: await res.json() };
}

async function latestCode(phone: string): Promise<string | null> {
  const { data, error } = await serviceClient().rpc("message_outbox_list", {
    p_recipient: phone,
    p_limit: 1,
  });
  if (error) throw error;
  const text = data?.[0]?.purpose === "login_code" ? data[0].body : "";
  return /\b(\d{6})\b/.exec(text)?.[1] ?? null;
}

// The code step of the web flow, through the helper the sign-up page uses.
async function sendCode(client: ReturnType<typeof anonClient>, phone: string) {
  return requestSignupCode(client.auth, phone);
}

async function usersByEmail(emails: string[]) {
  const { data, error } = await serviceClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.filter((u) => u.email && emails.includes(u.email));
}

async function testUserIds(): Promise<string[]> {
  const { data, error } = await serviceClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.filter((u) => u.email?.endsWith(`@${EMAIL_DOMAIN}`)).map((u) => u.id);
}

async function cleanUp() {
  const ids = await testUserIds();
  if (ids.length) await purgeBillingUsers(ids);
  for (const id of ids) await serviceClient().auth.admin.deleteUser(id);
}

beforeAll(async () => {
  await cleanUp();
  await purgeSignupAttempts();
});

afterAll(async () => {
  await cleanUp();
  await purgeSignupAttempts();
});

describe("customer-signup", () => {
  it("register → SMS code → complete creates the profile and three consents", async () => {
    const input = body({ full_name: "  Ayşe   Deneme ", email: randomEmail("Tam").toUpperCase() });
    const registered = await signup(input, "203.0.113.1");
    expect(registered).toEqual({ status: 200, json: { next: "verify_phone" } });

    const [user] = await usersByEmail([String(input.email).toLowerCase()]);
    expect(user.app_metadata.signup).toBe("self");
    expect(user.phone_confirmed_at ?? null).toBeNull();

    const client = anonClient();
    const phone = String(input.phone);
    expect(await sendCode(client, phone)).toBeNull();
    const code = await latestCode(phone);
    expect(code).toMatch(/^\d{6}$/);
    const verified = await client.auth.verifyOtp({ phone, token: code!, type: "sms" });
    expect(verified.error).toBeNull();
    const token = verified.data.session!.access_token;

    const complete = await signup({ action: "complete" }, "203.0.113.1", {
      authorization: `Bearer ${token}`,
    });
    expect(complete).toEqual({ status: 200, json: { status: "completed" } });

    const profile = await client.rpc("my_owner_profile");
    expect(profile.error).toBeNull();
    expect(profile.data).toEqual([
      expect.objectContaining({
        full_name: "Ayşe Deneme",
        phone,
        email: String(input.email).toLowerCase(),
        contact_preference: "sms",
        kvkk_consent: true,
      }),
    ]);
    const consents = await client.rpc("my_consents");
    expect(consents.error).toBeNull();
    expect(
      Object.fromEntries((consents.data ?? []).map((c) => [c.kind, [c.granted, c.text_version]])),
    ).toEqual({
      kvkk_notice: [true, "kvkk-v1-taslak"],
      explicit_service_improvement: [true, "riza-v1-taslak"],
      explicit_marketing: [false, "riza-v1-taslak"],
    });

    const again = await signup({ action: "complete" }, "203.0.113.1", {
      authorization: `Bearer ${token}`,
    });
    expect(again.json).toEqual({ status: "already_completed" });

    // The password works too, and the phone owner registering again is sent
    // to the code step without changes.
    const password = await anonClient().auth.signInWithPassword({
      email: String(input.email),
      password: PASSWORD,
    });
    expect(password.error).toBeNull();
    const repeat = await signup(body({ phone, email: String(input.email) }), "203.0.113.1");
    expect(repeat).toEqual({ status: 200, json: { next: "verify_phone" } });
  });

  it("complete after a password sign-in is refused (no phone code)", async () => {
    const input = body({ email: randomEmail("parola") });
    expect((await signup(input, "203.0.113.2")).status).toBe(200);
    const client = anonClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: String(input.email),
      password: PASSWORD,
    });
    expect(error).toBeNull();
    const res = await signup({ action: "complete" }, "203.0.113.2", {
      authorization: `Bearer ${data.session!.access_token}`,
    });
    expect(res).toEqual({ status: 403, json: { error: "phone_not_verified" } });

    const anonymous = await signup({ action: "complete" }, "203.0.113.2");
    expect(anonymous).toEqual({ status: 401, json: { error: "unauthorized" } });
  });

  it("a stale unverified sign-up with the same e-mail is replaced after the grace period", async () => {
    const email = randomEmail("bayat");
    const first = body({ email });
    expect((await signup(first, "203.0.113.3")).status).toBe(200);
    const [stale] = await usersByEmail([email]);
    await ageSignups([stale.id], 31);

    const second = body({ email });
    expect(await signup(second, "203.0.113.3")).toEqual({
      status: 200,
      json: { next: "verify_phone" },
    });
    const [fresh] = await usersByEmail([email]);
    expect(fresh.id).not.toBe(stale.id);
    expect(fresh.phone).toBe(String(second.phone).slice(1));
    const gone = await serviceClient().auth.admin.getUserById(stale.id);
    expect(gone.data.user).toBeNull();
  });

  it("a sign-up in progress is not replaced by the same e-mail or phone", async () => {
    const victim = body({ email: randomEmail("surmekte") });
    expect((await signup(victim, "203.0.113.8")).status).toBe(200);
    const [account] = await usersByEmail([String(victim.email)]);

    const sameEmail = await signup(body({ email: victim.email }), "203.0.113.8");
    expect(sameEmail).toEqual({ status: 409, json: { error: "email_taken" } });
    const samePhone = await signup(
      body({ phone: victim.phone, email: randomEmail("saldirgan") }),
      "203.0.113.8",
    );
    expect(samePhone).toEqual({ status: 409, json: { error: "phone_registered" } });

    const kept = await serviceClient().auth.admin.getUserById(account.id);
    expect(kept.data.user?.id).toBe(account.id);
    expect(kept.data.user?.phone).toBe(String(victim.phone).slice(1));
  });

  it("limits attempts per e-mail", async () => {
    const email = randomEmail("deneme-siniri");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      // A fresh phone and IP each time: only the e-mail repeats.
      const res = await signup(body({ email }), `203.0.113.${100 + i}`);
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 409, 409, 409, 409, 429]);
  });

  it("an e-mail of another account is taken", async () => {
    const res = await signup(body({ email: "owner@example.com" }), "203.0.113.4");
    expect(res).toEqual({ status: 409, json: { error: "email_taken" } });
  });

  it("a phone in another customer's profile is registered", async () => {
    // The seed owner's profile phone; the owner signs in with e-mail.
    const res = await signup(body({ phone: "+905550000001" }), "203.0.113.5");
    expect(res).toEqual({ status: 409, json: { error: "phone_registered" } });
  });

  it("refuses bad input naming the field only", async () => {
    const res = await signup(body({ phone: "+15551234567" }), "203.0.113.6");
    expect(res).toEqual({ status: 400, json: { error: "invalid_input", field: "phone" } });
    expect(JSON.stringify(res.json)).not.toContain("5551234567");
    const consent = await signup(
      body({ consents: { kvkk_notice_version: "kvkk-v1-taslak" } }),
      "203.0.113.6",
    );
    expect(consent).toEqual({
      status: 400,
      json: { error: "invalid_input", field: "explicit_text_version" },
    });
    const action = await signup({ action: "nope" }, "203.0.113.6");
    expect(action.status).toBe(400);
  });

  it("limits attempts per IP", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      // A fresh phone and e-mail each time: only the IP repeats.
      const res = await signup(body(), "203.0.113.250");
      statuses.push(res.status);
      if (res.status === 429) {
        expect(res.json).toEqual({ error: "too_many_attempts" });
        break;
      }
    }
    expect(statuses.at(-1)).toBe(429);
    expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(10);
  });

  it("cleanup needs the cron secret and keeps fresh sign-ups", async () => {
    const input = body({ email: randomEmail("temizlik") });
    expect((await signup(input, "203.0.113.7")).status).toBe(200);

    const denied = await signup({ action: "cleanup" }, "203.0.113.7", {
      "x-orchados-cron-secret": "wrong",
    });
    expect(denied.status).toBe(401);
    const res = await signup({ action: "cleanup" }, "203.0.113.7", {
      "x-orchados-cron-secret": CRON_SECRET,
    });
    expect(res.status).toBe(200);
    expect(typeof res.json.deleted).toBe("number");
    // Younger than a day: kept.
    expect(await usersByEmail([String(input.email)])).toHaveLength(1);
  });
});
