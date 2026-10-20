import type { Database } from "@/lib/database.types";
import { isPoint, isPolygon } from "@/lib/map/geo";
import { isUuid, UUID_RE } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import type { LatLon } from "./local-frame";
import { parcelLocalXY, planLayout, type ParcelGeometry, type PlanTree } from "./plan";
import { CORNERS, type Corner, type Numbering } from "./rows";
import { OFFICE_SESSION_KINDS, officeSessions } from "./sessions";

// Database side of the office tool. Every query runs as the signed-in user:
// row level security decides who may read the parcel; save_inventory() decides
// who may write the inventory (field staff and ops of the parcel's org).

type Enums = Database["public"]["Enums"];

export interface InventorySession {
  id: string;
  kind: Enums["session_kind"];
  status: Enums["session_status"];
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
      .select("id, kind, status, planned_date, started_at, created_at")
      .eq("parcel_id", parcelId)
      .in("kind", OFFICE_SESSION_KINDS)
      .neq("status", "cancelled"),
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
    sessions: officeSessions(sessions.data ?? []).map((s) => ({
      id: s.id,
      kind: s.kind,
      status: s.status,
      plannedDate: s.planned_date,
      startedAt: s.started_at,
    })),
    existing: { slots: slots.count ?? 0, trees: trees.count ?? 0 },
  };
}

// One trunk click behind a tree's position: a label for a trunk detector.
export interface SaveRay {
  // Panorama asset row (storage source); null for the local development source.
  panoramaAssetId: string | null;
  // GPS time of the panorama frame (ns, digits).
  gpsTimeNs: string | null;
  yawDeg: number;
  pitchDeg: number;
  azimuthDeg: number;
  clickedAt: string | null;
}

export interface SaveTree extends PlanTree {
  unsure: boolean;
  moved: boolean;
  rays: SaveRay[];
}

export interface SaveInventoryInput {
  parcelId: string;
  sessionId: string;
  numbering: Numbering;
  trees: SaveTree[];
}

export type SaveInventoryError =
  | "invalid_input"
  | "not_found"
  | "forbidden"
  | "session_invalid"
  | "existing_inventory"
  | "numbering_mismatch"
  | "numbering_forbidden"
  | "layout_failed"
  | "write_failed";

export type SaveInventoryResult =
  | { ok: true; slots: number; trees: number; empty: number; labels: number }
  | { ok: false; error: SaveInventoryError; detail?: string };

const MAX_TREES = 20000;
const MAX_RAYS = 20;
// Recorded with every trunk label (trunk_label.method_version).
export const OFFICE_TOOL_VERSION = "office-tool-0.2";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseRay(raw: unknown): SaveRay | null | "skip" {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const assetId = r.panoramaAssetId ?? null;
  const gps = r.gpsTimeNs ?? null;
  const clickedAt = r.clickedAt ?? null;
  if (
    (assetId !== null && !isUuid(assetId)) ||
    (gps !== null && !(typeof gps === "string" && /^\d{1,19}$/.test(gps))) ||
    !finite(r.yawDeg) ||
    !finite(r.pitchDeg) ||
    !finite(r.azimuthDeg) ||
    Math.abs(r.yawDeg) > 180 ||
    Math.abs(r.pitchDeg) > 90 ||
    !(r.azimuthDeg >= 0 && r.azimuthDeg < 360) ||
    (clickedAt !== null &&
      !(typeof clickedAt === "string" && Number.isFinite(Date.parse(clickedAt))))
  ) {
    return null;
  }
  // A click that names no panorama cannot be a label.
  if (assetId === null && gps === null) return "skip";
  return {
    panoramaAssetId: assetId,
    gpsTimeNs: gps,
    yawDeg: r.yawDeg,
    pitchDeg: r.pitchDeg,
    azimuthDeg: r.azimuthDeg,
    clickedAt,
  };
}

// Shape check of data that arrives from the browser.
export function parseSaveInput(raw: unknown): SaveInventoryInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const numbering = r.numbering as Record<string, unknown> | undefined;
  if (
    !isUuid(r.parcelId) ||
    !isUuid(r.sessionId) ||
    !numbering ||
    !CORNERS.includes(numbering.corner as Corner) ||
    !finite(numbering.rowAzimuthDeg) ||
    !Array.isArray(r.trees) ||
    r.trees.length > MAX_TREES
  ) {
    return null;
  }
  const trees: SaveTree[] = [];
  const ids = new Set<string>();
  for (const t of r.trees as Record<string, unknown>[]) {
    const rays = t?.rays ?? [];
    if (
      !t ||
      typeof t.id !== "string" ||
      ids.has(t.id) ||
      typeof t.lat !== "number" ||
      typeof t.lon !== "number" ||
      typeof t.uncertaintyM !== "number" ||
      !(Math.abs(t.lat) <= 90 && Math.abs(t.lon) <= 180) ||
      !(t.uncertaintyM >= 0 && t.uncertaintyM < 1000) ||
      !Array.isArray(rays) ||
      rays.length > MAX_RAYS
    ) {
      return null;
    }
    const parsed: SaveRay[] = [];
    for (const ray of rays) {
      const value = parseRay(ray);
      if (value === null) return null;
      if (value !== "skip") parsed.push(value);
    }
    ids.add(t.id);
    trees.push({
      id: t.id,
      lat: t.lat,
      lon: t.lon,
      uncertaintyM: t.uncertaintyM,
      unsure: t.unsure === true,
      moved: t.moved === true,
      rays: parsed,
    });
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

const DB_ERRORS = new Set<SaveInventoryError>([
  "invalid_input",
  "not_found",
  "forbidden",
  "session_invalid",
  "existing_inventory",
  "numbering_mismatch",
  "numbering_forbidden",
]);

// Writes the slots, trees and trunk labels of a first inventory in one
// transaction (save_inventory(), as the user). The database refuses when the
// parcel already has slots or trees (changing an existing inventory is a
// separate flow, later), when the caller is not field staff or ops, and when
// the numbering is new but the caller is not ops. Codes are recomputed here
// from the tree positions with the same function the preview uses.
export async function saveInventory(supabase: Client, raw: unknown): Promise<SaveInventoryResult> {
  const input = parseSaveInput(raw);
  if (!input) return { ok: false, error: "invalid_input" };

  const ctx = await loadInventoryContext(supabase, input.parcelId);
  if (!ctx) return { ok: false, error: "not_found" };
  if (!ctx.sessions.some((s) => s.id === input.sessionId)) {
    return { ok: false, error: "session_invalid" };
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

  const treeById = new Map(input.trees.map((t) => [t.id, t]));
  const origin = ctx.parcel.localOrigin;
  const slots = layout.slots.map((slot) => {
    const p = frame.toLatLon(slot.position);
    const local = origin ? parcelLocalXY(p, origin, input.numbering.rowAzimuthDeg) : null;
    const tree = slot.treeId ? treeById.get(slot.treeId) : undefined;
    return {
      row_no: slot.rowNo,
      position_no: slot.positionNo,
      suffix: slot.suffix,
      kind: slot.kind,
      lon: round(p.lon, 9),
      lat: round(p.lat, 9),
      uncertainty_m: round(slot.uncertaintyM, 3),
      local_x_m: local ? round(local.x, 3) : null,
      local_y_m: local ? round(local.y, 3) : null,
      tree: tree
        ? {
            unsure: tree.unsure,
            moved: tree.moved,
            labels: tree.rays.map((ray) => ({
              panorama_asset_id: ray.panoramaAssetId,
              panorama_gps_time_ns: ray.gpsTimeNs,
              yaw_deg: ray.yawDeg,
              pitch_deg: ray.pitchDeg,
              azimuth_deg: ray.azimuthDeg,
              labelled_at: ray.clickedAt,
            })),
          }
        : null,
    };
  });

  const { data, error } = await supabase.rpc("save_inventory", {
    p_parcel_id: ctx.parcel.id,
    p_session_id: input.sessionId,
    p_corner: input.numbering.corner,
    p_row_azimuth_deg: input.numbering.rowAzimuthDeg,
    p_slots:
      slots as unknown as Database["public"]["Functions"]["save_inventory"]["Args"]["p_slots"],
    p_method_version: OFFICE_TOOL_VERSION,
  });
  if (error) {
    // The function raises its reasons as the error message.
    const reason = error.message as SaveInventoryError;
    if (!DB_ERRORS.has(reason)) return { ok: false, error: "write_failed", detail: error.message };
    return reason === "existing_inventory" && error.details
      ? { ok: false, error: reason, detail: error.details }
      : { ok: false, error: reason };
  }
  const counts = data as { slots: number; trees: number; labels: number };
  return {
    ok: true,
    slots: counts.slots,
    trees: counts.trees,
    empty: counts.slots - counts.trees,
    labels: counts.labels,
  };
}
