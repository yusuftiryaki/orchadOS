import type { Database } from "@/lib/database.types";
import { LocalFrame, type LatLon } from "@/lib/office/local-frame";
import {
  loadInventoryWorkspace,
  type WorkspaceSlot,
  type WorkspaceZone,
} from "@/lib/office/inventory-workspace";
import { fetchAll } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import { visitApprover, type Approver } from "./approver";

// Inventory report for the owner (docs/metodoloji.md section 9, "Envanter
// raporu"; contents from the expert agent's proposal of 27 October 2026,
// awaiting the pilot expert): a count and map report of the first visit. No
// health class or score: the inventory does not assess health. What stood
// out is given as counts only ("ilk gözlemler").
//
// buildInventoryReport() is pure; loadInventoryReport() reads the rows under
// the user's row level security (owners see the published inventory only).

type Enums = Database["public"]["Enums"];

// Above this share a difference to the owner's estimate, or the empty slots,
// get a warning (expert agent proposal).
export const NOTABLE_SHARE = 0.1;

export type ReportWarning =
  | "count_differs"
  | "area_differs"
  | "many_empty"
  | "ungrafted"
  | "uncertain_trees"
  | "coverage_below_threshold"
  | "boundary_unapproved";

export const INVENTORY_POINT_COLORS: Record<MapPoint["state"], string> = {
  tree: "#3f7d20",
  interstitial: "#2f6fb0",
  empty: "#c8ccc2",
  uncertain: "#d9822b",
};

export interface MapPoint {
  code: string;
  rowNo: number;
  // Metres from the south-west corner of the slots' bounding box.
  x: number;
  y: number;
  state: "tree" | "interstitial" | "empty" | "uncertain";
}

export interface InventoryReport {
  parcel: {
    id: string;
    name: string;
    place: string;
    estimatedTreeCount: number | null;
    estimatedAreaM2: number | null;
  };
  // The approved inventory visit; null while the expert has not approved it.
  inventory: {
    sessionId: string;
    date: string | null;
    approvedAt: string | null;
    // The approving expert (H05); null in the demo or unknown.
    approver?: Approver | null;
  } | null;
  boundary: {
    version: number;
    areaM2: number | null;
    fieldSurvey: boolean;
    approvedAt: string | null;
  } | null;
  counts: {
    slots: number;
    trees: number;
    rowTrees: number;
    interstitialTrees: number;
    emptySlots: number;
    rows: number;
  };
  // Counted trees against the owner's estimate.
  estimate: { declared: number; difference: number; share: number } | null;
  area: { declaredM2: number; measuredM2: number; share: number } | null;
  structure: {
    ages: Record<Enums["age_class"], number>;
    graft: Record<Enums["graft_status"], number>;
    stem: Record<Enums["stem_form"], number>;
    cultivars: { name: string; trees: number }[];
  };
  // Expert values of the inventory visit, counted per tree; null when none.
  observations: {
    deadLooking: number;
    dieback: number;
    denseSprouts: number;
    trunkDamage: number;
  } | null;
  infrastructure: { kind: Enums["zone_kind"]; count: number; lengthM: number | null }[];
  confidence: {
    coverage: { ratio: number; threshold: number; passed: boolean } | null;
    panoramas: number;
    uncertainTrees: number;
  };
  map: { width: number; height: number; points: MapPoint[] } | null;
  warnings: ReportWarning[];
}

export interface InventoryReportInput {
  parcel: InventoryReport["parcel"];
  inventory: InventoryReport["inventory"];
  boundary: InventoryReport["boundary"];
  slots: Pick<WorkspaceSlot, "code" | "rowNo" | "kind" | "position" | "tree" | "unsure">[];
  zones: Pick<WorkspaceZone, "kind" | "geometry">[];
  // Inventory visit measurements (tree id, metric code, value).
  measurements: {
    treeId: string;
    code: string;
    scale: number | null;
    category: string | null;
    boolean: boolean | null;
  }[];
  // Tree ids the expert classed dead in the inventory visit.
  deadTreeIds: string[];
  coverage: InventoryReport["confidence"]["coverage"];
  panoramas: number;
}

const zero = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

const AGES = ["sapling", "young", "productive", "old", "unknown"] as const;
const GRAFTS = ["grafted", "ungrafted", "unknown"] as const;
const STEMS = ["single", "multi", "unknown"] as const;

export function buildInventoryReport(input: InventoryReportInput): InventoryReport {
  const ages = zero(AGES);
  const graft = zero(GRAFTS);
  const stem = zero(STEMS);
  const cultivars = new Map<string, number>();
  let trees = 0;
  let interstitialTrees = 0;
  let uncertainTrees = 0;
  const rows = new Set<number>();
  for (const s of input.slots) {
    rows.add(s.rowNo);
    const t = s.tree;
    if (!t) continue;
    trees++;
    if (s.kind === "interstitial") interstitialTrees++;
    ages[t.ageClass]++;
    graft[t.graft]++;
    stem[t.stemForm]++;
    if (t.cultivar) cultivars.set(t.cultivar, (cultivars.get(t.cultivar) ?? 0) + 1);
    if (s.unsure || t.ageClass === "unknown") uncertainTrees++;
  }
  const emptySlots = input.slots.filter((s) => !s.tree).length;

  const declared = input.parcel.estimatedTreeCount;
  const estimate =
    declared && declared > 0
      ? { declared, difference: trees - declared, share: (trees - declared) / declared }
      : null;
  const measured = input.boundary?.areaM2 ?? null;
  const declaredArea = input.parcel.estimatedAreaM2;
  const area =
    measured && declaredArea && declaredArea > 0
      ? {
          declaredM2: declaredArea,
          measuredM2: measured,
          share: (measured - declaredArea) / declaredArea,
        }
      : null;

  const observations = summarizeObservations(input.measurements, input.deadTreeIds);

  const warnings: ReportWarning[] = [];
  if (estimate && Math.abs(estimate.share) > NOTABLE_SHARE) warnings.push("count_differs");
  if (area && Math.abs(area.share) > NOTABLE_SHARE) warnings.push("area_differs");
  if (input.slots.length > 0 && emptySlots / input.slots.length > NOTABLE_SHARE) {
    warnings.push("many_empty");
  }
  if (graft.ungrafted > 0) warnings.push("ungrafted");
  if (uncertainTrees > 0) warnings.push("uncertain_trees");
  if (input.coverage && !input.coverage.passed) warnings.push("coverage_below_threshold");
  if (input.boundary?.fieldSurvey && !input.boundary.approvedAt) {
    warnings.push("boundary_unapproved");
  }

  return {
    parcel: input.parcel,
    inventory: input.inventory,
    boundary: input.boundary,
    counts: {
      slots: input.slots.length,
      trees,
      rowTrees: trees - interstitialTrees,
      interstitialTrees,
      emptySlots,
      rows: rows.size,
    },
    estimate,
    area,
    structure: {
      ages,
      graft,
      stem,
      cultivars: [...cultivars]
        .map(([name, n]) => ({ name, trees: n }))
        .sort((a, b) => b.trees - a.trees || a.name.localeCompare(b.name, "tr")),
    },
    observations,
    infrastructure: infrastructure(input.zones),
    confidence: { coverage: input.coverage, panoramas: input.panoramas, uncertainTrees },
    map: projectSlots(input.slots),
    warnings,
  };
}

function summarizeObservations(
  rows: InventoryReportInput["measurements"],
  deadTreeIds: string[],
): InventoryReport["observations"] {
  if (rows.length === 0 && deadTreeIds.length === 0) return null;
  const trees = (pred: (r: InventoryReportInput["measurements"][number]) => boolean) =>
    new Set(rows.filter(pred).map((r) => r.treeId)).size;
  return {
    deadLooking: new Set(deadTreeIds).size,
    dieback: trees(
      (r) =>
        (r.code === "dieback_pattern" && r.category !== null && r.category !== "none") ||
        (r.code === "dried_leaves_attached" && r.boolean === true),
    ),
    denseSprouts: trees((r) => r.code === "basal_sprout_level" && r.category === "dense"),
    trunkDamage: trees((r) => r.code === "trunk_base_scale" && (r.scale ?? 0) >= 2),
  };
}

const ZONE_ORDER: Enums["zone_kind"][] = [
  "well",
  "pool",
  "irrigation_line",
  "fence",
  "gate",
  "shed",
];

function infrastructure(zones: InventoryReportInput["zones"]): InventoryReport["infrastructure"] {
  const out = new Map<Enums["zone_kind"], { count: number; lengthM: number | null }>();
  for (const z of zones) {
    if (!ZONE_ORDER.includes(z.kind)) continue;
    const entry = out.get(z.kind) ?? { count: 0, lengthM: null };
    entry.count++;
    if (z.geometry.type === "LineString") {
      entry.lengthM = (entry.lengthM ?? 0) + lineLength(z.geometry.coordinates);
    }
    out.set(z.kind, entry);
  }
  return ZONE_ORDER.filter((k) => out.has(k)).map((kind) => ({
    kind,
    count: out.get(kind)!.count,
    lengthM: out.get(kind)!.lengthM === null ? null : Math.round(out.get(kind)!.lengthM!),
  }));
}

function lineLength(coords: number[][]): number {
  if (coords.length < 2) return 0;
  const frame = new LocalFrame(coords[0][1], coords[0][0]);
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = frame.toLocal({ lat: coords[i - 1][1], lon: coords[i - 1][0] });
    const b = frame.toLocal({ lat: coords[i][1], lon: coords[i][0] });
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

// Slot positions in parcel metres, origin at the south-west corner, y north.
export function projectSlots(
  slots: Pick<WorkspaceSlot, "code" | "rowNo" | "kind" | "position" | "tree" | "unsure">[],
): InventoryReport["map"] {
  const placed = slots.filter((s): s is typeof s & { position: LatLon } => s.position !== null);
  if (placed.length === 0) return null;
  const lat0 = placed.reduce((a, s) => a + s.position.lat, 0) / placed.length;
  const lon0 = placed.reduce((a, s) => a + s.position.lon, 0) / placed.length;
  const frame = new LocalFrame(lat0, lon0);
  const local = placed.map((s) => ({ s, v: frame.toLocal(s.position) }));
  const minX = Math.min(...local.map((p) => p.v.x));
  const minY = Math.min(...local.map((p) => p.v.y));
  const maxX = Math.max(...local.map((p) => p.v.x));
  const maxY = Math.max(...local.map((p) => p.v.y));
  return {
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    points: local.map(({ s, v }) => ({
      code: s.code,
      rowNo: s.rowNo,
      x: v.x - minX,
      y: v.y - minY,
      state: !s.tree
        ? "empty"
        : s.unsure
          ? "uncertain"
          : s.kind === "interstitial"
            ? "interstitial"
            : "tree",
    })),
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const OBSERVATION_CODES = [
  "dieback_pattern",
  "dried_leaves_attached",
  "basal_sprout_level",
  "trunk_base_scale",
];

export async function loadInventoryReport(
  supabase: Client,
  parcelId: string,
): Promise<InventoryReport | null> {
  const [ws, parcelRow] = await Promise.all([
    loadInventoryWorkspace(supabase, parcelId),
    supabase
      .from("parcel")
      .select("id, name, province, district, village, estimated_area_m2, estimated_tree_count")
      .eq("id", parcelId)
      .maybeSingle(),
  ]);
  if (parcelRow.error) throw parcelRow.error;
  if (!ws || !parcelRow.data) return null;
  const p = parcelRow.data;
  const session = ws.approved ? ws.inventorySession : null;

  let measurements: InventoryReportInput["measurements"] = [];
  let deadTreeIds: string[] = [];
  let coverage: InventoryReportInput["coverage"] = null;
  let panoramas = 0;
  if (session) {
    const [rows, dead, cov, pano] = await Promise.all([
      fetchAll((from, to) =>
        supabase
          .from("measurement")
          .select(
            "tree_id, value_scale, value_category, value_boolean, metric_definition!inner(code)",
          )
          .eq("session_id", session.id)
          .eq("source", "expert")
          .in("metric_definition.code", OBSERVATION_CODES)
          .not("tree_id", "is", null)
          .order("id")
          .range(from, to),
      ),
      supabase
        .from("assessment")
        .select("tree_id")
        .eq("session_id", session.id)
        .eq("source", "expert")
        .eq("overall_class", "dead"),
      supabase
        .from("coverage_report")
        .select("ratio, threshold, passed, created_at")
        .eq("session_id", session.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("asset")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id)
        .eq("kind", "panorama"),
    ]);
    for (const r of [dead, cov, pano]) if (r.error) throw r.error;
    measurements = rows.map((r) => ({
      treeId: r.tree_id!,
      code: r.metric_definition.code,
      scale: r.value_scale,
      category: r.value_category,
      boolean: r.value_boolean,
    }));
    deadTreeIds = (dead.data ?? []).flatMap((r) => (r.tree_id ? [r.tree_id] : []));
    coverage = cov.data
      ? { ratio: cov.data.ratio ?? 0, threshold: cov.data.threshold, passed: !!cov.data.passed }
      : null;
    panoramas = pano.count ?? 0;
  }

  const newest = ws.boundaries[0] ?? null;
  return buildInventoryReport({
    parcel: {
      id: p.id,
      name: p.name,
      place: [p.village, p.district, p.province].filter(Boolean).join(", "),
      estimatedTreeCount: p.estimated_tree_count,
      estimatedAreaM2: p.estimated_area_m2,
    },
    inventory: session
      ? {
          sessionId: session.id,
          date: session.startedAt ?? session.plannedDate ?? null,
          approvedAt: session.publishedAt,
          approver: await visitApprover(supabase, session.id),
        }
      : null,
    boundary: newest
      ? {
          version: newest.version,
          areaM2: newest.areaM2,
          fieldSurvey: newest.source === "field_survey",
          approvedAt: newest.ownerApprovedAt,
        }
      : null,
    slots: ws.slots,
    zones: ws.zones,
    measurements,
    deadTreeIds,
    coverage,
    panoramas,
  });
}
