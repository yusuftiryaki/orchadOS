// contract-documents: immutable storage and registration of the
// order-specific contract PDFs (T04). The protocol, the caller modes and the
// checks are in handler.ts; this file wires the Supabase REST calls.

import {
  type Deps,
  type ExistingDocument,
  type OrderRow,
  type RegisterArgs,
  type RegisterResult,
  handleStore,
} from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Reused: the Next server's shared secret with the Edge Functions (also
// customer-signup and demo-start). Never the DEMO_ variant: the demo never
// gets contract documents.
const PROXY_SECRET = Deno.env.get("SIGNUP_PROXY_SECRET") ?? "";
const BUCKET = "contract-documents";
const ORDER_COLUMNS = "id,org_id,customer_user_id,activated_at,created_at";

class Failure extends Error {}

const userHeaders = (token: string) => ({
  apikey: ANON_KEY,
  authorization: `Bearer ${token}`,
  "content-type": "application/json",
});
const serviceHeaders = {
  apikey: SERVICE_ROLE_KEY,
  authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "content-type": "application/json",
};

async function readOrder(
  headers: Record<string, string>,
  orderId: string,
): Promise<OrderRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/service_order?id=eq.${orderId}&quote_id=not.is.null&select=${ORDER_COLUMNS}`,
    { headers },
  );
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Failure(`order read failed with ${res.status}`);
  const rows = (await res.json()) as OrderRow[];
  return rows[0] ?? null;
}

// An RPC with the caller's token; null when it refuses the caller.
async function userRpc<T>(
  token: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: userHeaders(token),
    body: JSON.stringify(args),
  });
  if (res.status >= 400 && res.status < 500) {
    await res.body?.cancel();
    return null;
  }
  if (!res.ok) throw new Failure(`${fn} failed with ${res.status}`);
  return (await res.json()) as T;
}

async function register(args: RegisterArgs): Promise<RegisterResult> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/service_register_contract_document`,
    {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify(args),
    },
  );
  const body = await res.json().catch(() => null);
  if (res.ok && typeof body === "string") return { ok: true, id: body };
  if (body && typeof body === "object" && typeof body.message === "string") {
    return {
      ok: false,
      error: { message: body.message, details: body.details ?? null },
    };
  }
  throw new Failure(`register failed with ${res.status}`);
}

const objectUrl = (path: string) =>
  `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;

async function upload(
  path: string,
  bytes: Uint8Array,
  contentType = "application/pdf",
): Promise<"created" | "exists"> {
  const res = await fetch(objectUrl(path), {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "content-type": contentType,
      "x-upsert": "false",
      "cache-control": "no-store",
    },
    body: bytes as BodyInit,
  });
  if (res.ok) {
    await res.body?.cancel();
    return "created";
  }
  const text = await res.text();
  // Storage answers a taken path with 409, or 400 carrying statusCode 409.
  if (
    res.status === 409 ||
    /"statusCode"\s*:\s*"?409|Duplicate|already exists/i.test(text)
  ) {
    return "exists";
  }
  throw new Failure(`upload failed with ${res.status}`);
}

async function download(path: string): Promise<Uint8Array> {
  const res = await fetch(objectUrl(path), {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Failure(`download failed with ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function list(folder: string): Promise<string[]> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ prefix: `${folder}/`, limit: 100, offset: 0 }),
  });
  if (!res.ok) throw new Failure(`list failed with ${res.status}`);
  const rows = (await res.json()) as { name: string }[];
  return rows.map((r) => r.name);
}

const deps: Deps = {
  proxySecret: PROXY_SECRET,
  readOrderAsUser: (token, orderId) => readOrder(userHeaders(token), orderId),
  readOrderAsService: (orderId) => readOrder(serviceHeaders, orderId),
  async customerDocuments(token, orderId) {
    const rows = await userRpc<(ExistingDocument & { order_id: string })[]>(
      token,
      "my_contract_documents",
      {},
    );
    return rows ? rows.filter((d) => d.order_id === orderId) : null;
  },
  opsDocuments: (token, orderId) =>
    userRpc<ExistingDocument[]>(token, "ops_contract_documents", {
      p_order_id: orderId,
    }),
  register,
  upload: (path, pdf) => upload(path, pdf),
  download,
  list,
  uploadJson: (path, bytes) => upload(path, bytes, "application/json"),
};

Deno.serve((req) => handleStore(req, deps));
