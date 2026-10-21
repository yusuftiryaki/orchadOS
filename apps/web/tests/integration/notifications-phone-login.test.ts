import { afterAll, describe, expect, inject, it } from "vitest";
import { anonClient, SEED, serviceClient, signIn } from "./fixtures";

// Phone (SMS code) login against the local stack. Supabase Auth hands the code
// to the send-sms hook, whose record provider keeps it in the outbox instead of
// sending an SMS; the test reads it from there and completes the sign-in.

const randomPhone = () => `+90555${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
const INVITED = randomPhone();
const UNINVITED = randomPhone();
const created: string[] = [];

async function latestCode(phone: string): Promise<string | null> {
  const { data, error } = await serviceClient().rpc("message_outbox_list", {
    p_recipient: phone,
    p_limit: 1,
  });
  if (error) throw error;
  const body = data?.[0]?.purpose === "login_code" ? data[0].body : "";
  return /\b(\d{6})\b/.exec(body)?.[1] ?? null;
}

afterAll(async () => {
  const admin = serviceClient();
  for (const id of created) await admin.auth.admin.deleteUser(id);
});

describe("phone login", () => {
  it("an account opened by ops with only a phone signs in with the SMS code", async () => {
    // invite-user, as the operations screens call it.
    const { client: ops } = await signIn("ops");
    const token = (await ops.auth.getSession()).data.session?.access_token;
    const res = await fetch(`${inject("supabase").url}/functions/v1/invite-user`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ org_id: SEED.org, phone: INVITED }),
    });
    expect(res.status).toBe(200);
    const invited = await res.json();
    expect(invited).toMatchObject({ created: true, one_time_password: null });
    created.push(invited.user_id);

    const client = anonClient();
    const sent = await client.auth.signInWithOtp({
      phone: INVITED,
      options: { shouldCreateUser: false },
    });
    expect(sent.error).toBeNull();
    const code = await latestCode(INVITED);
    expect(code).toMatch(/^\d{6}$/);

    const wrong = await client.auth.verifyOtp({
      phone: INVITED,
      token: code === "000000" ? "111111" : "000000",
      type: "sms",
    });
    expect(wrong.error).not.toBeNull();

    const { data, error } = await client.auth.verifyOtp({
      phone: INVITED,
      token: code!,
      type: "sms",
    });
    expect(error).toBeNull();
    expect(data.user?.id).toBe(invited.user_id);
    expect((await client.auth.getUser()).data.user?.phone).toBe(INVITED.slice(1));
  });

  it("asking again within a minute is refused", async () => {
    const again = await anonClient().auth.signInWithOtp({
      phone: INVITED,
      options: { shouldCreateUser: false },
    });
    expect(again.error?.code).toBe("over_sms_send_rate_limit");
  });

  it("an uninvited number gets no code and no account", async () => {
    const client = anonClient();
    const { error } = await client.auth.signInWithOtp({
      phone: UNINVITED,
      options: { shouldCreateUser: false },
    });
    expect(error).not.toBeNull();
    // Even when the client asks Auth to create the user: sign-ups are off.
    const signup = await client.auth.signInWithOtp({ phone: UNINVITED });
    expect(signup.error).not.toBeNull();
    expect(await latestCode(UNINVITED)).toBeNull();

    const verify = await client.auth.verifyOtp({ phone: UNINVITED, token: "123456", type: "sms" });
    expect(verify.error).not.toBeNull();
    expect(verify.data.session).toBeNull();
  });

  it("five wrong codes lock the number, and the hook then sends nothing", async () => {
    const admin = serviceClient();
    const phone = randomPhone();
    const user = await admin.auth.admin.createUser({ phone, phone_confirm: true });
    if (user.error) throw user.error;
    created.push(user.data.user.id);

    const client = anonClient();
    for (let i = 0; i < 5; i++) await client.rpc("phone_login_record_failure", { p_phone: phone });
    expect((await client.rpc("phone_login_allowed", { p_phone: phone })).data).toBe(false);

    const { error } = await client.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false },
    });
    expect(error?.message).toBe("phone_locked");
    expect(await latestCode(phone)).toBeNull();
  });
});
