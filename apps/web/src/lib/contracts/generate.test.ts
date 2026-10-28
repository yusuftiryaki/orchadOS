import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { legalTextHash, sha256Hex } from "@/lib/legal/text-hash";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import type { Client } from "@/lib/supabase/types";
import { initialInput } from "./fixtures";
import { ensureOrderDocuments, SNAPSHOT_GRACE_MS } from "./generate";
import { acceptanceSnapshot, type AcceptanceSnapshot } from "./snapshot";
import type { StoreEnv } from "./store";

// ensureOrderDocuments with a fake client and a fake Edge Function: every
// rendering comes from the acceptance snapshot with the accepted versions,
// and an order that cannot be rendered is marked for a manual copy instead of
// being retried (the real stack: tests/integration/contract-documents.test.ts).

const ORDER = "55555555-5555-4555-8555-555555555555";
const ORG = "b0000000-0000-4000-8000-000000000001";
const ACCEPTED = "2026-10-28T09:00:00Z";
const env: StoreEnv = { url: "http://edge.test", anonKey: "anon", proxySecret: "secret" };
const auth = { accessToken: "token" };

const texts = () => ({
  pre_information: {
    version: LEGAL_TEXT_VERSIONS.pre_information,
    sha256: legalTextHash("pre_information"),
    display_sha256: "d".repeat(64),
  },
  distance_sales: {
    version: LEGAL_TEXT_VERSIONS.distance_sales,
    sha256: legalTextHash("distance_sales"),
    display_sha256: "e".repeat(64),
  },
});

const snapshotOf = (overrides: Partial<AcceptanceSnapshot["texts"]> = {}) =>
  acceptanceSnapshot(
    initialInput({ buyer: { ...initialInput().buyer, name: "Kabuldeki Ad" } }),
    { id: ORDER, number: "S-2026-000001", activatedAt: null, serviceStart: null, serviceEnd: null },
    ACCEPTED,
    { ...texts(), ...overrides },
  );

function fakeClient(folder: Record<string, Uint8Array>) {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "my_contract_documents" || fn === "ops_contract_documents") {
      return { data: [], error: null };
    }
    // Nothing else is read: no live buyer, company or garden.
    throw new Error(`unexpected rpc ${fn}`);
  });
  const client = {
    rpc,
    from(table: string) {
      if (table !== "service_order") throw new Error(`unexpected table ${table}`);
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({
          data: {
            id: ORDER,
            org_id: ORG,
            customer_user_id: "c",
            quote_id: "q",
            number: "S-2026-000001",
            activated_at: null,
            service_start: null,
            service_end: null,
            created_at: ACCEPTED,
          },
          error: null,
        }),
      };
      return chain;
    },
    storage: {
      from: () => ({
        list: async () => ({
          data: Object.keys(folder).map((name) => ({ name, created_at: ACCEPTED })),
          error: null,
        }),
        download: async (path: string) => ({
          data: new Blob([folder[path.split("/").pop()!] as BlobPart]),
          error: null,
        }),
      }),
    },
  };
  return client as unknown as Client;
}

function storedSnapshot(snapshot: AcceptanceSnapshot): Record<string, Uint8Array> {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  return { [`acceptance-${sha256Hex(bytes)}.json`]: bytes };
}

let posts: Record<string, unknown>[];
let answer: (body: Record<string, unknown>) => { status: number; body: unknown };

beforeEach(() => {
  posts = [];
  answer = (body) =>
    body.op
      ? { status: 200, body: { status: "created", object: { name: "manual-copy.json" } } }
      : { status: 200, body: { status: "created", document: { id: "doc" } } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push(body);
      const { status, body: out } = answer(body);
      return new Response(JSON.stringify(out), { status });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ensureOrderDocuments", () => {
  it("renders both documents from the snapshot with the accepted versions and hashes", async () => {
    const supabase = fakeClient(storedSnapshot(snapshotOf()));
    const result = await ensureOrderDocuments(supabase, "customer", ORDER, { auth, env });
    expect(result).toMatchObject({
      created: ["pre_information", "distance_sales"],
      failed: [],
      manualCopy: null,
    });
    expect(posts.map((p) => [p.kind, p.text_version, p.text_sha256])).toEqual([
      ["pre_information", LEGAL_TEXT_VERSIONS.pre_information, legalTextHash("pre_information")],
      ["distance_sales", LEGAL_TEXT_VERSIONS.distance_sales, legalTextHash("distance_sales")],
    ]);
  });

  it("marks the order for a manual copy when the accepted version has no template", async () => {
    const snapshot = snapshotOf({
      distance_sales: { version: "mesafeli-v3-taslak", sha256: "a".repeat(64), display_sha256: "" },
    });
    snapshot.input.versions.distance_sales = "mesafeli-v3-taslak";
    const supabase = fakeClient(storedSnapshot(snapshot));
    const result = await ensureOrderDocuments(supabase, "customer", ORDER, { auth, env });
    expect(result.manualCopy).toBe("template_unavailable");
    // The pre-information (renderable) is stored; the contract is not; the marker is.
    expect(posts.map((p) => p.op ?? p.kind)).toEqual(["pre_information", "manual_copy"]);
    expect(posts[1]).toMatchObject({ reason: "template_unavailable", order_id: ORDER });
  });

  it("marks a refused registration, but retries a transient failure", async () => {
    const supabase = fakeClient(storedSnapshot(snapshotOf()));
    answer = (body) =>
      body.op
        ? { status: 200, body: { status: "created", object: {} } }
        : { status: 409, body: { error: "version_mismatch" } };
    const refused = await ensureOrderDocuments(supabase, "customer", ORDER, { auth, env });
    expect(refused.manualCopy).toBe("version_mismatch");
    expect(posts.map((p) => p.op ?? p.kind)).toEqual(["pre_information", "manual_copy"]);

    posts = [];
    answer = () => ({ status: 500, body: { error: "failed" } });
    const transient = await ensureOrderDocuments(supabase, "customer", ORDER, { auth, env });
    expect(transient.manualCopy).toBeNull();
    expect(transient.failed.map((f) => f.kind)).toEqual(["pre_information", "distance_sales"]);
    expect(posts.some((p) => p.op)).toBe(false);
  });

  it("does not retry an order marked for a manual copy unless forced", async () => {
    const folder = {
      ...storedSnapshot(snapshotOf()),
      "manual-copy.json": new TextEncoder().encode("{}"),
    };
    const supabase = fakeClient(folder);
    const result = await ensureOrderDocuments(supabase, "customer", ORDER, { auth, env });
    expect(result.manualCopy).toBe("marked");
    expect(posts).toEqual([]);
    const forced = await ensureOrderDocuments(supabase, "ops", ORDER, { auth, env, force: true });
    expect(forced.created).toHaveLength(2);
  });

  it("waits for the snapshot shortly after the acceptance, then needs a manual copy", async () => {
    const supabase = fakeClient({});
    const soon = await ensureOrderDocuments(supabase, "customer", ORDER, {
      auth,
      env,
      now: new Date(Date.parse(ACCEPTED) + 60_000),
    });
    expect(soon.failed.map((f) => f.error)).toEqual(["snapshot_pending", "snapshot_pending"]);
    const later = await ensureOrderDocuments(supabase, "customer", ORDER, {
      auth,
      env,
      now: new Date(Date.parse(ACCEPTED) + SNAPSHOT_GRACE_MS),
    });
    expect(later.manualCopy).toBe("no_snapshot");
    expect(posts).toEqual([]);
  });

  it("refuses a snapshot whose bytes do not match its name", async () => {
    const folder = storedSnapshot(snapshotOf());
    const name = Object.keys(folder)[0];
    folder[name] = new TextEncoder().encode(JSON.stringify({ ...snapshotOf(), acceptedAt: "x" }));
    const result = await ensureOrderDocuments(fakeClient(folder), "customer", ORDER, { auth, env });
    expect(result.manualCopy).toBe("snapshot_invalid");
    expect(posts.map((p) => p.op)).toEqual(["manual_copy"]);
  });
});
