import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { legacySignup, purgeBillingUsers, purgeSignupAttempts, signupReview } from "../local-db";
import { anonClient, SEED, serviceClient, signIn } from "./fixtures";
import {
  codes,
  complete,
  enterLatestCode,
  randomPhone,
  registerBody,
  sendCode,
  signupCall,
  userById,
} from "./signup-flow";

// Account takeover through self sign-up (docs/musteri-yonetimi.md §7.4): an
// attacker signs up with the victim's e-mail (or a phone they never verify).
// When ops later invites the victim, ops_find_user_id does not return the
// attacker's account, Auth refuses to open a second one with the same e-mail
// or phone (422) and invite-user answers 409 conflict: nothing gets linked.

const EMAIL_DOMAIN = "takeover-test.example.test";
const randomDigits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

async function selfSignup(email: string, phone: string, ip: string) {
  const res = await fetch(`${inject("supabase").url}/functions/v1/customer-signup`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-orchados-proxy-secret": "signup-proxy-local",
    },
    body: JSON.stringify({
      action: "register",
      full_name: "Saldırgan",
      phone,
      email,
      password: "parola-1234",
      contact_preference: "sms",
      consents: {
        kvkk_notice_version: LEGAL_TEXT_VERSIONS.kvkk_notice,
        explicit_text_version: "riza-v1-taslak",
        explicit_service_improvement: false,
        explicit_marketing: false,
      },
      client_ip: ip,
    }),
  });
  return res.status;
}

async function invite(payload: Record<string, string>) {
  const { client } = await signIn("ops");
  const token = (await client.auth.getSession()).data.session?.access_token;
  const res = await fetch(`${inject("supabase").url}/functions/v1/invite-user`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ org_id: SEED.org, ...payload }),
  });
  return { status: res.status, json: await res.json() };
}

async function cleanUp() {
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  const ids = data.users.filter((u) => u.email?.endsWith(`@${EMAIL_DOMAIN}`)).map((u) => u.id);
  if (ids.length) await purgeBillingUsers(ids);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
}

beforeAll(async () => {
  await cleanUp();
  await purgeSignupAttempts();
});
afterAll(cleanUp);

describe("account takeover through self sign-up", () => {
  it("ops inviting the victim's e-mail gets a conflict, not the attacker's account", async () => {
    const victim = `kurban-${randomDigits(8)}@${EMAIL_DOMAIN}`;
    expect(await selfSignup(victim, `+90555${randomDigits(7)}`, "203.0.113.20")).toBe(200);

    const res = await invite({ email: victim });
    expect(res).toEqual({ status: 409, json: { error: "conflict" } });

    const { client } = await signIn("ops");
    const found = await client.rpc("ops_find_user_id", { p_org_id: SEED.org, p_email: victim });
    expect(found.error).toBeNull();
    expect(found.data).toBeNull();
  });

  it("the same with the phone of an unverified self sign-up", async () => {
    const phone = `+90555${randomDigits(7)}`;
    expect(
      await selfSignup(`saldirgan-${randomDigits(8)}@${EMAIL_DOMAIN}`, phone, "203.0.113.21"),
    ).toBe(200);

    const res = await invite({ phone });
    expect(res).toEqual({ status: 409, json: { error: "conflict" } });
  });

  // docs/hukuk/kararlar.md H33: signing up with someone's verified phone or
  // e-mail answers like any sign-up and attaches nothing to their account.
  it("a sign-up with an existing account's phone or e-mail attaches nothing", async () => {
    const admin = serviceClient();
    const victimEmail = `sahip-${randomDigits(8)}@${EMAIL_DOMAIN}`;
    const victimPhone = `+90555${randomDigits(7)}`;
    const made = await admin.auth.admin.createUser({
      email: victimEmail,
      password: "kurban-parola-1",
      phone: victimPhone,
      email_confirm: true,
      phone_confirm: true,
    });
    expect(made.error).toBeNull();
    const attackerEmail = `saldirgan-${randomDigits(8)}@${EMAIL_DOMAIN}`;

    expect(await selfSignup(attackerEmail, victimPhone, "203.0.113.22")).toBe(200);
    expect(await selfSignup(victimEmail, `+90555${randomDigits(7)}`, "203.0.113.23")).toBe(409);

    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    expect(error).toBeNull();
    expect(data.users.filter((u) => u.email === attackerEmail)).toHaveLength(0);
    const victim = data.users.find((u) => u.id === made.data.user!.id);
    expect(victim?.email).toBe(victimEmail);
    expect(victim?.phone).toBe(victimPhone.slice(1));
    expect(victim?.app_metadata.signup).toBeUndefined();
  });
});

// Account pre-hijack (review of PR #93, both rounds): the attacker opens an
// account with the victim's phone and their own e-mail and password, hoping
// the victim confirms the phone on it. Whatever the victim does with their
// phone, they never end up signed in to it, and it never completes.
describe("account pre-hijack through the victim's phone", () => {
  const ATTACKER_PASSWORD = "saldirgan-1234";

  async function trap(ip: string) {
    const phone = randomPhone();
    const email = `saldirgan-${randomDigits(8)}@${EMAIL_DOMAIN}`;
    const res = await signupCall(registerBody({ phone, email, password: ATTACKER_PASSWORD }), ip);
    expect(res.status).toBe(200);
    const { data } = await serviceClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
    const id = data.users.find((u) => u.email === email)!.id;
    return { phone, email, ticket: String(res.json.ticket), id };
  }

  const attackerSession = async (email: string) =>
    (await anonClient().auth.signInWithPassword({ email, password: ATTACKER_PASSWORD })).data
      .session;

  // The original finding: the victim signs up with their phone and enters
  // the code that arrives.
  it("(i) the victim's sign-up never sends or accepts the attacker's code", async () => {
    const attack = await trap("203.0.113.24");
    const victimEmail = `kurban-${randomDigits(8)}@${EMAIL_DOMAIN}`;
    const victim = await signupCall(
      registerBody({ phone: attack.phone, email: victimEmail }),
      "203.0.113.25",
    );
    expect(victim.status).toBe(200);
    expect((await sendCode(anonClient(), attack.phone, String(victim.json.ticket)))?.code).toBe(
      "signup_disabled",
    );
    expect(await codes(attack.phone)).toEqual([]);

    // A code that reaches the phone anyway (the attacker's own code step) and
    // is entered on the victim's /kayit page: refused, the account deleted.
    expect(await sendCode(anonClient(), attack.phone, attack.ticket)).toBeNull();
    const session = await enterLatestCode(attack.phone);
    expect(await complete(session.token, String(victim.json.ticket))).toEqual({
      status: 403,
      json: { error: "signup_mismatch" },
    });
    expect(await userById(attack.id)).toBeNull();
    expect(await attackerSession(attack.email)).toBeNull();
  }, 30_000);

  it("(iii) phone login at /giris gets no code, and an entered code lands nowhere", async () => {
    const attack = await trap("203.0.113.26");
    // /giris: a login code for the number. The phone is not confirmed on any
    // account, so nothing goes out.
    const login = await anonClient().auth.signInWithOtp({
      phone: attack.phone,
      options: { shouldCreateUser: false, channel: "sms" },
    });
    expect(login.error).not.toBeNull();
    expect(await codes(attack.phone)).toEqual([]);

    // The attacker's code reaches the phone; the victim enters it at /giris,
    // which then lands on `/`: complete without a ticket.
    expect(await sendCode(anonClient(), attack.phone, attack.ticket)).toBeNull();
    const session = await enterLatestCode(attack.phone);
    expect(await complete(session.token, null)).toEqual({
      status: 403,
      json: { error: "signup_mismatch" },
    });
    expect(await userById(attack.id)).toBeNull();
  }, 30_000);

  it("(iii) an attacker sign-up written before tickets is quarantined, never completed", async () => {
    const attack = await trap("203.0.113.27");
    expect(await sendCode(anonClient(), attack.phone, attack.ticket)).toBeNull();
    // A pending sign-up the web wrote before tickets (deploy time): it
    // cannot be told from its registrant's, so it is not deleted; the phone
    // confirmation the victim's code made is cleared instead.
    await legacySignup(attack.id);
    const session = await enterLatestCode(attack.phone);
    expect(await complete(session.token, null)).toEqual({
      status: 403,
      json: { error: "signup_mismatch" },
    });
    const kept = await userById(attack.id);
    expect(kept?.phone_confirmed_at ?? null).toBeNull();
    expect(await signupReview(attack.id)).toBe("unproven_code");
    // The victim's session is gone and their phone login no longer reaches
    // the account.
    expect((await session.client.auth.refreshSession()).error).not.toBeNull();
    const again = await anonClient().auth.signInWithOtp({
      phone: attack.phone,
      options: { shouldCreateUser: false, channel: "sms" },
    });
    expect(again.error).not.toBeNull();

    // The attacker's password session has no phone code: complete refuses.
    const own = await attackerSession(attack.email);
    expect(own).not.toBeNull();
    expect(await complete(own!.access_token, null)).toEqual({
      status: 403,
      json: { error: "phone_not_verified" },
    });
  }, 30_000);
});
