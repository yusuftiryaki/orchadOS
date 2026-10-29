import type { Database } from "@/lib/database.types";
import { inventorySummary, type InventorySummary } from "@/lib/expert/inventory-checks";
import type { LatLon } from "@/lib/office/local-frame";
import { loadInventoryWorkspace } from "@/lib/office/inventory-workspace";
import { isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import { parcelLegalFlags } from "./legal-flags";

// Boundary card of the owner's report card (MVP Module 2, step 10): the
// latest boundary version, the owner's first declaration, the approval, and
// the inventory summary once the expert has approved the inventory.

type Enums = Database["public"]["Enums"];

export interface BoundaryCardVersion {
  id: string;
  version: number;
  ring: LatLon[];
  source: Enums["boundary_source"];
  areaM2: number | null;
  vertexUncertaintyM: number | null;
  approvedAt: string | null;
  approvedByMe: boolean;
}

export interface BoundaryCard {
  latest: BoundaryCardVersion | null;
  // The owner's declared boundary (first version), drawn faint under the latest.
  declared: { version: number; ring: LatLon[] } | null;
  role: Enums["parcel_role"] | null;
  // An owner, and the latest version is an unapproved field survey.
  canApprove: boolean;
  // Waiting for an owner's approval (shown to viewers as well).
  awaitingApproval: boolean;
  inventory: { approvedAt: string | null; summary: InventorySummary } | null;
  // T16 (H07): approval shows and requires the boundary declaration.
  declarationRequired?: boolean;
  // T16 (contract Md. 6/4): an open boundary dispute suspends the evaluation.
  disputeOpen?: boolean;
}

// The owner's declaration on boundary approval, as the database records it
// (private.boundary_declaration(), contract Md. 6/2): shown verbatim.
export const BOUNDARY_DECLARATION =
  "Gösterdiğim sınırın fiilen kullandığım alan olduğunu ve ekibinizin bu alana girmesine izin vermeye yetkili olduğumu beyan ederim.";

// Whether a boundary dispute is open on the parcel (public.boundary_dispute_status);
// false on an older database without it.
export async function boundaryDisputeOpen(supabase: Client, parcelId: string): Promise<boolean> {
  if (!isUuid(parcelId)) return false;
  const { data, error } = await supabase.rpc("boundary_dispute_status", { p_parcel_id: parcelId });
  if (error) {
    if (error.code === "PGRST202") return false;
    throw error;
  }
  return (data as { open?: unknown } | null)?.open === true;
}

export async function loadBoundaryCard(
  supabase: Client,
  parcelId: string,
  userId: string,
): Promise<BoundaryCard | null> {
  const [ws, access, flags, disputeOpen] = await Promise.all([
    loadInventoryWorkspace(supabase, parcelId),
    supabase
      .from("parcel_access")
      .select("role")
      .eq("parcel_id", parcelId)
      .eq("user_id", userId)
      .maybeSingle(),
    parcelLegalFlags(supabase, parcelId),
    boundaryDisputeOpen(supabase, parcelId),
  ]);
  if (!ws) return null;
  if (access.error) throw access.error;
  const role = access.data?.role ?? null;

  const newest = ws.boundaries[0] ?? null;
  const declared = [...ws.boundaries].reverse().find((b) => b.source === "owner_declared") ?? null;
  const latest: BoundaryCardVersion | null = newest
    ? {
        id: newest.id,
        version: newest.version,
        ring: newest.ring,
        source: newest.source,
        areaM2: newest.areaM2,
        vertexUncertaintyM: newest.vertexUncertaintyM,
        approvedAt: newest.ownerApprovedAt,
        approvedByMe: newest.ownerApprovedBy === userId,
      }
    : null;
  const awaitingApproval = latest?.source === "field_survey" && !latest.approvedAt;

  return {
    latest,
    declared: declared && declared.id !== newest?.id ? declared : null,
    role,
    canApprove: awaitingApproval && role === "owner",
    awaitingApproval,
    declarationRequired: flags.boundaryDeclaration,
    disputeOpen,
    inventory: ws.approved
      ? {
          approvedAt: ws.inventorySession?.publishedAt ?? null,
          summary: inventorySummary(ws.slots),
        }
      : null,
  };
}

export type ApproveBoundaryResult =
  | { ok: true }
  | {
      ok: false;
      error: "forbidden" | "invalid_input" | "demo_read_only" | "declaration_required";
    };

// approve_boundary() refuses everyone but an owner of the parcel, and an
// already approved version.
export async function approveBoundary(
  supabase: Client,
  boundaryId: unknown,
  // T16: the owner ticked the declaration (required while the switch is on).
  declared = false,
): Promise<ApproveBoundaryResult> {
  if (!isUuid(boundaryId)) return { ok: false, error: "invalid_input" };
  const { error } = await supabase.rpc("approve_boundary", {
    p_boundary_id: boundaryId,
    ...(declared ? { p_declared: true } : {}),
  });
  if (error) {
    // A demo visitor (docs/demo-turu.md §6.3).
    if (error.message === "demo_read_only") return { ok: false, error: "demo_read_only" };
    if (error.message === "declaration_required")
      return { ok: false, error: "declaration_required" };
    return { ok: false, error: "forbidden" };
  }
  return { ok: true };
}
