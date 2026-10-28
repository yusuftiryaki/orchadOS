import type { ContractDocumentKind } from "@/lib/i18n/messages/contracts";
import { istanbulDay, type ContractInput, type ContractOrder } from "./model";
import type { TemplateKind } from "./templates";

// The acceptance snapshot (docs/musteri-yonetimi.md "Sözleşme belgeleri
// (T04)"): what the customer accepted, written once right after the
// acceptance and never changed. Every later rendering of the order's
// documents (a retry, ops, the wave-3 sweep) uses it and nothing read live,
// so a document always shows the buyer, the seller, the garden lines with
// their location, the quote and the text versions of the acceptance.
//
// Stored as JSON by the contract-documents Edge Function in the private
// bucket next to the PDFs, content-addressed:
// {org_id}/{order_id}/acceptance-{sha256 of the bytes}.json (one per order;
// the bucket refuses updates and deletes). Only the order's customer writes
// it, within minutes of the acceptance.

export const SNAPSHOT_SCHEMA = "contract-acceptance-v1";
export const SNAPSHOT_PREFIX = "acceptance-";

export interface AcceptedText {
  version: string;
  // The template hash the acceptance recorded (consent_record.text_sha256).
  sha256: string;
  // The hash of the filled rendering shown on the quote page.
  display_sha256: string;
}

export interface AcceptanceSnapshot {
  schema: typeof SNAPSHOT_SCHEMA;
  orderId: string;
  // service_order.created_at.
  acceptedAt: string;
  // The quote page's input with the order as created by the acceptance;
  // "today" is the acceptance day.
  input: ContractInput;
  texts: Record<TemplateKind, AcceptedText>;
}

export function acceptanceSnapshot(
  shown: ContractInput,
  order: ContractOrder,
  acceptedAt: string,
  texts: Record<TemplateKind, AcceptedText>,
): AcceptanceSnapshot {
  return {
    schema: SNAPSHOT_SCHEMA,
    orderId: order.id,
    acceptedAt,
    input: {
      ...shown,
      order,
      versions: {
        pre_information: texts.pre_information.version,
        distance_sales: texts.distance_sales.version,
      },
      today: istanbulDay(acceptedAt),
    },
    texts,
  };
}

const isText = (v: unknown): v is AcceptedText =>
  !!v &&
  typeof v === "object" &&
  typeof (v as AcceptedText).version === "string" &&
  /^[0-9a-f]{64}$/.test(String((v as AcceptedText).sha256));

// A stored snapshot, or null when it is not one of this order.
export function parseSnapshot(value: unknown, orderId: string): AcceptanceSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Partial<AcceptanceSnapshot>;
  if (s.schema !== SNAPSHOT_SCHEMA || s.orderId !== orderId) return null;
  if (typeof s.acceptedAt !== "string" || !s.input || typeof s.input !== "object") return null;
  if (s.input.order?.id !== orderId || !Array.isArray(s.input.lines) || !s.input.quote) return null;
  if (!isText(s.texts?.pre_information) || !isText(s.texts?.distance_sales)) return null;
  if (
    s.input.versions?.pre_information !== s.texts.pre_information.version ||
    s.input.versions?.distance_sales !== s.texts.distance_sales.version
  ) {
    return null;
  }
  return s as AcceptanceSnapshot;
}

// The input a document of the kind is rendered from. The acceptance documents
// show the order as the acceptance created it; the withdrawal confirmation
// adds the activation (payment) and the service period, which only come
// later and are facts of the order, not of what was shown.
export function inputFor(
  kind: ContractDocumentKind,
  snapshot: AcceptanceSnapshot,
  live: Pick<ContractOrder, "activatedAt" | "serviceStart" | "serviceEnd">,
): ContractInput {
  if (kind !== "withdrawal_confirmation") return snapshot.input;
  return {
    ...snapshot.input,
    order: {
      ...snapshot.input.order!,
      activatedAt: live.activatedAt,
      serviceStart: live.serviceStart,
      serviceEnd: live.serviceEnd,
    },
  };
}

// The snapshot's object name, from a listing of the order's folder: the
// earliest acceptance-*.json.
export function snapshotName(
  objects: { name: string; created_at?: string | null }[],
): { name: string; sha256: string } | null {
  const found = objects
    .filter((o) => /^acceptance-[0-9a-f]{64}\.json$/.test(o.name))
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))[0];
  return found ? { name: found.name, sha256: found.name.slice(SNAPSHOT_PREFIX.length, -5) } : null;
}

// The marker of an order whose documents cannot be produced automatically
// (docs/musteri-yonetimi.md "Sözleşme belgeleri (T04)"): {org_id}/{order_id}/manual-copy.json.
export const MANUAL_COPY_NAME = "manual-copy.json";

export const MANUAL_COPY_REASONS = [
  // No snapshot was stored at the acceptance (or the order predates it).
  "no_snapshot",
  "snapshot_invalid",
  // The accepted version has no template here, or not with the accepted hash.
  "template_unavailable",
  // The registration refused the version or the hash the order accepted.
  "version_mismatch",
  "invalid_input",
  "render_failed",
] as const;
export type ManualCopyReason = (typeof MANUAL_COPY_REASONS)[number];
