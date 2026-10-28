import "server-only";
import { CONTRACT_KINDS, type ContractDocumentKind } from "@/lib/i18n/messages/contracts";
import { legalTextHash } from "@/lib/legal/text-hash";
import { CONTRACT_PDF_GENERATOR, contractPdf } from "@/lib/pdf/contract-pdf";
import type { Client } from "@/lib/supabase/types";
import { orderContractInput, type ContractActor } from "./load";
import { contractDocument, textKindOf } from "./render";
import { storeContractDocument, type StoreAuth, type StoreEnv } from "./store";

// Generating an order's missing contract documents (docs/musteri-yonetimi.md
// "Sözleşme belgeleri (T04)"): after the acceptance (acceptQuoteAction), on a
// visit of Sözleşmelerim or the order page (the customer), and from the ops
// screens (an ops user of the org). Idempotent: the Edge Function returns a
// document that already exists. A failure never undoes anything; the next
// visit retries.

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

export interface EnsureResult {
  created: ContractDocumentKind[];
  existing: ContractDocumentKind[];
  failed: { kind: ContractDocumentKind; error: string }[];
}

export async function accessTokenOf(supabase: Client): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Renders and stores the order's missing documents as the caller (customer
// or ops: the Edge Function authorises the token, not this function).
export async function ensureOrderDocuments(
  supabase: Client,
  actor: ContractActor,
  orderId: string,
  options: { auth?: StoreAuth; env?: StoreEnv; now?: Date } = {},
): Promise<EnsureResult> {
  const result: EnsureResult = { created: [], existing: [], failed: [] };
  const contract = await orderContractInput(supabase, actor, orderId);
  if (!contract) return result;
  const documents =
    actor === "customer"
      ? (await customerDocuments(supabase)).filter((d) => d.order_id === orderId)
      : await opsDocuments(supabase, orderId);
  const have = new Set(documents.map((d) => d.kind));
  const missing = requiredKinds(contract.input.order?.activatedAt ?? null).filter((k) => {
    if (have.has(k)) result.existing.push(k);
    return !have.has(k);
  });
  if (missing.length === 0) return result;

  const token = options.auth ?? (await accessTokenOf(supabase));
  if (!token) {
    for (const kind of missing) result.failed.push({ kind, error: "unauthorized" });
    return result;
  }
  const auth = typeof token === "string" ? { accessToken: token } : token;
  for (const kind of missing) {
    try {
      const doc = contractDocument(kind, contract.input);
      // The PDF's creation date is the acceptance (the activation for the
      // withdrawal confirmation): a retry renders the same bytes.
      const createdAt =
        kind === "withdrawal_confirmation"
          ? contract.input.order!.activatedAt!
          : contract.acceptedAt;
      const pdf = await contractPdf(doc, options.now ?? new Date(createdAt));
      const stored = await storeContractDocument(
        auth,
        {
          orderId,
          kind,
          textVersion: doc.version,
          textSha256: legalTextHash(textKindOf(kind)),
          generator: CONTRACT_PDF_GENERATOR,
          pdf,
        },
        options.env,
      );
      if (!stored.ok) result.failed.push({ kind, error: stored.error });
      else if (stored.status === "created") result.created.push(kind);
      else result.existing.push(kind);
    } catch {
      result.failed.push({ kind, error: "render_failed" });
    }
  }
  return result;
}

// The same, never throwing: for page visits, where a failure only means the
// documents are still being prepared.
export async function tryEnsureOrderDocuments(
  supabase: Client,
  actor: ContractActor,
  orderId: string,
): Promise<EnsureResult | null> {
  try {
    return await ensureOrderDocuments(supabase, actor, orderId);
  } catch {
    return null;
  }
}
