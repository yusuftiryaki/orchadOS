import type { Database } from "@/lib/database.types";
import { isPoint, isPolygon } from "@/lib/map/geo";
import type { Client } from "@/lib/supabase/types";
import type { LatLon } from "./local-frame";
import { parcelLocalXY, planLayout, type ParcelGeometry, type PlanTree } from "./plan";
import { CORNERS, type Corner, type Numbering } from "./rows";

// Database side of the office tool. Every query runs as the signed-in user:
// row level security decides who may read the parcel and who may write slots
// and trees (field staff, expert, ops of the parcel's org).

type SessionStatus = Database["public"]["Enums"]["session_status"];

export interface InventorySession {
  id: string;
  status: SessionStatus;
  plannedDate: string | null;
  startedAt: string | null;
}

export interface InventoryContext {
  parcel: {
    id: string;
    orgId: string;
    name: string;
    numbering: Numbering | null;
    localOrigin: LatLon | null;
  };
  geometry: ParcelGeometry;
  boundaryVersion: number | null;
  sessions: InventorySession[];
  existing: { slots: number; trees: number };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toLatLon(coords: [number, number]): LatLon {
  return { lat: coords[1], lon: coords[0] };
}

// Null when the parcel does not exist or the user may not see it.
export async function loadInventoryContext(
  supabase: Client,
  parcelId: string,
): Promise<InventoryContext | null> {
  if (!UUID_RE.test(parcelId)) return null;
  const { data: parcel, error } = await supabase
    .from("parcel")
    .select("id, org_id, name, numbering_origin_corner, row_azimuth_deg, local_origin::json")
    .eq("id", parcelId)
    .maybeSingle();
  if (error) throw error;
  if (!parcel) return null;

  const [boundary, sessions, slots, trees] = await Promise.all([
    supabase
      .from("boundary")
      .select("version, geom::json")
      .eq("parcel_id", parcelId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("session")
      .select("id, status, planned_date, started_at")
      .eq("parcel_id", parcelId)
      .eq("kind", "inventory")
      .neq("status", "cancelled")
      .order("started_at", { ascending: false, nullsFirst: false })
      .order("planned_date", { ascending: false }),
    supabase.from("slot").select("id", { count: "exact", head: true }).eq("parcel_id", parcelId),
    supabase.from("tree").select("id", { count: "exact", head: true }).eq("parcel_id", parcelId),
  ]);
  for (const result of [boundary, sessions, slots, trees]) if (result.error) throw result.error;

  const geom = boundary.data?.geom;
  const origin = parcel.local_origin;
  const numbering =
    parcel.numbering_origin_corner && parcel.row_azimuth_deg != null
      ? { corner: parcel.numbering_origin_corner, rowAzimuthDeg: parcel.row_azimuth_deg }
      : null;

  return {
    parcel: {
      id: parcel.id,
      orgId: parcel.org_id,
      name: parcel.name,
      numbering,
      localOrigin: isPoint(origin) ? toLatLon(origin.coordinates) : null,
    },
    geometry: {
      boundary: isPolygon(geom) ? geom.coordinates[0].map((c) => toLatLon([c[0], c[1]])) : null,
      localOrigin: isPoint(origin) ? toLatLon(origin.coordinates) : null,
    },
    boundaryVersion: isPolygon(geom) ? (boundary.data?.version ?? null) : null,
    sessions: (sessions.data ?? []).map((s) => ({
      id: s.id,
      status: s.status,
      plannedDate: s.planned_date,
      startedAt: s.started_at,
    })),
    existing: { slots: slots.count ?? 0, trees: trees.count ?? 0 },
  };
}

export interface SaveInventoryInput {
  parcelId: string;
  sessionId: string;
  numbering: Numbering;
  trees: PlanTree[];
}

export type SaveInventoryError =
  | "invalid_input"
  | "not_found"
  | "session_invalid"
  | "existing_inventory"
  | "numbering_mismatch"
  | "numbering_forbidden"
  | "layout_failed"
  | "write_failed";

export type SaveInventoryResult =
  | { ok: true; slots: number; trees: number; empty: number }
  | { ok: false; error: SaveInventoryError; detail?: string };

const MAX_TREES = 20000;

// Shape check of data that arrives from the browser.
export function parseSaveInput(raw: unknown): SaveInventoryInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const numbering = r.numbering as Record<string, unknown> | undefined;
  if (
    typeof r.parcelId !== "string" ||
    !UUID_RE.test(r.parcelId) ||
    typeof r.sessionId !== "string" ||
    !UUID_RE.test(r.sessionId) ||
    !numbering ||
    !CORNERS.includes(numbering.corner as Corner) ||
    typeof numbering.rowAzimuthDeg !== "number" ||
    !Number.isFinite(numbering.rowAzimuthDeg) ||
    !Array.isArray(r.trees) ||
    r.trees.length > MAX_TREES
  ) {
    return null;
  }
  const trees: PlanTree[] = [];
  const ids = new Set<string>();
  for (const t of r.trees as Record<string, unknown>[]) {
    if (
      !t ||
      typeof t.id !== "string" ||
      ids.has(t.id) ||
      typeof t.lat !== "number" ||
      typeof t.lon !== "number" ||
      typeof t.uncertaintyM !== "number" ||
      !(Math.abs(t.lat) <= 90 && Math.abs(t.lon) <= 180) ||
      !(t.uncertaintyM >= 0 && t.uncertaintyM < 1000)
    ) {
      return null;
    }
    ids.add(t.id);
    trees.push({ id: t.id, lat: t.lat, lon: t.lon, uncertaintyM: t.uncertaintyM });
  }
  return {
    parcelId: r.parcelId,
    sessionId: r.sessionId,
    numbering: {
      corner: numbering.corner as Corner,
      rowAzimuthDeg: ((numbering.rowAzimuthDeg % 360) + 360) % 360,
    },
    trees,
  };
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function message(error: unknown): string {
  return error && typeof error === "object" && "message" in error
    ? String((error as { message: unknown }).message)
    : String(error);
}

// Writes the slots and trees of a first inventory, linked to the inventory
// session. Refuses when the parcel already has slots or trees: changing an
// existing inventory is a separate flow (later). Codes are recomputed here
// from the tree positions with the same function the preview uses.
//
// Not atomic: slots and trees are two inserts. If the tree insert fails the
// slots just written are deleted again, which RLS allows to ops only; see the
// README for the RPC that would make this one transaction.
export async function saveInventory(supabase: Client, raw: unknown): Promise<SaveInventoryResult> {
  const input = parseSaveInput(raw);
  if (!input) return { ok: false, error: "invalid_input" };

  const ctx = await loadInventoryContext(supabase, input.parcelId);
  if (!ctx) return { ok: false, error: "not_found" };
  const session = ctx.sessions.find((s) => s.id === input.sessionId);
  if (!session) return { ok: false, error: "session_invalid" };
  if (ctx.existing.slots > 0 || ctx.existing.trees > 0) {
    return {
      ok: false,
      error: "existing_inventory",
      detail: `${ctx.existing.slots}/${ctx.existing.trees}`,
    };
  }
  const recorded = ctx.parcel.numbering;
  if (
    recorded &&
    (recorded.corner !== input.numbering.corner ||
      Math.abs(recorded.rowAzimuthDeg - input.numbering.rowAzimuthDeg) > 1e-6)
  ) {
    return { ok: false, error: "numbering_mismatch" };
  }

  const plan = planLayout(ctx.geometry, input.trees, input.numbering);
  if (!plan || !plan.layout.ok) {
    return {
      ok: false,
      error: "layout_failed",
      detail: plan?.layout.ok === false ? plan.layout.reason : undefined,
    };
  }
  const { layout, frame } = plan;

  // Slot numbering is chosen once per parcel (MVP Module 2). Only ops may
  // update a parcel; RLS hides the row from everyone else.
  if (!recorded) {
    const { data, error } = await supabase
      .from("parcel")
      .update({
        numbering_origin_corner: input.numbering.corner,
        row_azimuth_deg: input.numbering.rowAzimuthDeg,
      })
      .eq("id", ctx.parcel.id)
      .select("id");
    if (error) return { ok: false, error: "write_failed", detail: message(error) };
    if (!data || data.length === 0) return { ok: false, error: "numbering_forbidden" };
  }

  const origin = ctx.parcel.localOrigin;
  const slotRows = layout.slots.map((slot) => {
    const p = frame.toLatLon(slot.position);
    const local = origin ? parcelLocalXY(p, origin, input.numbering.rowAzimuthDeg) : null;
    return {
      org_id: ctx.parcel.orgId,
      parcel_id: ctx.parcel.id,
      row_no: slot.rowNo,
      position_no: slot.positionNo,
      suffix: slot.suffix,
      kind: slot.kind,
      position: `SRID=4326;POINT(${p.lon.toFixed(9)} ${p.lat.toFixed(9)})`,
      position_uncertainty_m: round(slot.uncertaintyM, 3),
      local_x_m: local ? round(local.x, 3) : null,
      local_y_m: local ? round(local.y, 3) : null,
    };
  });
  const inserted = await supabase.from("slot").insert(slotRows).select("id, code");
  if (inserted.error) return { ok: false, error: "write_failed", detail: message(inserted.error) };

  const slotIdByCode = new Map(inserted.data.map((s) => [s.code, s.id]));
  const firstSeenAt = session.startedAt ?? new Date().toISOString();
  const treeRows = layout.slots
    .filter((slot) => slot.treeId)
    .map((slot) => ({
      org_id: ctx.parcel.orgId,
      parcel_id: ctx.parcel.id,
      slot_id: slotIdByCode.get(slot.code)!,
      first_seen_at: firstSeenAt,
      first_seen_session_id: session.id,
    }));
  const treesInserted = await supabase.from("tree").insert(treeRows);
  if (treesInserted.error) {
    await supabase
      .from("slot")
      .delete()
      .in(
        "id",
        inserted.data.map((s) => s.id),
      );
    return { ok: false, error: "write_failed", detail: message(treesInserted.error) };
  }

  return {
    ok: true,
    slots: slotRows.length,
    trees: treeRows.length,
    empty: slotRows.length - treeRows.length,
  };
}
