import type { Database } from "@/lib/database.types";
import { inventorySummary, type InventorySummary } from "@/lib/expert/inventory-checks";
import type { LatLon } from "@/lib/office/local-frame";
import { loadInventoryWorkspace } from "@/lib/office/inventory-workspace";
import { isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";

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
}

export async function loadBoundaryCard(
  supabase: Client,
  parcelId: string,
  userId: string,
): Promise<BoundaryCard | null> {
  const [ws, access] = await Promise.all([
    loadInventoryWorkspace(supabase, parcelId),
    supabase
      .from("parcel_access")
      .select("role")
      .eq("parcel_id", parcelId)
      .eq("user_id", userId)
      .maybeSingle(),
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
    inventory: ws.approved
      ? {
          approvedAt: ws.inventorySession?.publishedAt ?? null,
          summary: inventorySummary(ws.slots),
        }
      : null,
  };
}

export type ApproveBoundaryResult =
  { ok: true } | { ok: false; error: "forbidden" | "invalid_input" | "demo_read_only" };

// approve_boundary() refuses everyone but an owner of the parcel, and an
// already approved version.
export async function approveBoundary(
  supabase: Client,
  boundaryId: unknown,
): Promise<ApproveBoundaryResult> {
  if (!isUuid(boundaryId)) return { ok: false, error: "invalid_input" };
  const { error } = await supabase.rpc("approve_boundary", { p_boundary_id: boundaryId });
  if (error) {
    // A demo visitor (docs/demo-turu.md §6.3).
    if (error.message === "demo_read_only") return { ok: false, error: "demo_read_only" };
    return { ok: false, error: "forbidden" };
  }
  return { ok: true };
}
