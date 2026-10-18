import type { Database } from "@/lib/database.types";
import {
  boundsOf,
  cleanPoint,
  cleanPolygon,
  isPoint,
  isPolygon,
  type Bounds,
  type FeatureCollection,
  type PointGeometry,
  type PolygonGeometry,
  type Position,
} from "@/lib/map/geo";
import { markerState, type HealthClass, type MarkerState } from "@/lib/map/tree-style";
import type { Client } from "@/lib/supabase/types";

// Data access for parcel pages. Every query runs as the signed-in user; which
// parcels come back is decided by row level security only.

type Enums = Database["public"]["Enums"];

export type ParcelSummary = Pick<
  Database["public"]["Tables"]["parcel"]["Row"],
  | "id"
  | "name"
  | "province"
  | "district"
  | "village"
  | "estimated_area_m2"
  | "estimated_tree_count"
  | "status"
>;

export async function listParcels(supabase: Client): Promise<ParcelSummary[]> {
  const { data, error } = await supabase
    .from("parcel")
    .select(
      "id, name, province, district, village, estimated_area_m2, estimated_tree_count, status",
    )
    .order("name");
  if (error) throw error;
  return data;
}

export interface TreeInfo {
  id: string;
  sex: Enums["tree_sex"];
  graft: Enums["graft_status"];
  ageClass: Enums["age_class"];
  cultivar: string | null;
  status: Enums["tree_status"];
  firstSeenAt: string | null;
  health: HealthClass | null;
}

export interface SlotProperties {
  slotId: string;
  code: string;
  kind: Enums["slot_kind"];
  state: MarkerState;
  // The active tree in the slot, if any (at most one, enforced by the schema).
  tree: TreeInfo | null;
}

export interface ParcelMapData {
  parcel: ParcelSummary;
  boundary: { version: number; geometry: PolygonGeometry } | null;
  slots: FeatureCollection<PointGeometry, SlotProperties>;
  activeTreeCount: number;
  bounds: Bounds | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PostgREST caps responses at [api].max_rows (1000); larger parcels need pages.
const PAGE_SIZE = 1000;

async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

// Returns null when the parcel does not exist or the user may not see it.
export async function getParcelMap(
  supabase: Client,
  parcelId: string,
): Promise<ParcelMapData | null> {
  if (!UUID_RE.test(parcelId)) return null;

  const { data: parcel, error: parcelError } = await supabase
    .from("parcel")
    .select(
      "id, name, province, district, village, estimated_area_m2, estimated_tree_count, status",
    )
    .eq("id", parcelId)
    .maybeSingle();
  if (parcelError) throw parcelError;
  if (!parcel) return null;

  const [boundaryResult, slotRows, assessmentRows] = await Promise.all([
    supabase
      .from("boundary")
      .select("version, geom::json")
      .eq("parcel_id", parcelId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    fetchAll((from, to) =>
      supabase
        .from("slot")
        .select(
          "id, code, kind, position::json, tree(id, sex, graft, age_class, cultivar, status, first_seen_at)",
        )
        .eq("parcel_id", parcelId)
        .order("row_no")
        .order("position_no")
        .order("code")
        .range(from, to),
    ),
    // Newest first, so the first row per tree is its latest assessment.
    fetchAll((from, to) =>
      supabase
        .from("assessment")
        .select("id, tree_id, overall_class, assessed_at")
        .eq("parcel_id", parcelId)
        .not("tree_id", "is", null)
        .order("assessed_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
  ]);
  if (boundaryResult.error) throw boundaryResult.error;

  const latestHealth = latestHealthByTree(assessmentRows);

  const boundaryGeom = boundaryResult.data?.geom;
  const boundary =
    boundaryResult.data && isPolygon(boundaryGeom)
      ? { version: boundaryResult.data.version, geometry: cleanPolygon(boundaryGeom) }
      : null;

  const slots = buildSlotFeatures(
    slotRows.map((row) => ({
      id: row.id,
      // Generated column; never null in practice.
      code: row.code ?? "",
      kind: row.kind,
      position: row.position,
      trees: row.tree.map((tree) => ({
        id: tree.id,
        sex: tree.sex,
        graft: tree.graft,
        ageClass: tree.age_class,
        cultivar: tree.cultivar,
        status: tree.status,
        firstSeenAt: tree.first_seen_at,
      })),
    })),
    latestHealth,
  );

  const positions: Position[] = boundary
    ? boundary.geometry.coordinates[0]
    : slots.features.map((f) => f.geometry.coordinates);

  return {
    parcel,
    boundary,
    slots,
    activeTreeCount: slots.features.filter((f) => f.properties.tree).length,
    bounds: boundsOf(positions),
  };
}

export function latestHealthByTree(
  rows: { tree_id: string | null; overall_class: HealthClass | null }[],
): Map<string, HealthClass | null> {
  const latest = new Map<string, HealthClass | null>();
  for (const row of rows) {
    if (row.tree_id && !latest.has(row.tree_id)) latest.set(row.tree_id, row.overall_class);
  }
  return latest;
}

export interface SlotInput {
  id: string;
  code: string;
  kind: Enums["slot_kind"];
  position: unknown;
  trees: Omit<TreeInfo, "health">[];
}

// Slots without a position cannot be drawn and are skipped.
export function buildSlotFeatures(
  slots: SlotInput[],
  latestHealth: Map<string, HealthClass | null>,
): FeatureCollection<PointGeometry, SlotProperties> {
  const features = [];
  for (const slot of slots) {
    if (!isPoint(slot.position)) continue;
    const active = slot.trees.find((tree) => tree.status === "active");
    const health = active ? (latestHealth.get(active.id) ?? null) : null;
    features.push({
      type: "Feature" as const,
      id: slot.id,
      geometry: cleanPoint(slot.position),
      properties: {
        slotId: slot.id,
        code: slot.code,
        kind: slot.kind,
        state: markerState(Boolean(active), health),
        tree: active ? { ...active, health } : null,
      },
    });
  }
  return { type: "FeatureCollection", features };
}
