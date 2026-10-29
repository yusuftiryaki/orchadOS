import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { altchaPayload, isAltchaChallenge, solveAltcha } from "@/lib/site/altcha-solver";
import { jwtClaims } from "../../../../supabase/functions/_shared/signup";
import {
  ageDemoSessions,
  purgeDemoAttempts,
  purgeOrg,
  registerDemoOrg,
  runDemoHousekeeping,
} from "../local-db";
import { anonClient, SEED, serviceClient, signIn } from "./fixtures";

// The demo-start Edge Function against the local stack (docs/demo-turu.md §7,
// §14): a visitor account reads a registered demo parcel and nothing else,
// writes nothing, cannot change its account, is refused by the service-role
// Edge paths, is rate limited per IP bucket and is deleted by cleanup.
// ORCHADOS_DEMO_MODE is "dev" locally (supabase/config.toml), without a
// Turnstile secret. Client IPs are TEST-NET (198.51.100.x) and documentation
// IPv6 (2001:db8::/32) addresses, sent with the proxy secret.

const PROXY_SECRET = "signup-proxy-local";
const CRON_SECRET = "cron-local";

const DEMO = {
  org: "d1500000-0000-4000-8000-000000000001",
  parcel: "d1510000-0000-4000-8000-000000000001",
  session: "d1520000-0000-4000-8000-000000000001",
} as const;

const randomDigits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

interface StartResult {
  status: number;
  json: Record<string, unknown>;
}

async function callDemo(
  payload: Record<string, unknown>,
  headers: Record<string, string> = { "x-orchados-proxy-secret": PROXY_SECRET },
): Promise<StartResult> {
  const res = await fetch(`${inject("supabase").url}/functions/v1/demo-start`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  return { status: res.status, json: await res.json() };
}

const start = (ip: string) => callDemo({ action: "start", client_ip: ip });

async function callFunction(name: string, token: string, payload: Record<string, unknown>) {
  const res = await fetch(`${inject("supabase").url}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: inject("supabase").anonKey,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return { status: res.status, json: await res.json() };
}

// A visitor's browser: exchanges the hashed token for its own session.
async function visitor(result: StartResult) {
  const client = anonClient();
  const { data, error } = await client.auth.verifyOtp({
    token_hash: String(result.json.token_hash),
    type: result.json.verification_type as "magiclink",
  });
  if (error) throw error;
  const token = data.session!.access_token;
  return { client, token, userId: data.user!.id };
}

// Every account with access to the fixture parcel (visitors of this file).
async function fixtureAccountIds(): Promise<string[]> {
  const { data, error } = await serviceClient()
    .from("parcel_access")
    .select("user_id")
    .eq("parcel_id", DEMO.parcel);
  if (error) throw error;
  return data.map((row) => row.user_id);
}

const created = new Set<string>();

async function deleteAccounts() {
  const admin = serviceClient().auth.admin;
  for (const id of new Set([...created, ...(await fixtureAccountIds())])) {
    const { error } = await admin.deleteUser(id);
    if (error && error.status !== 404) throw error;
  }
  created.clear();
}

let previousDemoOrg: string | null = null;

beforeAll(async () => {
  await deleteAccounts();
  await purgeOrg(DEMO.org);
  const admin = serviceClient();
  const check = <T extends { error: unknown }>(r: T) => {
    if (r.error) throw r.error;
    return r;
  };
  check(await admin.from("org").insert({ id: DEMO.org, name: "Demo (test)", kind: "other" }));
  check(
    await admin.from("parcel").insert({ id: DEMO.parcel, org_id: DEMO.org, name: "Demo Kuzey" }),
  );
  check(
    await admin.from("session").insert({
      id: DEMO.session,
      org_id: DEMO.org,
      parcel_id: DEMO.parcel,
      kind: "periodic_scan",
      status: "published",
      started_at: "2026-07-14T07:00:00Z",
    }),
  );
  previousDemoOrg = await registerDemoOrg(DEMO.org, [DEMO.parcel], {
    tour: { parcel_id: DEMO.parcel, session_id: DEMO.session },
  });
  await purgeDemoAttempts();
});

afterAll(async () => {
  await deleteAccounts();
  await purgeOrg(DEMO.org);
  if (previousDemoOrg && previousDemoOrg !== DEMO.org) await registerDemoOrg(previousDemoOrg, null);
  await purgeDemoAttempts();
});

describe("demo-start", () => {
  let demo: Awaited<ReturnType<typeof visitor>>;
  let email: string;
  const triedPhone = `+90555${randomDigits(7)}`;
  const triedEmail = `demo-squat-${randomDigits(8)}@demo-test.example.test`;

  it("start opens a demo account whose session carries app_metadata.demo", async () => {
    const result = await start("198.51.100.1");
    expect(result.status).toBe(200);
    expect(Object.keys(result.json).sort()).toEqual([
      "expires_at",
      "next",
      "token_hash",
      "verification_type",
    ]);
    expect(result.json.next).toBe("/portal?tur=bahceler");
    expect(Date.parse(String(result.json.expires_at)) - Date.now()).toBeGreaterThan(2.9 * 3600e3);

    demo = await visitor(result);
    created.add(demo.userId);
    const claims = jwtClaims(demo.token);
    expect((claims?.app_metadata as Record<string, unknown>).demo).toBe(true);

    const { data } = await serviceClient().auth.admin.getUserById(demo.userId);
    email = data.user!.email!;
    expect(email).toMatch(/^ziyaretci-[0-9a-f-]{36}@demo\.orchados\.invalid$/);
    expect(data.user!.phone ?? "").toBe("");
  });

  it("the visitor reads the published demo data and the tour", async () => {
    const sessions = await demo.client.from("session").select("id, status");
    expect(sessions.error).toBeNull();
    expect(sessions.data).toEqual([{ id: DEMO.session, status: "published" }]);
    const parcels = await demo.client.from("parcel").select("id");
    expect(parcels.data).toEqual([{ id: DEMO.parcel }]);

    const info = await demo.client.rpc("demo_info");
    expect(info.error).toBeNull();
    expect(info.data).toMatchObject({
      org_id: DEMO.org,
      tour: { parcel_id: DEMO.parcel, session_id: DEMO.session },
      parcels: [{ id: DEMO.parcel, name: "Demo Kuzey" }],
    });
  });

  it("the visitor writes nothing", async () => {
    const question = await demo.client
      .from("question")
      .insert({ parcel_id: DEMO.parcel, tree_id: crypto.randomUUID(), body: "Demo soru" } as never);
    expect(question.error?.message).toBe("demo_read_only");
    const invite = await demo.client.rpc("owner_invite_viewer", {
      p_parcel_id: DEMO.parcel,
      p_full_name: "Hisse",
      p_phone: triedPhone,
    });
    expect(invite.error?.message).toBe("demo_read_only");
  });

  it("the visitor cannot change its phone, e-mail, password or metadata", async () => {
    const before = (await serviceClient().auth.admin.getUserById(demo.userId)).data.user!;
    const attempts = [
      await demo.client.auth.updateUser({ phone: triedPhone }),
      await demo.client.auth.updateUser({ email: triedEmail }),
      await demo.client.auth.updateUser({ password: "demo-parola-1234" }),
      await demo.client.auth.updateUser({ data: { x: 1 } }),
    ];
    for (const attempt of attempts) expect(attempt.error).not.toBeNull();

    const after = (await serviceClient().auth.admin.getUserById(demo.userId)).data.user!;
    expect(after.phone ?? "").toBe("");
    expect(after.email).toBe(before.email);
    expect(after.new_email ?? null).toBeNull();
    expect(after.user_metadata).toEqual(before.user_metadata);
    const login = await anonClient().auth.signInWithPassword({
      email,
      password: "demo-parola-1234",
    });
    expect(login.error).not.toBeNull();

    const outbox = await serviceClient().rpc("message_outbox_list", { p_recipient: triedPhone });
    expect(outbox.error).toBeNull();
    expect(outbox.data).toEqual([]);
  });

  it("invite-user never links the demo account", async () => {
    const ops = await signIn("ops");
    const token = (await ops.client.auth.getSession()).data.session!.access_token;
    for (const input of [{ phone: triedPhone }, { email: triedEmail }]) {
      const res = await callFunction("invite-user", token, { org_id: SEED.org, ...input });
      expect([200, 409]).toContain(res.status);
      if (res.status === 200) {
        expect(res.json.user_id).not.toBe(demo.userId);
        expect(res.json.created).toBe(true);
        created.add(String(res.json.user_id));
      }
    }
  });

  it.each([
    ["customer-signup", { action: "complete" }],
    ["payments", { action: "start", order_id: crypto.randomUUID() }],
    ["invite-user", { org_id: SEED.org, email: "demo-invite@demo-test.example.test" }],
  ])("%s refuses the demo token", async (name, payload) => {
    const res = await callFunction(name, demo.token, payload);
    expect(res).toEqual({ status: 403, json: { error: "demo_read_only" } });
  });

  it("limits starts per IP bucket; an IPv6 /64 is one bucket", async () => {
    await purgeDemoAttempts();
    for (let i = 0; i < 10; i++) expect((await start("198.51.100.20")).status).toBe(200);
    expect(await start("198.51.100.20")).toEqual({ status: 429, json: { error: "rate_limited" } });
    expect((await start("198.51.100.21")).status).toBe(200);

    for (let i = 0; i < 10; i++) {
      const ip = i % 2 === 0 ? "2001:db8:13:1::1" : "2001:db8:13:1:ffff:ffff:ffff:fffe";
      expect((await start(ip)).status).toBe(200);
    }
    expect((await start("2001:db8:13:1::abcd")).status).toBe(429);
    expect((await start("2001:db8:13:2::1")).status).toBe(200);
  });

  it("without the proxy secret client_ip is ignored", async () => {
    // The exhausted bucket of the previous test, but without (or with a
    // wrong) proxy secret: the request's own address counts instead.
    expect((await callDemo({ action: "start", client_ip: "198.51.100.20" }, {})).status).toBe(200);
    expect(
      (
        await callDemo(
          { action: "start", client_ip: "198.51.100.20" },
          { "x-orchados-proxy-secret": "wrong" },
        )
      ).status,
    ).toBe(200);
  });

  it("a disabled demo org is closed", async () => {
    await registerDemoOrg(DEMO.org, [DEMO.parcel], { enabled: false });
    try {
      expect(await start("198.51.100.30")).toEqual({ status: 503, json: { error: "demo_closed" } });
    } finally {
      await registerDemoOrg(DEMO.org, [DEMO.parcel], {
        tour: { parcel_id: DEMO.parcel, session_id: DEMO.session },
      });
    }
  });

  // The self-hosted robot check (docs/hukuk/kararlar.md H03, T12): locally
  // CAPTCHA_PROVIDER=altcha in dev mode checks a token when one is sent.
  it("checks a sent self-hosted robot check token and refuses its replay", async () => {
    const challenge = await callDemo({ action: "challenge" }, {});
    expect(challenge.status).toBe(200);
    if (!isAltchaChallenge(challenge.json)) throw new Error("not a challenge");
    const token = altchaPayload(challenge.json, (await solveAltcha(challenge.json))!);

    const ok = await callDemo({
      action: "start",
      client_ip: "198.51.100.40",
      captcha_token: token,
    });
    expect(ok.status).toBe(200);
    const { data } = await anonClient().auth.verifyOtp({
      token_hash: String(ok.json.token_hash),
      type: ok.json.verification_type as "magiclink",
    });
    created.add(data.user!.id);

    const replay = await callDemo({
      action: "start",
      client_ip: "198.51.100.41",
      captcha_token: token,
    });
    expect(replay).toEqual({ status: 400, json: { error: "captcha_failed" } });
    const garbage = await callDemo({
      action: "start",
      client_ip: "198.51.100.41",
      captcha_token: "garbage",
    });
    expect(garbage).toEqual({ status: 400, json: { error: "captcha_failed" } });
  });

  it("rejects bad input", async () => {
    expect(await callDemo({ action: "register" })).toEqual({
      status: 400,
      json: { error: "invalid_input", field: "action" },
    });
    expect(await callDemo({ action: "start", client_ip: "x y" })).toEqual({
      status: 400,
      json: { error: "invalid_input", field: "client_ip" },
    });
  });

  it("expired accounts lose access, then cleanup deletes them", async () => {
    await ageDemoSessions([demo.userId], 4 * 60);
    await runDemoHousekeeping();
    const access = await serviceClient()
      .from("parcel_access")
      .select("id")
      .eq("user_id", demo.userId);
    expect(access.data).toEqual([]);
    expect((await demo.client.from("session").select("id")).data).toEqual([]);

    expect(await callDemo({ action: "cleanup" }, { "x-orchados-cron-secret": "wrong" })).toEqual({
      status: 401,
      json: { error: "unauthorized" },
    });

    const cleanup = await callDemo(
      { action: "cleanup" },
      { "x-orchados-cron-secret": CRON_SECRET },
    );
    expect(cleanup.status).toBe(200);
    expect(Number(cleanup.json.deleted)).toBeGreaterThanOrEqual(1);
    expect(cleanup.json.failed).toBe(0);
    expect(typeof cleanup.json.skipped).toBe("number");
    const gone = await serviceClient().auth.admin.getUserById(demo.userId);
    expect(gone.data.user).toBeNull();
  });
});
