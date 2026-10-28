import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type Deps,
  type RegisterArgs,
  handleStore,
  parseStore,
} from "../../../../../supabase/functions/contract-documents/handler.ts";

// The contract-documents Edge Function's request handling with fake
// Supabase calls (the real ones: tests/integration/contract-documents.test.ts).

const ORDER = "55555555-5555-4555-8555-555555555555";
const ORG = "b0000000-0000-4000-8000-000000000001";
const CUSTOMER = "a0000000-0000-4000-8000-000000000006";
const OPS = "a0000000-0000-4000-8000-000000000005";
const PDF = Buffer.from("%PDF-1.4\n% test\n");
const ACCEPTED = "2026-03-01T09:00:00Z";
const NOW = new Date("2026-03-01T09:05:00Z");

function token(claims: Record<string, unknown>): string {
  const part = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${part({ alg: "HS256" })}.${part(claims)}.sig`;
}
const customerToken = token({ role: "authenticated", sub: CUSTOMER });
const opsToken = token({ role: "authenticated", sub: OPS });
const anonToken = token({ role: "anon" });

function request(headers: Record<string, string>, body: Record<string, unknown> = {}): Request {
  return new Request("http://edge/functions/v1/contract-documents", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      order_id: ORDER,
      kind: "pre_information",
      text_version: "onbilgi-v4-taslak",
      text_sha256: "a".repeat(64),
      generator: "test",
      pdf_base64: PDF.toString("base64"),
      ...body,
    }),
  });
}

function fakes(overrides: Partial<Deps> = {}) {
  const calls: { register: RegisterArgs[]; upload: string[] } = { register: [], upload: [] };
  const stored = new Map<string, Uint8Array>();
  const registered = new Map<string, string>();
  const deps: Deps = {
    proxySecret: "secret",
    readOrderAsUser: async (t) =>
      t === customerToken || t === opsToken
        ? {
            id: ORDER,
            org_id: ORG,
            customer_user_id: CUSTOMER,
            activated_at: null,
            created_at: ACCEPTED,
          }
        : null,
    readOrderAsService: async () => ({
      id: ORDER,
      org_id: ORG,
      customer_user_id: CUSTOMER,
      activated_at: null,
      created_at: ACCEPTED,
    }),
    customerDocuments: async () => [],
    opsDocuments: async (t) => (t === opsToken ? [] : null),
    async register(args) {
      calls.register.push(args);
      const done = registered.get(args.p_kind);
      if (done)
        return done === args.p_sha256
          ? { ok: true, id: "doc-1" }
          : { ok: false, error: { message: "exists", details: null } };
      const object = stored.get(args.p_storage_path);
      if (!object)
        return { ok: false, error: { message: "invalid_input", details: "storage_path" } };
      if (args.p_size_bytes !== object.length) {
        return { ok: false, error: { message: "invalid_input", details: "size_bytes" } };
      }
      registered.set(args.p_kind, args.p_sha256);
      return { ok: true, id: "doc-1" };
    },
    async upload(path, pdf) {
      calls.upload.push(path);
      if (stored.has(path)) return "exists";
      stored.set(path, pdf);
      return "created";
    },
    download: async (path) => stored.get(path)!,
    list: async (folder) =>
      [...stored.keys()]
        .filter((k) => k.startsWith(`${folder}/`))
        .map((k) => k.slice(folder.length + 1)),
    async uploadJson(path, bytes) {
      calls.upload.push(path);
      if (stored.has(path)) return "exists";
      stored.set(path, bytes);
      return "created";
    },
    now: () => NOW,
    ...overrides,
  };
  return { deps, calls, stored, registered };
}

const user = (t: string) => ({ "x-orchados-proxy-secret": "secret", authorization: `Bearer ${t}` });

describe("contract-documents Edge Function", () => {
  it("refuses a missing or wrong proxy secret", async () => {
    const { deps } = fakes();
    expect(
      (await handleStore(request({ authorization: `Bearer ${customerToken}` }), deps)).status,
    ).toBe(401);
    expect(
      (await handleStore(request({ ...user(customerToken), "x-orchados-proxy-secret": "x" }), deps))
        .status,
    ).toBe(401);
  });

  it("refuses the demo claim before anything else", async () => {
    const { deps, calls } = fakes();
    const demo = token({ role: "authenticated", sub: CUSTOMER, app_metadata: { demo: true } });
    const res = await handleStore(request(user(demo)), deps);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "demo_read_only" });
    expect(calls.register).toHaveLength(0);
  });

  it("refuses a caller without a user token and without the sweep marker", async () => {
    const { deps } = fakes();
    expect((await handleStore(request(user(anonToken)), deps)).status).toBe(401);
  });

  it("stores and registers the customer's document, then returns it again", async () => {
    const { deps, calls } = fakes();
    const res = await handleStore(request(user(customerToken)), deps);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("created");
    expect(body.document.storage_path).toBe(`${ORG}/${ORDER}/pre_information.pdf`);
    expect(body.document.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(calls.upload).toEqual([`${ORG}/${ORDER}/pre_information.pdf`]);
    // Pre-check, then the registration after the upload.
    expect(calls.register).toHaveLength(2);
    const again = await handleStore(request(user(customerToken)), deps);
    expect((await again.json()).status).toBe("existing");
    expect(calls.upload).toHaveLength(1);
  });

  it("returns a document the reader already lists without writing", async () => {
    const existing = {
      id: "doc-9",
      kind: "pre_information",
      storage_path: `${ORG}/${ORDER}/pre_information.pdf`,
      sha256: "b".repeat(64),
      size_bytes: 10,
    };
    const { deps, calls } = fakes({ customerDocuments: async () => [existing] });
    const res = await handleStore(request(user(customerToken)), deps);
    expect(await res.json()).toEqual({ status: "existing", document: existing });
    expect(calls.register).toHaveLength(0);
  });

  it("lets ops of the org in and refuses another caller who sees the order but is not ops", async () => {
    const { deps } = fakes();
    expect((await handleStore(request(user(opsToken)), deps)).status).toBe(200);
    const stranger = token({ role: "authenticated", sub: "x" });
    const { deps: d2 } = fakes({
      readOrderAsUser: async () => ({
        id: ORDER,
        org_id: ORG,
        customer_user_id: CUSTOMER,
        activated_at: null,
        created_at: ACCEPTED,
      }),
    });
    expect((await handleStore(request(user(stranger)), d2)).status).toBe(403);
  });

  it("answers 404 when the caller cannot read the order", async () => {
    const { deps } = fakes({ readOrderAsUser: async () => null });
    expect((await handleStore(request(user(customerToken)), deps)).status).toBe(404);
  });

  it("refuses a refused version before uploading anything", async () => {
    const { deps, calls } = fakes({
      register: async () => ({
        ok: false,
        error: { message: "invalid_input", details: "text_version" },
      }),
    });
    const res = await handleStore(request(user(customerToken)), deps);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "version_mismatch" });
    expect(calls.upload).toHaveLength(0);
  });

  it("registers an object left by a failed registration as it is", async () => {
    const { deps, stored, calls } = fakes();
    const earlier = Buffer.from("%PDF-1.4\n% earlier\n");
    stored.set(`${ORG}/${ORDER}/pre_information.pdf`, earlier);
    const res = await handleStore(request(user(customerToken)), deps);
    const body = await res.json();
    expect(body.status).toBe("created");
    expect(body.document.size_bytes).toBe(earlier.length);
    expect(calls.register.at(-1)?.p_size_bytes).toBe(earlier.length);
    expect(calls.upload).toHaveLength(0);
    // The pre-check never registers: it passes size 0.
    expect(calls.register[0].p_size_bytes).toBe(0);
  });

  it("system mode: only with the sweep marker, refusing an inactive order's withdrawal confirmation", async () => {
    const { deps } = fakes();
    const sweep = { ...user(anonToken), "x-orchados-sweep": "1" };
    expect((await handleStore(request(sweep), deps)).status).toBe(200);
    const res = await handleStore(
      request(sweep, { kind: "withdrawal_confirmation", text_version: "mesafeli-v4-taslak" }),
      deps,
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "order_not_active" });
  });

  it("validates the body", () => {
    expect(parseStore({})).toEqual({ ok: false, field: "order_id" });
    const ok = {
      order_id: ORDER,
      kind: "distance_sales",
      text_version: "mesafeli-v4-taslak",
      text_sha256: "a".repeat(64),
      generator: "g",
    };
    expect(parseStore({ ...ok, kind: "x" })).toEqual({ ok: false, field: "kind" });
    expect(parseStore({ ...ok, pdf_base64: Buffer.from("hello").toString("base64") })).toEqual({
      ok: false,
      field: "pdf_base64",
    });
    expect(parseStore({ ...ok, pdf_base64: PDF.toString("base64") }).ok).toBe(true);
  });

  describe("JSON objects", () => {
    const snapshot = { schema: "contract-acceptance-v1", orderId: ORDER, input: { x: 1 } };
    const op = (body: Record<string, unknown>) => ({ order_id: ORDER, ...body });
    const call = (headers: Record<string, string>, body: Record<string, unknown>, deps: Deps) =>
      handleStore(
        new Request("http://edge/functions/v1/contract-documents", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify(body),
        }),
        deps,
      );

    it("stores the acceptance snapshot once, content-addressed, for the order's customer", async () => {
      const { deps, stored } = fakes();
      const res = await call(user(customerToken), op({ op: "snapshot", snapshot }), deps);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("created");
      expect(body.object.name).toMatch(/^acceptance-[0-9a-f]{64}\.json$/);
      const path = `${ORG}/${ORDER}/${body.object.name}`;
      const sha = createHash("sha256").update(stored.get(path)!).digest("hex");
      expect(body.object.name).toBe(`acceptance-${sha}.json`);
      // A second, different snapshot never replaces it.
      const again = await call(
        user(customerToken),
        op({ op: "snapshot", snapshot: { ...snapshot, input: { x: 2 } } }),
        deps,
      );
      expect(await again.json()).toEqual({
        status: "existing",
        object: { name: body.object.name },
      });
      expect([...stored.keys()]).toEqual([path]);
    });

    it("refuses a snapshot from ops, the system, too late or of another order", async () => {
      const { deps, stored } = fakes();
      expect((await call(user(opsToken), op({ op: "snapshot", snapshot }), deps)).status).toBe(403);
      const sweep = { ...user(anonToken), "x-orchados-sweep": "1" };
      expect((await call(sweep, op({ op: "snapshot", snapshot }), deps)).status).toBe(403);
      const late = fakes({ now: () => new Date("2026-03-01T09:16:00Z") });
      const res = await call(user(customerToken), op({ op: "snapshot", snapshot }), late.deps);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "snapshot_too_late" });
      const other = await call(
        user(customerToken),
        op({ op: "snapshot", snapshot: { ...snapshot, orderId: ORG } }),
        deps,
      );
      expect(await other.json()).toEqual({ error: "invalid_input", field: "snapshot" });
      const demo = token({ role: "authenticated", sub: CUSTOMER, app_metadata: { demo: true } });
      expect((await call(user(demo), op({ op: "snapshot", snapshot }), deps)).status).toBe(403);
      expect(stored.size).toBe(0);
    });

    it("stores the manual-copy marker once for the customer, ops or the system", async () => {
      const { deps, stored } = fakes();
      const res = await call(
        user(opsToken),
        op({ op: "manual_copy", reason: "version_mismatch" }),
        deps,
      );
      expect(await res.json()).toEqual({ status: "created", object: { name: "manual-copy.json" } });
      const path = `${ORG}/${ORDER}/manual-copy.json`;
      expect(JSON.parse(Buffer.from(stored.get(path)!).toString())).toEqual({
        reason: "version_mismatch",
        at: NOW.toISOString(),
      });
      const again = await call(
        user(customerToken),
        op({ op: "manual_copy", reason: "render_failed" }),
        deps,
      );
      expect((await again.json()).status).toBe("existing");
      expect(
        (await call(user(customerToken), op({ op: "manual_copy", reason: "x" }), deps)).status,
      ).toBe(400);
      const stranger = token({ role: "authenticated", sub: "x" });
      expect(
        (await call(user(stranger), op({ op: "manual_copy", reason: "no_snapshot" }), deps)).status,
      ).toBe(404);
    });
  });
});
