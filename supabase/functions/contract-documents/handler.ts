// contract-documents: stores an order-specific contract PDF immutably and
// registers it (docs/musteri-yonetimi.md "Sözleşme belgeleri (T04)";
// docs/hukuk/kararlar.md H12, T04). Pure request handling; index.ts wires the
// real Supabase calls. Imported by the web's unit tests too.
//
// POST /functions/v1/contract-documents   (verify_jwt: default true)
//   x-orchados-proxy-secret: SIGNUP_PROXY_SECRET (the Next server's shared
//   secret with the Edge Functions, reused: only the Next server renders the
//   PDFs and calls this function)
//   Authorization: Bearer <token>
//   { order_id, kind, text_version, text_sha256, generator, pdf_base64 }
//
// Three caller modes, decided by the token, never by a body field:
//   customer  the order's customer (their access token)
//   ops       an ops user of the order's org (their access token)
//             Both are authorised by reading the order with the caller's token
//             (row level security on service_order: the customer or the org's
//             ops), then my_contract_documents / ops_contract_documents.
//   system    no user token (a JWT that is not a user's, e.g. the anon key)
//             plus `x-orchados-sweep: 1`: the later automatic sweep (wave 3).
//             Only documents that are still missing and registrable are
//             written (the registration pre-check below is the
//             ops_orders_missing_contract_documents rule).
// In every mode: a demo token is refused; an existing document of the kind
// is returned as it is (idempotent); the PDF's SHA-256 is computed here; the
// object is uploaded with the service role without upsert (the bucket's
// trigger refuses every update and delete anyway); then
// service_register_contract_document registers it, which queues the
// contract_ready SMS once both acceptance documents exist.
//
// Before uploading, the registration is called once as a pre-check with size
// 0: with a valid order, kind, version and hash but no object yet it fails
// with invalid_input/storage_path, and only then is the object written. A refused
// version (an order accepted under another text version), a demo order or an
// inactive order for withdrawal_confirmation is thus refused before anything
// is stored. An object left by an upload whose registration failed is
// registered as it is (downloaded and hashed), never replaced.
//
//   200 {status: "created" | "existing", document: {id?, kind, storage_path, sha256?, size_bytes?}}
//   400 {error: "invalid_input", field} · 401 {error: "unauthorized"}
//   403 {error: "demo_read_only" | "forbidden"} · 404 {error: "not_found"}
//   409 {error: "order_not_active" | "version_mismatch"} · 500 {error: "failed"}
//
// No response and no log line carries personal data or the PDF.

import { isDemoClaims, jwtClaims, timingSafeEqual } from "../_shared/signup.ts";

export const KINDS = [
  "pre_information",
  "distance_sales",
  "withdrawal_confirmation",
] as const;
export type Kind = (typeof KINDS)[number];

export const MAX_BYTES = 20 * 1024 * 1024;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const VERSION_RE = /^[a-z0-9][a-z0-9.-]{1,40}$/;

export interface StoreRequest {
  orderId: string;
  kind: Kind;
  textVersion: string;
  textSha256: string;
  generator: string;
  pdf: Uint8Array;
}

export interface OrderRow {
  id: string;
  org_id: string;
  customer_user_id: string;
  activated_at: string | null;
}

export interface ExistingDocument {
  id: string;
  kind: string;
  storage_path: string;
  sha256: string;
  size_bytes: number;
}

// PostgREST error of an RPC: the raised message (code) and its detail.
export interface RpcError {
  message: string;
  details: string | null;
}

export type RegisterResult =
  { ok: true; id: string } | { ok: false; error: RpcError };

export interface Deps {
  proxySecret: string;
  // The order as the caller sees it (row level security), or null.
  readOrderAsUser: (token: string, orderId: string) => Promise<OrderRow | null>;
  // The order with the service role (system mode).
  readOrderAsService: (orderId: string) => Promise<OrderRow | null>;
  // my_contract_documents (customer) / ops_contract_documents (ops), with the
  // caller's token; null when the reader refuses the caller.
  customerDocuments: (
    token: string,
    orderId: string,
  ) => Promise<ExistingDocument[] | null>;
  opsDocuments: (
    token: string,
    orderId: string,
  ) => Promise<ExistingDocument[] | null>;
  register: (args: RegisterArgs) => Promise<RegisterResult>;
  // "exists" when an object is already stored at the path.
  upload: (path: string, pdf: Uint8Array) => Promise<"created" | "exists">;
  download: (path: string) => Promise<Uint8Array>;
}

export interface RegisterArgs {
  p_order_id: string;
  p_kind: Kind;
  p_text_version: string;
  p_text_sha256: string;
  p_storage_path: string;
  p_sha256: string;
  p_size_bytes: number;
  p_generator: string;
}

export type Parsed =
  { ok: true; value: StoreRequest } | { ok: false; field: string };

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export function parseStore(body: unknown): Parsed {
  if (!body || typeof body !== "object") return { ok: false, field: "body" };
  const b = body as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : "");
  const orderId = str("order_id");
  if (!UUID_RE.test(orderId)) return { ok: false, field: "order_id" };
  const kind = str("kind") as Kind;
  if (!KINDS.includes(kind)) return { ok: false, field: "kind" };
  const textVersion = str("text_version");
  if (!VERSION_RE.test(textVersion))
    return { ok: false, field: "text_version" };
  const textSha256 = str("text_sha256");
  if (!HEX64_RE.test(textSha256)) return { ok: false, field: "text_sha256" };
  const generator = str("generator").trim();
  if (generator.length < 1 || generator.length > 100)
    return { ok: false, field: "generator" };
  const pdf = decodeBase64(str("pdf_base64"));
  if (!pdf || pdf.length < PDF_MAGIC.length || pdf.length > MAX_BYTES) {
    return { ok: false, field: "pdf_base64" };
  }
  if (PDF_MAGIC.some((byte, i) => pdf[i] !== byte))
    return { ok: false, field: "pdf_base64" };
  return {
    ok: true,
    value: { orderId, kind, textVersion, textSha256, generator, pdf },
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
const error = (
  code: string,
  status: number,
  extra: Record<string, string> = {},
) => json({ error: code, ...extra }, status);

export function bearerOf(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
}

type Mode =
  { kind: "user"; token: string; userId: string } | { kind: "system" };

// The caller's mode from the token: a user's access token (role
// authenticated with a subject) or, with the sweep marker, the system.
export function modeOf(req: Request): Mode | "demo" | null {
  const token = bearerOf(req);
  const claims = token ? jwtClaims(token) : null;
  if (isDemoClaims(claims)) return "demo";
  if (
    token &&
    claims?.role === "authenticated" &&
    typeof claims.sub === "string" &&
    claims.sub
  ) {
    return { kind: "user", token, userId: claims.sub };
  }
  if (req.headers.get("x-orchados-sweep") === "1") return { kind: "system" };
  return null;
}

// The outcome of a registration error before or after the upload.
function refusal(e: RpcError): Response {
  switch (e.message) {
    case "demo_read_only":
      return error("demo_read_only", 403);
    case "order_not_active":
      return error("order_not_active", 409);
    case "not_found":
      return error("not_found", 404);
    case "invalid_input":
      if (e.details === "text_version" || e.details === "text_sha256") {
        return error("version_mismatch", 409);
      }
      return error("invalid_input", 400, { field: e.details ?? "" });
    default:
      return error("failed", 500);
  }
}

export async function handleStore(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return error("method_not_allowed", 405);
  const secret = req.headers.get("x-orchados-proxy-secret") ?? "";
  if (
    !deps.proxySecret ||
    !secret ||
    !timingSafeEqual(secret, deps.proxySecret)
  ) {
    return error("unauthorized", 401);
  }
  const mode = modeOf(req);
  if (mode === "demo") return error("demo_read_only", 403);
  if (!mode) return error("unauthorized", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("invalid_input", 400, { field: "body" });
  }
  const parsed = parseStore(body);
  if (!parsed.ok) return error("invalid_input", 400, { field: parsed.field });
  const input = parsed.value;

  try {
    let order: OrderRow | null;
    if (mode.kind === "user") {
      order = await deps.readOrderAsUser(mode.token, input.orderId);
      if (!order) return error("not_found", 404);
      const documents =
        order.customer_user_id === mode.userId
          ? await deps.customerDocuments(mode.token, order.id)
          : await deps.opsDocuments(mode.token, order.id);
      if (!documents) return error("forbidden", 403);
      const existing = documents.find((d) => d.kind === input.kind);
      if (existing) return json({ status: "existing", document: existing });
    } else {
      order = await deps.readOrderAsService(input.orderId);
      if (!order) return error("not_found", 404);
    }
    if (input.kind === "withdrawal_confirmation" && !order.activated_at) {
      return error("order_not_active", 409);
    }

    const path = `${order.org_id}/${order.id}/${input.kind}.pdf`;
    const args = (sha256: string, size: number): RegisterArgs => ({
      p_order_id: order!.id,
      p_kind: input.kind,
      p_text_version: input.textVersion,
      p_text_sha256: input.textSha256,
      p_storage_path: path,
      p_sha256: sha256,
      p_size_bytes: size,
      p_generator: input.generator,
    });

    let sha256 = await sha256Hex(input.pdf);
    let size = input.pdf.length;
    // The pre-check passes size 0, which the registration refuses only after
    // its other checks: storage_path = no object yet; size_bytes = an object
    // is stored but not registered. It can never register anything itself.
    const pre = await deps.register(args(sha256, 0));
    if (pre.ok) {
      return json({
        status: "existing",
        document: { id: pre.id, kind: input.kind, storage_path: path, sha256 },
      });
    }
    if (pre.error.message === "exists") {
      return json({
        status: "existing",
        document: { kind: input.kind, storage_path: path },
      });
    }
    const orphan =
      pre.error.message === "invalid_input" &&
      pre.error.details === "size_bytes";
    const missing =
      pre.error.message === "invalid_input" &&
      pre.error.details === "storage_path";
    if (!orphan && !missing) return refusal(pre.error);

    if (orphan || (await deps.upload(path, input.pdf)) === "exists") {
      // Left by an earlier attempt whose registration failed (or a parallel
      // one): register the stored object as it is.
      const stored = await deps.download(path);
      sha256 = await sha256Hex(stored);
      size = stored.length;
    }
    const registered = await deps.register(args(sha256, size));
    if (!registered.ok) {
      if (registered.error.message === "exists") {
        return json({
          status: "existing",
          document: { kind: input.kind, storage_path: path },
        });
      }
      return refusal(registered.error);
    }
    return json({
      status: "created",
      document: {
        id: registered.id,
        kind: input.kind,
        storage_path: path,
        sha256,
        size_bytes: size,
      },
    });
  } catch {
    return error("failed", 500);
  }
}
