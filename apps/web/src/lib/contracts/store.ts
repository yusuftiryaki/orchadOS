import "server-only";
import type { ContractDocumentKind } from "@/lib/i18n/messages/contracts";

// Client of the contract-documents Edge Function
// (supabase/functions/contract-documents/handler.ts). Only the Next server
// calls it: it sends SIGNUP_PROXY_SECRET, the existing shared secret between
// the Next server and the Edge Functions, and the caller's access token
// (customer or ops). The sweep mode (no user token) is for the automatic
// retry of wave 3; it sends the anon key, which passes the gateway's JWT check
// where the anon key is a JWT. Besides the PDFs it stores the acceptance
// snapshot and the manual-copy marker (snapshot.ts). Every call has a
// timeout, so a slow Edge Function never holds a page or an action.

export type StoreAuth = { accessToken: string } | { sweep: true };

export interface StoreEnv {
  url: string;
  anonKey: string;
  proxySecret: string | undefined;
}

export function storeEnv(): StoreEnv {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    proxySecret: process.env.SIGNUP_PROXY_SECRET || undefined,
  };
}

export interface StoreRequest {
  orderId: string;
  kind: ContractDocumentKind;
  textVersion: string;
  textSha256: string;
  generator: string;
  pdf: Uint8Array;
}

export type StoreResult =
  | { ok: true; status: "created" | "existing"; documentId: string | null }
  | { ok: false; status: number; error: string };

// An Edge call never holds the caller longer than this (a server action or a
// page): a timeout is a transient failure, retried later.
export const EDGE_TIMEOUT_MS = 20_000;

interface EdgeBody {
  status?: string;
  error?: string;
  document?: { id?: string };
  object?: { name?: string };
}

async function callEdge(
  auth: StoreAuth,
  body: Record<string, unknown>,
  env: StoreEnv,
): Promise<{ status: number; body: EdgeBody | null } | null> {
  const token = "accessToken" in auth ? auth.accessToken : env.anonKey;
  try {
    const res = await fetch(`${env.url}/functions/v1/contract-documents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: env.anonKey,
        authorization: `Bearer ${token}`,
        "x-orchados-proxy-secret": env.proxySecret ?? "",
        ...("sweep" in auth ? { "x-orchados-sweep": "1" } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(EDGE_TIMEOUT_MS),
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as EdgeBody | null };
  } catch {
    return null;
  }
}

export async function storeContractDocument(
  auth: StoreAuth,
  request: StoreRequest,
  env: StoreEnv = storeEnv(),
): Promise<StoreResult> {
  if (!env.url || !env.proxySecret) return { ok: false, status: 0, error: "not_configured" };
  const res = await callEdge(
    auth,
    {
      order_id: request.orderId,
      kind: request.kind,
      text_version: request.textVersion,
      text_sha256: request.textSha256,
      generator: request.generator,
      pdf_base64: Buffer.from(request.pdf).toString("base64"),
    },
    env,
  );
  if (!res) return { ok: false, status: 0, error: "unavailable" };
  const { body } = res;
  if (res.status === 200 && (body?.status === "created" || body?.status === "existing")) {
    return { ok: true, status: body.status, documentId: body.document?.id ?? null };
  }
  return { ok: false, status: res.status, error: body?.error ?? "failed" };
}

export type JsonStoreResult =
  | { ok: true; status: "created" | "existing"; name: string | null }
  | { ok: false; status: number; error: string };

async function storeJson(
  auth: StoreAuth,
  body: Record<string, unknown>,
  env: StoreEnv,
): Promise<JsonStoreResult> {
  if (!env.url || !env.proxySecret) return { ok: false, status: 0, error: "not_configured" };
  const res = await callEdge(auth, body, env);
  if (!res) return { ok: false, status: 0, error: "unavailable" };
  if (res.status === 200 && (res.body?.status === "created" || res.body?.status === "existing")) {
    return { ok: true, status: res.body.status, name: res.body.object?.name ?? null };
  }
  return { ok: false, status: res.status, error: res.body?.error ?? "failed" };
}

// The acceptance snapshot (snapshot.ts), once per order: only the order's
// customer, right after the acceptance.
export function storeAcceptanceSnapshot(
  auth: StoreAuth,
  orderId: string,
  snapshot: unknown,
  env: StoreEnv = storeEnv(),
): Promise<JsonStoreResult> {
  return storeJson(auth, { op: "snapshot", order_id: orderId, snapshot }, env);
}

// The "needs a manual copy" marker of an order (snapshot.ts).
export function storeManualCopyMarker(
  auth: StoreAuth,
  orderId: string,
  reason: string,
  env: StoreEnv = storeEnv(),
): Promise<JsonStoreResult> {
  return storeJson(auth, { op: "manual_copy", order_id: orderId, reason }, env);
}
