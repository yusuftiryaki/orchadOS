import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import type { Database } from "@/lib/database.types";
import { CONTRACT_KINDS, type ContractDocumentKind } from "@/lib/i18n/messages/contracts";
import { sha256Hex } from "@/lib/legal/text-hash";
import { CONTRACT_PDF_GENERATOR, contractPdf } from "@/lib/pdf/contract-pdf";
import type { Client } from "@/lib/supabase/types";
import { contractOrderOf, orderRef, type ContractActor, type OrderRef } from "./load";
import type { ContractInput } from "./model";
import { contractDocument, textKindOf } from "./render";
import {
  acceptanceSnapshot,
  inputFor,
  MANUAL_COPY_NAME,
  parseSnapshot,
  snapshotName,
  type AcceptanceSnapshot,
  type AcceptedText,
  type ManualCopyReason,
} from "./snapshot";
import {
  storeAcceptanceSnapshot,
  storeContractDocument,
  storeEnv,
  storeManualCopyMarker,
  type StoreAuth,
  type StoreEnv,
} from "./store";
import { acceptedTemplate, type TemplateKind } from "./templates";

// Generating an order's missing contract documents (docs/musteri-yonetimi.md
// "Sözleşme belgeleri (T04)"). Right after the acceptance the customer's
// action stores the acceptance snapshot and renders both documents in the
// background (generateAfterAcceptance); a visit of Sözleşmelerim or the order
// page (the customer) and the ops screens retry what is still missing. Every
// rendering uses the snapshot and the template of the accepted version, never
// live reads or today's legal.ts. Idempotent: the Edge Function returns a
// document that already exists. An order whose documents cannot be produced
// automatically (no snapshot, a version without its template, a refused
// registration) gets the manual-copy marker and is no longer retried
// automatically; ops send a copy on request.

const BUCKET = "contract-documents";

// How long after the acceptance an order without a snapshot is still being
// prepared (the background write may not have run yet). The Edge Function
// refuses a snapshot written later than this.
export const SNAPSHOT_GRACE_MS = 15 * 60 * 1000;

export interface ContractDocumentRow {
  id: string;
  order_id: string;
  kind: string;
  text_version: string;
  storage_path: string;
  sha256: string;
  size_bytes: number;
  created_at: string;
  order_number?: string;
  generator?: string;
}

export async function customerDocuments(supabase: Client): Promise<ContractDocumentRow[]> {
  const { data, error } = await supabase.rpc("my_contract_documents");
  if (error) throw error;
  return data ?? [];
}

export async function opsDocuments(
  supabase: Client,
  orderId: string,
): Promise<ContractDocumentRow[]> {
  const { data, error } = await supabase.rpc("ops_contract_documents", { p_order_id: orderId });
  if (error) throw error;
  return (data ?? []).map((d) => ({ ...d, order_id: orderId }));
}

// The documents an order must have: both acceptance documents, and the
// withdrawal confirmation once the order is active (activated_at set; it
// stays set after the order ends).
export function requiredKinds(activatedAt: string | null): ContractDocumentKind[] {
  return CONTRACT_KINDS.filter((k) => k !== "withdrawal_confirmation" || !!activatedAt);
}

export function missingKinds(
  activatedAt: string | null,
  documents: Pick<ContractDocumentRow, "kind">[],
): ContractDocumentKind[] {
  const have = new Set(documents.map((d) => d.kind));
  return requiredKinds(activatedAt).filter((k) => !have.has(k));
}

export async function accessTokenOf(supabase: Client): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// A client acting with an access token, for work that runs after the
// response (next/server after()), where the request's cookies are gone.
export function tokenClient(accessToken: string, env: StoreEnv = storeEnv()): Client {
  return createSupabaseClient<Database>(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

interface Folder {
  snapshot: { name: string; sha256: string } | null;
  manualCopy: boolean;
}

// The order's folder in the bucket as the caller sees it.
async function folderOf(supabase: Client, order: Pick<OrderRef, "id" | "orgId">): Promise<Folder> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(`${order.orgId}/${order.id}`, { limit: 100 });
  if (error) throw error;
  const objects = data ?? [];
  return {
    snapshot: snapshotName(objects),
    manualCopy: objects.some((o) => o.name === MANUAL_COPY_NAME),
  };
}

async function readSnapshot(
  supabase: Client,
  order: OrderRef,
  stored: { name: string; sha256: string },
): Promise<AcceptanceSnapshot | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(`${order.orgId}/${order.id}/${stored.name}`);
  if (error || !data) throw error ?? new Error("snapshot_unreadable");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (sha256Hex(bytes) !== stored.sha256) return null;
  try {
    return parseSnapshot(JSON.parse(new TextDecoder().decode(bytes)), order.id);
  } catch {
    return null;
  }
}

// Where an order's documents stand: complete, being prepared (missing and
// retried automatically) or waiting for a manual copy.
export type DocumentState =
  | { state: "complete"; missing: [] }
  | { state: "preparing" | "manual_copy"; missing: ContractDocumentKind[] };

export async function documentState(
  supabase: Client,
  order: Pick<OrderRef, "id" | "orgId" | "acceptedAt" | "activatedAt">,
  documents: Pick<ContractDocumentRow, "kind">[],
  now = new Date(),
): Promise<DocumentState> {
  const missing = missingKinds(order.activatedAt, documents);
  if (missing.length === 0) return { state: "complete", missing: [] };
  return { state: await missingState(supabase, order, now), missing };
}

// The state of an order with missing documents, from its folder.
export async function missingState(
  supabase: Client,
  order: Pick<OrderRef, "id" | "orgId" | "acceptedAt">,
  now = new Date(),
): Promise<"preparing" | "manual_copy"> {
  const folder = await folderOf(supabase, order);
  if (folder.manualCopy) return "manual_copy";
  if (!folder.snapshot && now.getTime() - Date.parse(order.acceptedAt) >= SNAPSHOT_GRACE_MS) {
    return "manual_copy";
  }
  return "preparing";
}

// Orders one bulk "Belgeleri üret" click handles at most.
export const OPS_BULK_LIMIT = 5;

export interface MissingOrder {
  order_id: string;
  org_id: string;
  order_number: string;
  status: string;
  accepted_at: string;
  activated_at: string | null;
  missing: string[];
  state: "preparing" | "manual_copy";
}

// ops_orders_missing_contract_documents, each order with its state: the ops
// list shows the ones being prepared and, apart, the ones that need a
// manual copy; only the former are generated in bulk.
export async function opsMissingOrders(
  supabase: Client,
  now = new Date(),
): Promise<MissingOrder[]> {
  const { data, error } = await supabase.rpc("ops_orders_missing_contract_documents");
  if (error) return [];
  return Promise.all(
    (data ?? []).map(async (r) => ({
      ...r,
      state: await missingState(
        supabase,
        { id: r.order_id, orgId: r.org_id, acceptedAt: r.accepted_at },
        now,
      ).catch(() => "preparing" as const),
    })),
  );
}

export interface EnsureResult {
  created: ContractDocumentKind[];
  existing: ContractDocumentKind[];
  // Transient failures: retried on the next visit or click.
  failed: { kind: ContractDocumentKind; error: string }[];
  // Set when the order needs a manual copy (nothing is retried automatically);
  // "marked" when an earlier attempt already said so.
  manualCopy: ManualCopyReason | "marked" | null;
}

// Edge refusals that a retry cannot change.
const PERMANENT: Partial<Record<string, ManualCopyReason>> = {
  version_mismatch: "version_mismatch",
  invalid_input: "invalid_input",
};

export interface EnsureOptions {
  auth?: StoreAuth;
  env?: StoreEnv;
  now?: Date;
  // Ops' explicit retry of one order: also when it carries the marker.
  force?: boolean;
  // The snapshot just written (the acceptance), instead of reading it back.
  snapshot?: AcceptanceSnapshot;
  // The order and its stored documents as the caller already read them (the
  // automatic sweep reads them through its ticket, sweep_contract_orders).
  source?: { order: OrderRef; documents: Pick<ContractDocumentRow, "kind">[] };
}

// Renders and stores the order's missing documents as the caller (customer
// or ops: the Edge Function authorises the token, not this function).
export async function ensureOrderDocuments(
  supabase: Client,
  actor: ContractActor,
  orderId: string,
  options: EnsureOptions = {},
): Promise<EnsureResult> {
  const result: EnsureResult = { created: [], existing: [], failed: [], manualCopy: null };
  const order = options.source?.order ?? (await orderRef(supabase, orderId));
  if (!order) return result;
  const documents =
    options.source?.documents ??
    (actor === "customer"
      ? (await customerDocuments(supabase)).filter((d) => d.order_id === orderId)
      : await opsDocuments(supabase, orderId));
  const missing = missingKinds(order.activatedAt, documents);
  result.existing = requiredKinds(order.activatedAt).filter((k) => !missing.includes(k));
  if (missing.length === 0) return result;

  const token = options.auth ?? (await accessTokenOf(supabase));
  if (!token) {
    for (const kind of missing) result.failed.push({ kind, error: "unauthorized" });
    return result;
  }
  const auth = typeof token === "string" ? { accessToken: token } : token;
  const env = options.env ?? storeEnv();
  const manual = async (reason: ManualCopyReason) => {
    result.manualCopy = reason;
    await storeManualCopyMarker(auth, orderId, reason, env);
    return result;
  };

  const folder = await folderOf(supabase, order);
  if (folder.manualCopy && !options.force) {
    result.manualCopy = "marked";
    return result;
  }
  let snapshot = options.snapshot ?? null;
  if (!snapshot) {
    if (!folder.snapshot) {
      const now = options.now ?? new Date();
      if (now.getTime() - Date.parse(order.acceptedAt) < SNAPSHOT_GRACE_MS) {
        for (const kind of missing) result.failed.push({ kind, error: "snapshot_pending" });
        return result;
      }
      // Derived from the folder on every look; no marker needed.
      result.manualCopy = "no_snapshot";
      return result;
    }
    snapshot = await readSnapshot(supabase, order, folder.snapshot);
    if (!snapshot) return manual("snapshot_invalid");
  }

  for (const kind of missing) {
    const textKind: TemplateKind = textKindOf(kind);
    const accepted = snapshot.texts[textKind];
    // The template of the accepted version, with the accepted hash.
    if (!acceptedTemplate(textKind, accepted.version, accepted.sha256)) {
      return manual("template_unavailable");
    }
    let pdf: Uint8Array;
    try {
      const doc = contractDocument(kind, inputFor(kind, snapshot, order));
      // The PDF's creation date is the acceptance (the activation for the
      // withdrawal confirmation): a retry renders the same bytes.
      const createdAt =
        kind === "withdrawal_confirmation" ? order.activatedAt! : snapshot.acceptedAt;
      pdf = await contractPdf(doc, new Date(createdAt));
    } catch {
      return manual("render_failed");
    }
    const stored = await storeContractDocument(
      auth,
      {
        orderId,
        kind,
        textVersion: accepted.version,
        textSha256: accepted.sha256,
        generator: CONTRACT_PDF_GENERATOR,
        pdf,
      },
      env,
    );
    if (stored.ok) {
      (stored.status === "created" ? result.created : result.existing).push(kind);
      continue;
    }
    const permanent = PERMANENT[stored.error];
    if (permanent) return manual(permanent);
    result.failed.push({ kind, error: stored.error });
  }
  return result;
}

// The same, never throwing: for page visits and background work, where a
// failure only means the documents are still being prepared.
export async function tryEnsureOrderDocuments(
  supabase: Client,
  actor: ContractActor,
  orderId: string,
  options: EnsureOptions = {},
): Promise<EnsureResult | null> {
  try {
    return await ensureOrderDocuments(supabase, actor, orderId, options);
  } catch {
    return null;
  }
}

// The fields documentState needs, from a service_order row.
export const stateRefOf = (o: {
  id: string;
  org_id: string;
  created_at: string;
  activated_at: string | null;
}) => ({ id: o.id, orgId: o.org_id, acceptedAt: o.created_at, activatedAt: o.activated_at });

// A retry of a page visit, after the response: the page shows "being
// prepared" at once and the next visit shows the documents.
export function retryAfterResponse(accessToken: string, orderId: string): void {
  after(() =>
    tryEnsureOrderDocuments(tokenClient(accessToken), "customer", orderId, {
      auth: { accessToken },
    }),
  );
}

// Right after customer_accept_quote (acceptQuoteAction, in after()): stores
// the acceptance snapshot of what the page showed and accepted, then renders
// both documents from it. Never throws.
export async function generateAfterAcceptance(args: {
  accessToken: string;
  orderId: string;
  shown: ContractInput;
  texts: Record<TemplateKind, AcceptedText>;
  env?: StoreEnv;
}): Promise<EnsureResult | null> {
  try {
    const env = args.env ?? storeEnv();
    const auth = { accessToken: args.accessToken };
    const supabase = tokenClient(args.accessToken, env);
    const order = await orderRef(supabase, args.orderId);
    if (!order) return null;
    const snapshot = acceptanceSnapshot(
      args.shown,
      contractOrderOf(order),
      order.acceptedAt,
      args.texts,
    );
    let stored = await storeAcceptanceSnapshot(auth, order.id, snapshot, env);
    // One more try for a transient failure (timeout, network, 5xx).
    if (!stored.ok && (stored.status === 0 || stored.status >= 500)) {
      stored = await storeAcceptanceSnapshot(auth, order.id, snapshot, env);
    }
    if (!stored.ok) return null;
    return await ensureOrderDocuments(supabase, "customer", order.id, {
      auth,
      env,
      // An existing snapshot (an earlier write) is read back instead.
      ...(stored.status === "created" ? { snapshot } : {}),
    });
  } catch {
    return null;
  }
}
