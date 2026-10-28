import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { POST } from "@/app/sistem/sozlesme-tarama/route";
import { acceptedTexts } from "@/lib/contracts/display-hash";
import { generateAfterAcceptance } from "@/lib/contracts/generate";
import { quoteContractInput } from "@/lib/contracts/load";
import { distanceContractDocument, preInformationDocument } from "@/lib/contracts/render";
import type { StoreEnv } from "@/lib/contracts/store";
import { runSweep } from "@/lib/contracts/sweep";
import { resolveSupabaseEnv } from "../local-supabase";
import {
  check,
  createCustomer,
  orderFor,
  payByTransfer,
  removeCustomers,
  type TestCustomer,
} from "./billing-fixture";
import { serviceClient, signIn } from "./fixtures";

// The automatic contract-document sweep (T04, docs/hukuk/kararlar.md H12)
// against the local stack: an order nobody visits after its payment gets its
// withdrawal confirmation from the sweep (ticket, snapshot read with the anon
// key, rendering here, the Edge Function's system mode); the dispatcher is a
// no-op without its Vault secrets; the route checks the cron secret.

const DOMAIN = "contract-sweep.example.test";
const admin = serviceClient();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const testing = createClient<any, "testing">(resolveSupabaseEnv().url, resolveSupabaseEnv().serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "testing" },
});

let env: StoreEnv;
let customer: TestCustomer;
let order: string;
let quote: string;

beforeAll(async () => {
  const supabase = inject("supabase");
  env = { url: supabase.url, anonKey: supabase.anonKey, proxySecret: "signup-proxy-local" };
  await removeCustomers(DOMAIN);
  await testing.rpc("purge_contract_sweep_tickets");
  customer = await createCustomer(DOMAIN);
  ({ order, quote } = await orderFor(customer));
  // The acceptance renders both acceptance documents (wave 2).
  const shown = await quoteContractInput(customer.client, customer.id, quote);
  if (!shown) throw new Error("quote not readable");
  const accepted = await generateAfterAcceptance({
    accessToken: customer.token,
    orderId: order,
    shown,
    texts: acceptedTexts(preInformationDocument(shown), distanceContractDocument(shown)),
    env,
  });
  expect(accepted?.created.sort()).toEqual(["distance_sales", "pre_information"]);
  // Paid; nobody opens the order page or Sözleşmelerim afterwards.
  await payByTransfer(order);
  check(await testing.rpc("age_order_acceptance", { p_order_id: order, p_minutes: 60 }));
});

afterAll(async () => {
  await testing.rpc("purge_contract_sweep_tickets");
  await removeCustomers(DOMAIN);
});

async function kinds(): Promise<string[]> {
  const { client: ops } = await signIn("ops");
  return check(await ops.rpc("ops_contract_documents", { p_order_id: order }))
    .map((d) => d.kind)
    .sort();
}

describe("contract document sweep", () => {
  it("does nothing without its Vault secrets", async () => {
    const { data, error } = await testing.rpc("dispatch_contract_document_sweep");
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it("picks the paid order whose withdrawal confirmation is missing", async () => {
    const { data } = await testing.rpc("contract_sweep_candidates");
    expect(data).toContain(order);
  });

  it("fills the missing document through the system mode, once", async () => {
    const ticket = check(await testing.rpc("issue_contract_sweep_ticket", { p_order_ids: [order] })) as string;
    const first = await runSweep(ticket, { env });
    expect(first).toMatchObject({ orders: 1, created: 1, failed: 0, manualCopy: 0 });
    expect(await kinds()).toEqual(["distance_sales", "pre_information", "withdrawal_confirmation"]);
    const { data } = await testing.rpc("contract_sweep_candidates");
    expect(data ?? []).not.toContain(order);
    // The withdrawal confirmation of the sweep is the order's own (a PDF).
    const doc = check(
      await (await signIn("ops")).client.rpc("ops_contract_documents", { p_order_id: order }),
    ).find((d) => d.kind === "withdrawal_confirmation")!;
    const file = await admin.storage.from("contract-documents").download(doc.storage_path);
    const bytes = new Uint8Array(await file.data!.arrayBuffer());
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
  });

  it("reads nothing with an unknown ticket", async () => {
    expect(await runSweep("0".repeat(64), { env })).toMatchObject({ orders: 0, created: 0 });
  });

  it("the route refuses a missing or wrong cron secret and a bad ticket", async () => {
    const post = (headers: Record<string, string>, body: unknown) =>
      POST(
        new NextRequest("http://localhost/sistem/sozlesme-tarama", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify(body),
        }),
      );
    const saved = process.env.ORCHADOS_CRON_SECRET;
    try {
      delete process.env.ORCHADOS_CRON_SECRET;
      expect((await post({}, { ticket: "0".repeat(64) })).status).toBe(503);
      process.env.ORCHADOS_CRON_SECRET = "cron-sweep-test";
      expect((await post({ "x-orchados-cron-secret": "wrong" }, { ticket: "0".repeat(64) })).status).toBe(
        401,
      );
      const bad = await post({ "x-orchados-cron-secret": "cron-sweep-test" }, { ticket: "x" });
      expect(bad.status).toBe(400);
      expect(await bad.json()).toEqual({ error: "invalid_input" });
    } finally {
      if (saved === undefined) delete process.env.ORCHADOS_CRON_SECRET;
      else process.env.ORCHADOS_CRON_SECRET = saved;
    }
  });
});
