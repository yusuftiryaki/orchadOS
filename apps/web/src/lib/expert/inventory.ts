import type { Database } from "@/lib/database.types";
import { fetchAll, isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import { sessionTime } from "./season";

// Inventory approval (MVP Module 2, step 10): the expert's queue of saved but
// unapproved inventories and approve_inventory(). Runs as the signed-in user.

type Enums = Database["public"]["Enums"];

// An inventory session the expert can approve: processed by the pipeline and
// triangulated in the office (the parcel has slots).
export const INVENTORY_QUEUE_STATUSES: Enums["session_status"][] = [
  "captured",
  "processed",
  "in_review",
];

export interface InventoryQueueItem {
  sessionId: string;
  parcelId: string;
  parcelName: string;
  status: Enums["session_status"];
  time: string;
  slots: number;
  trees: number;
  openItems: number;
}

export async function listInventoryQueue(supabase: Client): Promise<InventoryQueueItem[]> {
  const { data: sessions, error } = await supabase
    .from("session")
    .select("id, parcel_id, status, started_at, planned_date, created_at")
    .eq("kind", "inventory")
    .in("status", INVENTORY_QUEUE_STATUSES);
  if (error) throw error;
  if (sessions.length === 0) return [];

  const parcelIds = [...new Set(sessions.map((s) => s.parcel_id))];
  const [parcels, approved, slots, items] = await Promise.all([
    supabase.from("parcel").select("id, name").in("id", parcelIds),
    supabase
      .from("session")
      .select("parcel_id")
      .eq("kind", "inventory")
      .eq("status", "published")
      .in("parcel_id", parcelIds),
    fetchAll((from, to) =>
      supabase
        .from("slot")
        .select("id, parcel_id, tree(status)")
        .in("parcel_id", parcelIds)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("verification_item")
        .select("id, parcel_id")
        .in("parcel_id", parcelIds)
        .eq("status", "open")
        .order("id")
        .range(from, to),
    ),
  ]);
  if (parcels.error) throw parcels.error;
  if (approved.error) throw approved.error;

  const done = new Set(approved.data.map((s) => s.parcel_id));
  const name = new Map(parcels.data.map((p) => [p.id, p.name]));
  const count = (rows: { parcel_id: string }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.parcel_id, (m.get(r.parcel_id) ?? 0) + 1);
    return m;
  };
  const slotCount = count(slots);
  const treeCount = count(slots.filter((s) => (s.tree ?? []).some((t) => t.status === "active")));
  const openCount = count(items);

  return sessions
    .filter((s) => !done.has(s.parcel_id) && (slotCount.get(s.parcel_id) ?? 0) > 0)
    .map((s) => ({
      sessionId: s.id,
      parcelId: s.parcel_id,
      parcelName: name.get(s.parcel_id) ?? "",
      status: s.status,
      time: sessionTime(s),
      slots: slotCount.get(s.parcel_id) ?? 0,
      trees: treeCount.get(s.parcel_id) ?? 0,
      openItems: openCount.get(s.parcel_id) ?? 0,
    }))
    .sort(
      (a, b) => Date.parse(a.time) - Date.parse(b.time) || a.sessionId.localeCompare(b.sessionId),
    );
}

// The inventory session row behind /uzman/envanter/<session>; null when not
// visible or not an inventory session.
export async function getInventorySession(supabase: Client, sessionId: string) {
  if (!isUuid(sessionId)) return null;
  const { data, error } = await supabase
    .from("session")
    .select("id, parcel_id, kind, status, started_at, planned_date, created_at, published_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.kind !== "inventory") return null;
  return data;
}

export type ApproveInventoryError =
  "forbidden" | "session_invalid" | "already_published" | "inventory_incomplete" | "write_failed";

export type ApproveInventoryResult =
  | { ok: true; publishedAt: string }
  | {
      ok: false;
      error: ApproveInventoryError;
      // inventory_incomplete: what is missing.
      noSlots?: boolean;
      openItems?: string[];
      detail?: string;
    };

// Parses approve_inventory()'s detail: "no_slots; open_items: S1-2, S3-4".
export function parseIncomplete(detail: string | null | undefined): {
  noSlots: boolean;
  openItems: string[];
} {
  const parts = (detail ?? "").split(";").map((p) => p.trim());
  const open = parts.find((p) => p.startsWith("open_items:"));
  return {
    noSlots: parts.includes("no_slots"),
    openItems: open
      ? open
          .slice("open_items:".length)
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : [],
  };
}

export async function approveInventory(
  supabase: Client,
  sessionId: unknown,
): Promise<ApproveInventoryResult> {
  if (!isUuid(sessionId)) return { ok: false, error: "session_invalid" };
  const { data, error } = await supabase.rpc("approve_inventory", { p_session_id: sessionId });
  if (error) {
    const reason = error.message as ApproveInventoryError;
    if (reason === "inventory_incomplete") {
      return { ok: false, error: reason, ...parseIncomplete(error.details) };
    }
    if (["forbidden", "session_invalid", "already_published"].includes(reason)) {
      return { ok: false, error: reason };
    }
    return { ok: false, error: "write_failed", detail: error.message };
  }
  return { ok: true, publishedAt: data.published_at ?? new Date().toISOString() };
}
