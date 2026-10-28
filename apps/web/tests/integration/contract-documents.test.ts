import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { ensureOrderDocuments } from "@/lib/contracts/generate";
import { storeContractDocument, type StoreEnv } from "@/lib/contracts/store";
import type { Database } from "@/lib/database.types";
import { currentLegalTexts } from "@/lib/legal/text-hash";
import { sha256Hex } from "@/lib/legal/text-hash";
import { purgeOrg } from "../local-db";
import {
  check,
  createCustomer,
  orderFor,
  payByTransfer,
  removeCustomers,
  type TestCustomer,
} from "./billing-fixture";
import { PASSWORD, serviceClient, signIn } from "./fixtures";

// The order-specific contract documents end to end against the local stack
// (docs/musteri-yonetimi.md "Sözleşme belgeleri (T04)"): rendering on the
// "Next server" (this process), the contract-documents Edge Function in its
// customer, ops and system modes, the private bucket and the readers.

const DOMAIN = "contract-documents.example.test";
const OTHER_ORG = "f0000000-0000-4000-8000-0000000000c4";
const admin = serviceClient();
const BUCKET = "contract-documents";
const PDF = Buffer.from("%PDF-1.4\n% integration test\n");

let env: StoreEnv;
let customer: TestCustomer;
let stranger: TestCustomer;
let order: string;

const options = { auth: { persistSession: false, autoRefreshToken: false } };

async function tokenOf(email: string): Promise<string> {
  const client = createClient<Database>(
    inject("supabase").url,
    inject("supabase").anonKey,
    options,
  );
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return data.session.access_token;
}

async function opsToken(): Promise<string> {
  return tokenOf("ops@example.com");
}

function request(
  orderId: string,
  kind: "pre_information" | "distance_sales" | "withdrawal_confirmation",
) {
  const textKind = kind === "pre_information" ? "pre_information" : "distance_sales";
  const texts = currentLegalTexts();
  return {
    orderId,
    kind,
    textVersion: texts[textKind].version,
    textSha256: texts[textKind].sha256,
    generator: "integration-test",
    pdf: PDF,
  };
}

async function contractReadySms(orderId: string) {
  return check(
    await admin
      .from("notification")
      .select("id")
      .eq("ref_id", orderId)
      .eq("template", "contract_ready"),
  );
}

beforeAll(async () => {
  const supabase = inject("supabase");
  env = { url: supabase.url, anonKey: supabase.anonKey, proxySecret: "signup-proxy-local" };
  await removeCustomers(DOMAIN);
  await purgeOrg(OTHER_ORG).catch(() => undefined);
  customer = await createCustomer(DOMAIN);
  stranger = await createCustomer(DOMAIN);
  ({ order } = await orderFor(customer));
});

afterAll(async () => {
  await removeCustomers(DOMAIN);
  await purgeOrg(OTHER_ORG).catch(() => undefined);
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of data?.users ?? []) {
    if (u.email?.endsWith(`@ops.${DOMAIN}`)) await admin.auth.admin.deleteUser(u.id);
  }
});

describe("contract documents after an acceptance (customer mode)", () => {
  it("renders, stores and registers both acceptance documents and queues one SMS", async () => {
    const result = await ensureOrderDocuments(customer.client, "customer", order, {
      auth: { accessToken: customer.token },
      env,
    });
    expect(result.failed).toEqual([]);
    expect(result.created.sort()).toEqual(["distance_sales", "pre_information"]);

    const docs = check(await customer.client.rpc("my_contract_documents")).filter(
      (d) => d.order_id === order,
    );
    expect(docs.map((d) => d.kind).sort()).toEqual(["distance_sales", "pre_information"]);
    for (const doc of docs) {
      expect(doc.text_version).toBe(currentLegalTexts()[doc.kind as "pre_information"].version);
      const file = await customer.client.storage.from(BUCKET).download(doc.storage_path);
      expect(file.error).toBeNull();
      const bytes = new Uint8Array(await file.data!.arrayBuffer());
      expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
      expect(sha256Hex(bytes)).toBe(doc.sha256);
      expect(bytes.length).toBe(doc.size_bytes);
    }
    expect(await contractReadySms(order)).toHaveLength(1);
  });

  it("returns the existing documents on a second attempt and stores nothing new", async () => {
    const before = check(await customer.client.rpc("my_contract_documents"));
    const again = await ensureOrderDocuments(customer.client, "customer", order, {
      auth: { accessToken: customer.token },
      env,
    });
    expect(again.created).toEqual([]);
    expect(again.existing.sort()).toEqual(["distance_sales", "pre_information"]);
    // A direct upload of another PDF for an existing kind returns the existing one.
    const direct = await storeContractDocument(
      { accessToken: customer.token },
      request(order, "pre_information"),
      env,
    );
    expect(direct).toMatchObject({ ok: true, status: "existing" });
    expect(check(await customer.client.rpc("my_contract_documents"))).toEqual(before);
    expect(await contractReadySms(order)).toHaveLength(1);
  });

  it("refuses the withdrawal confirmation before the order is active", async () => {
    const res = await storeContractDocument(
      { accessToken: customer.token },
      request(order, "withdrawal_confirmation"),
      env,
    );
    expect(res).toMatchObject({ ok: false, status: 409, error: "order_not_active" });
  });

  it("another customer can neither read nor generate them", async () => {
    const [doc] = check(await customer.client.rpc("my_contract_documents")).filter(
      (d) => d.order_id === order,
    );
    const download = await stranger.client.storage.from(BUCKET).download(doc.storage_path);
    expect(download.error).not.toBeNull();
    expect(
      check(await stranger.client.rpc("my_contract_documents")).some((d) => d.order_id === order),
    ).toBe(false);
    const res = await storeContractDocument(
      { accessToken: stranger.token },
      request(order, "pre_information"),
      env,
    );
    expect(res).toMatchObject({ ok: false, status: 404 });
  });
});

describe("ops mode", () => {
  it("ops of the org generate the withdrawal confirmation once the order is active and read every document", async () => {
    await payByTransfer(order);
    const { client: ops } = await signIn("ops");
    const result = await ensureOrderDocuments(ops, "ops", order, {
      auth: { accessToken: await opsToken() },
      env,
    });
    expect(result.failed).toEqual([]);
    expect(result.created).toEqual(["withdrawal_confirmation"]);
    const docs = check(await ops.rpc("ops_contract_documents", { p_order_id: order }));
    expect(docs.map((d) => d.kind).sort()).toEqual([
      "distance_sales",
      "pre_information",
      "withdrawal_confirmation",
    ]);
    const confirmation = docs.find((d) => d.kind === "withdrawal_confirmation")!;
    expect(confirmation.text_version).toBe(currentLegalTexts().distance_sales.version);
    const file = await ops.storage.from(BUCKET).download(confirmation.storage_path);
    expect(file.error).toBeNull();
    // The customer sees it too, and the SMS stays one.
    expect(
      check(await customer.client.rpc("my_contract_documents")).filter((d) => d.order_id === order),
    ).toHaveLength(3);
    expect(await contractReadySms(order)).toHaveLength(1);
    // The order is no longer on the list of missing documents.
    const missing = check(await ops.rpc("ops_orders_missing_contract_documents"));
    expect(missing.some((m) => m.order_id === order)).toBe(false);
  });

  it("ops of another org can neither generate nor read them", async () => {
    check(
      await admin
        .from("org")
        .insert({ id: OTHER_ORG, name: "Başka işletme (sözleşme testi)", kind: "company" }),
    );
    const email = `ops-${Date.now()}@ops.${DOMAIN}`;
    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    check(
      await admin
        .from("membership")
        .insert({ org_id: OTHER_ORG, user_id: created.data.user.id, role: "ops" }),
    );
    const token = await tokenOf(email);
    const res = await storeContractDocument(
      { accessToken: token },
      request(order, "pre_information"),
      env,
    );
    expect(res).toMatchObject({ ok: false, status: 404 });
    const client = createClient<Database>(env.url, env.anonKey, options);
    await client.auth.signInWithPassword({ email, password: PASSWORD });
    const read = await client.rpc("ops_contract_documents", { p_order_id: order });
    expect(read.error).not.toBeNull();
    const [doc] = check(await customer.client.rpc("my_contract_documents"));
    expect((await client.storage.from(BUCKET).download(doc.storage_path)).error).not.toBeNull();
  });
});

describe("system mode (the wave-3 sweep)", () => {
  it("fills only missing documents", async () => {
    const { order: second } = await orderFor(customer);
    const sweep = { sweep: true } as const;
    const first = await storeContractDocument(sweep, request(second, "pre_information"), env);
    expect(first).toMatchObject({ ok: true, status: "created" });
    const again = await storeContractDocument(sweep, request(second, "pre_information"), env);
    expect(again).toMatchObject({ ok: true, status: "existing" });
    // Not active yet: no withdrawal confirmation.
    const early = await storeContractDocument(
      sweep,
      request(second, "withdrawal_confirmation"),
      env,
    );
    expect(early).toMatchObject({ ok: false, status: 409, error: "order_not_active" });
    // A version the order did not accept is refused before anything is stored.
    const wrong = await storeContractDocument(
      sweep,
      { ...request(second, "distance_sales"), textVersion: "mesafeli-v3-taslak" },
      env,
    );
    expect(wrong).toMatchObject({ ok: false, status: 409, error: "version_mismatch" });
    const row = check(await admin.from("service_order").select("org_id").eq("id", second).single());
    const listed = await admin.storage.from(BUCKET).list(`${row.org_id}/${second}`);
    expect((listed.data ?? []).map((o) => o.name)).toEqual(["pre_information.pdf"]);
  });

  it("is refused without the sweep marker", async () => {
    const res = await fetch(`${env.url}/functions/v1/contract-documents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: env.anonKey,
        authorization: `Bearer ${env.anonKey}`,
        "x-orchados-proxy-secret": env.proxySecret!,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});

describe("refusals", () => {
  it("refuses a caller without the proxy secret", async () => {
    const res = await storeContractDocument(
      { accessToken: customer.token },
      request(order, "pre_information"),
      { ...env, proxySecret: "wrong" },
    );
    expect(res).toMatchObject({ ok: false, status: 401 });
    const bare = await fetch(`${env.url}/functions/v1/contract-documents`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${customer.token}` },
      body: JSON.stringify({}),
    });
    expect(bare.status).toBe(401);
  });

  it("refuses the demo claim", async () => {
    const email = `demo-${Date.now()}@ops.${DOMAIN}`;
    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { demo: true },
    });
    if (created.error) throw created.error;
    const res = await storeContractDocument(
      { accessToken: await tokenOf(email) },
      request(order, "pre_information"),
      env,
    );
    expect(res).toMatchObject({ ok: false, status: 403, error: "demo_read_only" });
  });
});
