import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { purgeBillingUsers, purgeSignupAttempts } from "../local-db";
import { SEED, serviceClient, signIn } from "./fixtures";

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
