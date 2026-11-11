// The LiDAR values of a tree in one visit, as the expert sees them next to
// the crops (docs/3d-dunya.md §9.2): only the pipeline's (source algorithm)
// rows, the newest per visit, tree and metric. The expert's own values stay
// in the decision panel. Pure functions.

// Shown in this order; the unit is the metric's (lidar-olcumleri.md §6).
export const LIDAR_FACTS = [
  { code: "tree_height", unit: "m" },
  { code: "crown_diameter", unit: "m" },
  { code: "crown_volume", unit: "m3" },
  { code: "scaffold_branch_count", unit: "count" },
  { code: "pruning_cut_count", unit: "count" },
  { code: "pruning_status", unit: null },
] as const;
export type LidarFactCode = (typeof LIDAR_FACTS)[number]["code"];
// Read with the facts; shown as the suggestion, not as a value.
export const SIZE_CLASS_CODE = "size_class";
export const LIDAR_FACT_CODES: string[] = [...LIDAR_FACTS.map((f) => f.code), SIZE_CLASS_CODE];

export interface LidarFact {
  numeric: number | null;
  category: string | null;
  uncertainty: number | null;
  confidence: number | null;
}

export type LidarFacts = Partial<Record<LidarFactCode, LidarFact>>;

export interface LidarFactRow {
  id: string;
  session_id: string;
  tree_id: string | null;
  metric_definition_id: string;
  value_numeric: number | null;
  value_category: string | null;
  uncertainty: number | null;
  confidence: number | null;
  source: string;
  measured_at: string;
  created_at: string;
}

// visit -> tree -> values. Visits and trees without a value are left out.
export function lidarFactsBySession(
  defs: { id: string; code: string }[],
  rows: Iterable<LidarFactRow>,
): Map<string, Map<string, LidarFacts>> {
  const shown = new Set<string>(LIDAR_FACTS.map((f) => f.code));
  const codeOf = new Map(defs.filter((d) => shown.has(d.code)).map((d) => [d.id, d.code]));
  const best = new Map<string, LidarFactRow>();
  for (const row of rows) {
    if (!row.tree_id || row.source !== "algorithm" || !codeOf.has(row.metric_definition_id)) {
      continue;
    }
    if (row.value_numeric === null && row.value_category === null) continue;
    const key = `${row.session_id}|${row.tree_id}|${row.metric_definition_id}`;
    const current = best.get(key);
    if (!current || newer(row, current)) best.set(key, row);
  }
  const out = new Map<string, Map<string, LidarFacts>>();
  for (const row of best.values()) {
    let byTree = out.get(row.session_id);
    if (!byTree) out.set(row.session_id, (byTree = new Map()));
    const facts = byTree.get(row.tree_id!) ?? {};
    facts[codeOf.get(row.metric_definition_id) as LidarFactCode] = {
      numeric: row.value_numeric,
      category: row.value_category,
      uncertainty: row.uncertainty,
      confidence: row.confidence,
    };
    byTree.set(row.tree_id!, facts);
  }
  return out;
}

function newer(a: LidarFactRow, b: LidarFactRow): boolean {
  return (
    (Date.parse(a.measured_at) - Date.parse(b.measured_at) ||
      Date.parse(a.created_at) - Date.parse(b.created_at) ||
      (a.id > b.id ? 1 : -1)) > 0
  );
}

export function hasFacts(facts: LidarFacts | null | undefined): boolean {
  return !!facts && Object.keys(facts).length > 0;
}
