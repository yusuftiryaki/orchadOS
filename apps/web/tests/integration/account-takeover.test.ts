import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  ageSignups,
  agePhoneConfirmation,
  legacySignup,
  purgeBillingUsers,
  purgeSignupAttempts,
  runSignupHousekeeping,
  setSelfSignup,
  signupReview,
} from "../local-db";
import { anonClient, SEED, serviceClient, signIn } from "./fixtures";
import {
  codes,
  complete,
  enterLatestCode,
  randomPhone,
  registerBody,
  sendCode,
  sendConfirmation,
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
    // The victim's ticket is unstored (the phone was taken): send_code
    // answers like any other and sends nothing.
    expect(await sendCode(anonClient(), attack.phone, String(victim.json.ticket))).toBeNull();
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

// Auth hardening after PR #93 (docs/gorevler/auth-sertlestirme.md): the
// takeover paths that existed before it. Each test is the attack, and the
// assertion that it is blocked.
describe("auth hardening: remaining account-takeover paths", () => {
  const PASSWORD = "musteri-1234";

  // A self sign-up through the web's whole flow, completed.
  async function customer(ip: string) {
    const phone = randomPhone();
    const email = `musteri-${randomDigits(8)}@${EMAIL_DOMAIN}`;
    const res = await signupCall(registerBody({ phone, email, password: PASSWORD }), ip);
    expect(res.status).toBe(200);
    expect(await sendCode(anonClient(), phone, String(res.json.ticket))).toBeNull();
    const session = await enterLatestCode(phone);
    expect(await complete(session.token, String(res.json.ticket))).toEqual({
      status: 200,
      json: { status: "completed" },
    });
    return { phone, email, id: session.userId, client: session.client };
  }

  // Item 1: locally Auth applies a phone change without any code
  // (enable_confirmations = false); hosted, its code went to the current
  // phone. Either way the account held a confirmed phone it does not own.
  it("a completed customer cannot end up with a different confirmed phone", async () => {
    const own = await customer("203.0.113.30");
    const victimPhone = randomPhone();
    const changed = await own.client.auth.updateUser({ phone: victimPhone });
    expect(changed.error).not.toBeNull();
    const after = await userById(own.id);
    expect(after?.phone).toBe(own.phone.slice(1));
    expect(after?.new_phone ?? null).toBeNull();
    expect(await codes(victimPhone)).toEqual([]);
    expect(await codes(own.phone)).toHaveLength(1);
    // The victim's phone login reaches no account.
    const login = await anonClient().auth.signInWithOtp({
      phone: victimPhone,
      options: { shouldCreateUser: false, channel: "sms" },
    });
    expect(login.error).not.toBeNull();
  }, 30_000);

  it("an invited owner cannot change their phone through Auth either", async () => {
    const { client } = await signIn("owner");
    const before = (await client.auth.getUser()).data.user;
    const changed = await client.auth.updateUser({ phone: randomPhone() });
    expect(changed.error).not.toBeNull();
    expect((await userById(before!.id))?.phone).toBe(before!.phone);
  });

  // The Send SMS hook called with the payload GoTrue v2.197 (pinned) builds
  // in sendPhoneConfirmation: the user as Auth stores it, with the pending
  // number already in new_phone for a phone change, and sms { otp, phone }
  // where phone is the destination. There is no sms.sms_type.
  async function hook(userId: string, destination: string, otp: string, newPhone?: string) {
    const stored = await userById(userId);
    expect(stored).not.toBeNull();
    const user = { ...stored!, ...(newPhone ? { new_phone: newPhone.slice(1) } : {}) };
    const sms = { otp, phone: destination.slice(1) };
    const body = JSON.stringify({ metadata: { name: "send-sms" }, user, sms });
    const id = `msg_${randomDigits(12)}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const key = Buffer.from("p0oE1FH7E5tlPpCmuVnDZv5oL5cKXPNnx86jQcdd5HY=", "base64");
    const signature = createHmac("sha256", key)
      .update(`${id}.${timestamp}.${body}`)
      .digest("base64");
    const res = await fetch(`${inject("supabase").url}/functions/v1/send-sms`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${signature}`,
      },
      body,
    });
    return { status: res.status, json: await res.json() };
  }

  // A staff account (a role in the seed org), signed in with its password.
  async function staffAccount() {
    const admin = serviceClient();
    const phone = randomPhone();
    const email = `personel-${randomDigits(8)}@${EMAIL_DOMAIN}`;
    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      phone,
      phone_confirm: true,
      email_confirm: true,
    });
    expect(created.error).toBeNull();
    const id = created.data.user!.id;
    const member = await admin
      .from("membership")
      .insert({ org_id: SEED.org, user_id: id, role: "field_staff" });
    expect(member.error).toBeNull();
    const client = anonClient();
    expect((await client.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
    return { id, phone, client };
  }

  it("a phone change code goes to the new number, and only for staff", async () => {
    const staff = await staffAccount();
    const newPhone = randomPhone();
    expect(await hook(staff.id, newPhone, "123456", newPhone)).toEqual({ status: 200, json: {} });
    expect(await codes(newPhone)).toEqual(["123456"]);
    expect(await codes(staff.phone)).toEqual([]);

    // A login code (no pending change) goes to the current phone as before.
    expect(await hook(staff.id, staff.phone, "234567")).toEqual({ status: 200, json: {} });
    expect(await codes(staff.phone)).toEqual(["234567"]);

    // A customer gets no phone change code at all.
    const own = await customer("203.0.113.31");
    const otherPhone = randomPhone();
    expect(await hook(own.id, otherPhone, "654321", otherPhone)).toEqual({
      status: 200,
      json: { error: { http_code: 403, message: "phone_change_not_allowed" } },
    });
    expect(await codes(otherPhone)).toEqual([]);
    expect(await codes(own.phone)).toHaveLength(1);

    // Neither does an account without a role or parcels.
    const plainPhone = randomPhone();
    const plain = await serviceClient().auth.admin.createUser({
      email: `hesap-${randomDigits(8)}@${EMAIL_DOMAIN}`,
      phone: plainPhone,
      phone_confirm: true,
      email_confirm: true,
    });
    expect(plain.error).toBeNull();
    expect(await hook(plain.data.user!.id, otherPhone, "345678", otherPhone)).toEqual({
      status: 200,
      json: { error: { http_code: 403, message: "phone_change_not_allowed" } },
    });
    expect(await codes(otherPhone)).toEqual([]);
    expect(await codes(plainPhone)).toEqual([]);
  }, 30_000);

  // A staff account confirming a customer's number would make
  // ops_find_user_id return it, and invite-user would hand the customer's
  // parcels to staff.
  it("staff cannot take over a customer's number through ops_find_user_id and invite-user", async () => {
    const staff = await staffAccount();
    const victimPhone = randomPhone();

    // Locally Auth applies a phone change without a code (enable_confirmations
    // = false): the trigger refuses it.
    const changed = await staff.client.auth.updateUser({ phone: victimPhone });
    expect(changed.error).not.toBeNull();
    const after = await userById(staff.id);
    expect(after?.phone).toBe(staff.phone.slice(1));
    expect(after?.new_phone ?? null).toBeNull();
    // Hosted (confirmations on), the code goes to the victim, not to staff.
    expect(await hook(staff.id, victimPhone, "456789", victimPhone)).toEqual({
      status: 200,
      json: {},
    });
    expect(await codes(victimPhone)).toEqual(["456789"]);
    expect(await codes(staff.phone)).toEqual([]);

    const { client: ops } = await signIn("ops");
    const found = await ops.rpc("ops_find_user_id", { p_org_id: SEED.org, p_phone: victimPhone });
    expect(found.error).toBeNull();
    expect(found.data).toBeNull();
    const invited = await invite({ phone: victimPhone });
    expect(invited.status).toBe(200);
    expect(invited.json.created).toBe(true);
    expect(invited.json.user_id).not.toBe(staff.id);
    await serviceClient().auth.admin.deleteUser(String(invited.json.user_id));
  }, 30_000);

  // Item 2: GoTrue records an e-mail code or magic link as amr "otp", the
  // same as a phone code.
  it("a self sign-up gets no e-mail login code or magic link", async () => {
    const phone = randomPhone();
    const email = `eposta-${randomDigits(8)}@${EMAIL_DOMAIN}`;
    expect((await signupCall(registerBody({ phone, email }), "203.0.113.32")).status).toBe(200);
    const otp = await anonClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    expect(otp.error).not.toBeNull();
    const link = await serviceClient().auth.admin.generateLink({ type: "magiclink", email });
    expect(link.error).not.toBeNull();
  });

  it("an e-mail-OTP session with a valid ticket gets phone_not_verified", async () => {
    // The attacker's sign-up with the victim's phone and their own e-mail.
    const phone = randomPhone();
    const email = `saldirgan-${randomDigits(8)}@${EMAIL_DOMAIN}`;
    const res = await signupCall(registerBody({ phone, email }), "203.0.113.33");
    expect(res.status).toBe(200);
    const ticket = String(res.json.ticket);
    expect(await sendCode(anonClient(), phone, ticket)).toBeNull();
    // The victim confirms the phone with the code that reached it.
    const victim = await enterLatestCode(phone);
    await agePhoneConfirmation(victim.userId, 1);
    // An e-mail code session on the same account (as on a project where the
    // trigger that refuses e-mail codes could not be installed).
    await setSelfSignup(victim.userId, false);
    const link = await serviceClient().auth.admin.generateLink({ type: "magiclink", email });
    await setSelfSignup(victim.userId, true);
    expect(link.error).toBeNull();
    const attacker = await anonClient().auth.verifyOtp({
      token_hash: link.data.properties!.hashed_token,
      type: "magiclink",
    });
    expect(attacker.error).toBeNull();
    expect(await complete(attacker.data.session!.access_token, ticket)).toEqual({
      status: 403,
      json: { error: "phone_not_verified" },
    });
    expect((await userById(victim.userId))?.app_metadata.signup).toBe("self");
  }, 30_000);

  // Item 3: the grant is service role only, and send_code rate limits it.
  it("nobody but customer-signup grants a code, and send_code is rate limited", async () => {
    const phone = randomPhone();
    const email = `izin-${randomDigits(8)}@${EMAIL_DOMAIN}`;
    const res = await signupCall(registerBody({ phone, email }), "203.0.113.34");
    const ticket = String(res.json.ticket);
    const grant = await anonClient().rpc("signup_code_grant", { p_phone: phone, p_ticket: ticket });
    expect(grant.error).not.toBeNull();

    expect(await sendConfirmation(phone, ticket)).toEqual({ status: 200, json: {} });
    expect(await codes(phone)).toHaveLength(1);
    // A minute later Auth's public resend still sends nothing: the marker
    // went with send_code's own request.
    const [account] = (
      await serviceClient().auth.admin.listUsers({ page: 1, perPage: 1000 })
    ).data.users.filter((u) => u.email === email);
    await agePhoneConfirmation(account.id, 2);
    expect((await anonClient().auth.resend({ type: "sms", phone })).error).toBeNull();
    expect(await codes(phone)).toHaveLength(1);
    // One a minute through send_code too, whatever Auth's own limit says.
    await agePhoneConfirmation(account.id, 2);
    expect(await sendConfirmation(phone, ticket)).toEqual({ status: 200, json: {} });
    expect(await codes(phone)).toHaveLength(2);
    expect(await sendConfirmation(phone, ticket)).toEqual({ status: 200, json: {} });
    expect(await codes(phone)).toHaveLength(2);
  }, 30_000);

  // Item 4: a quarantined sign-up older than a day stays for ops.
  it("housekeeping and cleanup keep a quarantined sign-up", async () => {
    const phone = randomPhone();
    const email = `karantina-${randomDigits(8)}@${EMAIL_DOMAIN}`;
    const res = await signupCall(registerBody({ phone, email }), "203.0.113.35");
    expect(await sendCode(anonClient(), phone, String(res.json.ticket))).toBeNull();
    const session = await enterLatestCode(phone);
    await legacySignup(session.userId);
    expect(await complete(session.token, null)).toEqual({
      status: 403,
      json: { error: "signup_mismatch" },
    });
    expect(await signupReview(session.userId)).toBe("unproven_code");
    await ageSignups([session.userId], 25 * 60);

    await runSignupHousekeeping();
    const cleanup = await signupCall({ action: "cleanup" }, "203.0.113.35", {
      "x-orchados-cron-secret": "cron-local",
    });
    expect(cleanup.status).toBe(200);
    expect(await userById(session.userId)).not.toBeNull();
    expect(await signupReview(session.userId)).toBe("unproven_code");
  }, 30_000);

  // Item 6 (accepted trade-off): Auth's public resend replaces the code of a
  // pending sign-up without sending one. The registrant's wrong codes do not
  // lock the number, and a new code from send_code finishes the sign-up.
  it("a public resend cannot lock a registrant out of their sign-up", async () => {
    const phone = randomPhone();
    const email = `dos-${randomDigits(8)}@${EMAIL_DOMAIN}`;
    const res = await signupCall(registerBody({ phone, email }), "203.0.113.36");
    const ticket = String(res.json.ticket);
    expect(await sendCode(anonClient(), phone, ticket)).toBeNull();
    const [account] = (
      await serviceClient().auth.admin.listUsers({ page: 1, perPage: 1000 })
    ).data.users.filter((u) => u.email === email);
    await agePhoneConfirmation(account.id, 2);
    expect((await anonClient().auth.resend({ type: "sms", phone })).error).toBeNull();

    const stale = (await codes(phone))[0];
    const browser = anonClient();
    for (let i = 0; i < 6; i++) {
      expect(
        (await browser.auth.verifyOtp({ phone, token: stale, type: "sms" })).error,
      ).not.toBeNull();
      const left = await browser.rpc("phone_login_record_failure", {
        p_phone: phone,
        p_ticket: ticket,
      });
      expect(left.data).toBe(5);
    }
    expect((await browser.rpc("phone_login_allowed", { p_phone: phone })).data).toBe(true);

    await agePhoneConfirmation(account.id, 2);
    expect(await sendCode(browser, phone, ticket)).toBeNull();
    const session = await enterLatestCode(phone, browser);
    expect(await complete(session.token, ticket)).toEqual({
      status: 200,
      json: { status: "completed" },
    });
  }, 40_000);
});
