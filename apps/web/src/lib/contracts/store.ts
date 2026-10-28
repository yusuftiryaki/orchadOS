import "server-only";
import type { ContractDocumentKind } from "@/lib/i18n/messages/contracts";

// Client of the contract-documents Edge Function
// (supabase/functions/contract-documents/handler.ts). Only the Next server
// calls it: it sends SIGNUP_PROXY_SECRET, the existing shared secret between
// the Next server and the Edge Functions, and the caller's access token
// (customer or ops). The sweep mode (no user token) is for the automatic
// retry of wave 3; it sends the anon key, which passes the gateway's JWT check
// where the anon key is a JWT.

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

export async function storeContractDocument(
  auth: StoreAuth,
  request: StoreRequest,
  env: StoreEnv = storeEnv(),
): Promise<StoreResult> {
  if (!env.url || !env.proxySecret) return { ok: false, status: 0, error: "not_configured" };
  const token = "accessToken" in auth ? auth.accessToken : env.anonKey;
  try {
    const res = await fetch(`${env.url}/functions/v1/contract-documents`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: env.anonKey,
        authorization: `Bearer ${token}`,
        "x-orchados-proxy-secret": env.proxySecret,
        ...("sweep" in auth ? { "x-orchados-sweep": "1" } : {}),
      },
      body: JSON.stringify({
        order_id: request.orderId,
        kind: request.kind,
        text_version: request.textVersion,
        text_sha256: request.textSha256,
        generator: request.generator,
        pdf_base64: Buffer.from(request.pdf).toString("base64"),
      }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as {
      status?: string;
      error?: string;
      document?: { id?: string };
    } | null;
    if (res.ok && (body?.status === "created" || body?.status === "existing")) {
      return { ok: true, status: body.status, documentId: body.document?.id ?? null };
    }
    return { ok: false, status: res.status, error: body?.error ?? "failed" };
  } catch {
    return { ok: false, status: 0, error: "unavailable" };
  }
}
