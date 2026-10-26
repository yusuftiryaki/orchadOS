import type { Database } from "@/lib/database.types";
import type { HealthClass } from "@/lib/map/tree-style";
import type { MeasurementRow, MetricDef } from "./metrics";

// Report card dimensions besides health (docs/MVP.md Module 5, "Parsel
// karnesi"; docs/metodoloji.md section 9): inventory and its change, orchard
// structure, care compliance, pest signs, fruit load. Pure functions over the
// rows of src/lib/portal/data.ts.

type Enums = Database["public"]["Enums"];

export interface DimensionSlot {
  code: string;
  rowNo: number | null;
  kind: Enums["slot_kind"];
  // Trees of the slot, active and lost.
  trees: {
    id: string;
    status: Enums["tree_status"];
    sex: Enums["tree_sex"];
    graft: Enums["graft_status"];
    ageClass: Enums["age_class"];
    firstSeenAt: string | null;
    lostAt: string | null;
  }[];
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface InventoryDimension {
  slots: number;
  trees: number;
  emptySlots: number;
  interstitial: number;
  // Since the previous visit (null on the first one).
  lost: string[] | null;
  added: string[] | null;
}

const within = (t: string | null, after: string, until: string) =>
  t !== null && Date.parse(t) > Date.parse(after) && Date.parse(t) <= Date.parse(until);

// Lost: a tree marked lost, or found absent in the latest visit while it was
// not absent in the previous one. New: a tree first seen between the visits.
export function inventoryDimension(
  slots: DimensionSlot[],
  latest: { time: string; classes: Map<string, HealthClass | null> } | null,
  previous: { time: string; classes: Map<string, HealthClass | null> } | null,
): InventoryDimension {
  let trees = 0;
  let emptySlots = 0;
  let interstitial = 0;
  const lost = new Set<string>();
  const added = new Set<string>();
  for (const slot of slots) {
    const active = slot.trees.find((t) => t.status === "active");
    if (active) {
      trees += 1;
      if (slot.kind === "interstitial") interstitial += 1;
    } else {
      emptySlots += 1;
    }
    if (!latest || !previous) continue;
    for (const tree of slot.trees) {
      if (tree.status === "lost" && within(tree.lostAt, previous.time, latest.time)) {
        lost.add(slot.code);
      }
      if (
        tree.status === "active" &&
        latest.classes.get(tree.id) === "absent" &&
        previous.classes.get(tree.id) !== "absent"
      ) {
        lost.add(slot.code);
      }
      if (within(tree.firstSeenAt, previous.time, latest.time)) added.add(slot.code);
    }
  }
  const sorted = (s: Set<string>) =>
    [...s].sort((a, b) => a.localeCompare(b, "tr", { numeric: true }));
  return {
    slots: slots.length,
    trees,
    emptySlots,
    interstitial,
    lost: latest && previous ? sorted(lost) : null,
    added: latest && previous ? sorted(added) : null,
  };
}

// ---------------------------------------------------------------------------
// Orchard structure
// ---------------------------------------------------------------------------

export interface StructureDimension {
  female: number;
  male: number;
  unknownSex: number;
  // Females per male (one decimal), null without both.
  femalesPerMale: number | null;
  // Recommended: 1 male to 8-10 females (docs/MVP.md).
  ratioAdvice: "low_males" | "ok" | "many_males" | null;
  ungrafted: number;
  ages: Record<Enums["age_class"], number>;
}

export function structureDimension(slots: DimensionSlot[]): StructureDimension {
  const ages: Record<Enums["age_class"], number> = {
    sapling: 0,
    young: 0,
    productive: 0,
    old: 0,
    unknown: 0,
  };
  let female = 0;
  let male = 0;
  let unknownSex = 0;
  let ungrafted = 0;
  for (const slot of slots) {
    const tree = slot.trees.find((t) => t.status === "active");
    if (!tree) continue;
    if (tree.sex === "female") female += 1;
    else if (tree.sex === "male") male += 1;
    else unknownSex += 1;
    if (tree.graft === "ungrafted") ungrafted += 1;
    ages[tree.ageClass] += 1;
  }
  const femalesPerMale = female > 0 && male > 0 ? Math.round((female / male) * 10) / 10 : null;
  let ratioAdvice: StructureDimension["ratioAdvice"] = null;
  if (femalesPerMale !== null) {
    ratioAdvice = femalesPerMale > 10 ? "low_males" : femalesPerMale < 8 ? "many_males" : "ok";
  }
  return { female, male, unknownSex, femalesPerMale, ratioAdvice, ungrafted, ages };
}

// ---------------------------------------------------------------------------
// Measured dimensions of a visit
// ---------------------------------------------------------------------------

// Picked measurements (one per tree and metric) of one visit, by metric code.
export function valuesByCode(
  defs: MetricDef[],
  rows: MeasurementRow[],
): Map<string, MeasurementRow[]> {
  const codeOf = new Map(defs.map((d) => [d.id, d.code]));
  const out = new Map<string, MeasurementRow[]>();
  for (const row of rows) {
    const code = codeOf.get(row.metric_definition_id);
    if (!code) continue;
    out.set(code, [...(out.get(code) ?? []), row]);
  }
  return out;
}

export interface CareDimension {
  // Pruning (winter): trees with a value, and done / partial / not done.
  pruning: { total: number; done: number; partial: number; notDone: number } | null;
  // Harvest: trees with a value and those completed.
  harvest: { total: number; complete: number } | null;
}

export function careDimension(values: Map<string, MeasurementRow[]>): CareDimension {
  const pruningRows = (values.get("pruning_status") ?? []).filter((r) => r.tree_id);
  const harvestRows = (values.get("harvest_complete") ?? []).filter(
    (r) => r.tree_id && r.value_boolean !== null,
  );
  const count = (v: string) => pruningRows.filter((r) => r.value_category === v).length;
  return {
    pruning:
      pruningRows.length > 0
        ? {
            total: pruningRows.length,
            done: count("done"),
            partial: count("partial"),
            notDone: count("not_done"),
          }
        : null,
    harvest:
      harvestRows.length > 0
        ? {
            total: harvestRows.length,
            complete: harvestRows.filter((r) => r.value_boolean).length,
          }
        : null,
  };
}

export interface PestDimension {
  assessed: number;
  mild: number;
  marked: number;
  // Pest type counts among the trees with signs.
  types: Record<string, number>;
  // Rows with signs, ascending.
  rows: number[];
}

export function pestDimension(
  values: Map<string, MeasurementRow[]>,
  rowOfTree: Map<string, number | null>,
): PestDimension | null {
  const severity = (values.get("pest_sign_severity") ?? []).filter((r) => r.tree_id);
  if (severity.length === 0) return null;
  const signed = new Set(
    severity
      .filter((r) => r.value_category === "mild" || r.value_category === "marked")
      .map((r) => r.tree_id!),
  );
  const types: Record<string, number> = {};
  for (const r of values.get("pest_sign_type") ?? []) {
    if (!r.tree_id || !signed.has(r.tree_id) || !r.value_category) continue;
    types[r.value_category] = (types[r.value_category] ?? 0) + 1;
  }
  const rows = new Set<number>();
  for (const id of signed) {
    const row = rowOfTree.get(id);
    if (row != null) rows.add(row);
  }
  return {
    assessed: severity.length,
    mild: severity.filter((r) => r.value_category === "mild").length,
    marked: severity.filter((r) => r.value_category === "marked").length,
    types,
    rows: [...rows].sort((a, b) => a - b),
  };
}

export interface FruitLoadDimension {
  counts: [number, number, number, number];
  total: number;
  mean: number;
  // Same summer visit a year before, if any.
  previousYear: { time: string; mean: number } | null;
  // Alternate bearing reading against last year: a difference of half a
  // step or more.
  trend: "higher" | "lower" | "similar" | null;
}

function fruitStats(rows: MeasurementRow[]) {
  const values = rows
    .filter((r) => r.tree_id && r.value_scale !== null)
    .map((r) => Math.max(0, Math.min(3, r.value_scale!)));
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const v of values) counts[v] += 1;
  const mean = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
  return { counts, total: values.length, mean: Math.round(mean * 100) / 100 };
}

export function fruitLoadDimension(
  current: Map<string, MeasurementRow[]>,
  previousYear: { time: string; values: Map<string, MeasurementRow[]> } | null,
): FruitLoadDimension | null {
  const now = fruitStats(current.get("fruit_load_scale") ?? []);
  if (now.total === 0) return null;
  const before = previousYear
    ? fruitStats(previousYear.values.get("fruit_load_scale") ?? [])
    : null;
  const prev =
    previousYear && before && before.total > 0
      ? { time: previousYear.time, mean: before.mean }
      : null;
  let trend: FruitLoadDimension["trend"] = null;
  if (prev) {
    const d = now.mean - prev.mean;
    trend = d >= 0.5 ? "higher" : d <= -0.5 ? "lower" : "similar";
  }
  return { ...now, previousYear: prev, trend };
}

// The visit a year before `time` in the same season window: published, 300 to
// 430 days earlier. Visits newest first.
export function previousYearVisit<T extends { time: string }>(visits: T[], time: string): T | null {
  const t = Date.parse(time);
  const day = 86_400_000;
  return (
    visits.find((v) => {
      const d = (t - Date.parse(v.time)) / day;
      return d >= 300 && d <= 430;
    }) ?? null
  );
}
