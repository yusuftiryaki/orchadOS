import type { Database } from "@/lib/database.types";

// Report card metrics: which values to show and how to summarise them.

type Enums = Database["public"]["Enums"];
export type MeasurementSource = Enums["measurement_source"];

export interface MetricDef {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  value_type: Enums["metric_value_type"];
  scale_min: number | null;
  scale_max: number | null;
  categories: string[] | null;
  card_visibility: Enums["card_visibility"];
}

export interface MeasurementRow {
  id: string;
  session_id: string;
  tree_id: string | null;
  metric_definition_id: string;
  value_numeric: number | null;
  value_scale: number | null;
  value_category: string | null;
  value_boolean: boolean | null;
  uncertainty: number | null;
  source: MeasurementSource;
  measured_at: string;
  created_at: string;
}

const SOURCE_RANK: Record<MeasurementSource, number> = {
  expert: 0,
  algorithm: 1,
  staff: 2,
  ai: 3,
};

export type MetricValue =
  | { type: "numeric"; value: number; unit: string | null; uncertainty: number | null }
  | { type: "scale"; value: number; max: number | null }
  | { type: "category"; value: string }
  | { type: "boolean"; value: boolean };

// Only metrics marked for the report card reach the owner.
export function cardMetrics<T extends Pick<MetricDef, "card_visibility">>(defs: T[]): T[] {
  return defs.filter((d) => d.card_visibility === "shown");
}

// One measurement per (subject, metric) within a session: expert > algorithm
// > staff > ai, then the newest (docs/veri-modeli.md, "Gösterilecek değer").
export function pickMeasurements(rows: Iterable<MeasurementRow>): MeasurementRow[] {
  const best = new Map<string, MeasurementRow>();
  for (const row of rows) {
    const key = `${row.session_id}|${row.tree_id ?? "parcel"}|${row.metric_definition_id}`;
    const current = best.get(key);
    if (!current || compareMeasurements(row, current) < 0) best.set(key, row);
  }
  return [...best.values()];
}

function compareMeasurements(a: MeasurementRow, b: MeasurementRow): number {
  return (
    SOURCE_RANK[a.source] - SOURCE_RANK[b.source] ||
    Date.parse(b.measured_at) - Date.parse(a.measured_at) ||
    Date.parse(b.created_at) - Date.parse(a.created_at) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function metricValue(def: MetricDef, row: MeasurementRow): MetricValue | null {
  if (row.value_numeric !== null)
    return {
      type: "numeric",
      value: row.value_numeric,
      unit: def.unit,
      uncertainty: row.uncertainty,
    };
  if (row.value_scale !== null)
    return { type: "scale", value: row.value_scale, max: def.scale_max };
  if (row.value_category !== null) return { type: "category", value: row.value_category };
  if (row.value_boolean !== null) return { type: "boolean", value: row.value_boolean };
  return null;
}

export type MetricSummary =
  | { type: "numeric"; mean: number; min: number; max: number; unit: string | null }
  | { type: "scale"; counts: { value: number; count: number }[] }
  | { type: "category"; counts: { value: string; count: number }[] }
  | { type: "boolean"; yes: number; no: number };

export interface MetricSummaryRow {
  code: string;
  name: string;
  // Subjects (trees, or the parcel) with a value in this visit.
  count: number;
  summary: MetricSummary;
}

// Summary of one visit's values per card metric, in the order of `defs`.
// Metrics without a value in the visit are left out.
export function summarizeMetrics(defs: MetricDef[], rows: MeasurementRow[]): MetricSummaryRow[] {
  const picked = pickMeasurements(rows);
  const out: MetricSummaryRow[] = [];
  for (const def of cardMetrics(defs)) {
    const values = picked
      .filter((r) => r.metric_definition_id === def.id)
      .map((r) => metricValue(def, r))
      .filter((v): v is MetricValue => v !== null);
    if (values.length === 0) continue;
    out.push({
      code: def.code,
      name: def.name,
      count: values.length,
      summary: summarize(def, values),
    });
  }
  return out;
}

function summarize(def: MetricDef, values: MetricValue[]): MetricSummary {
  switch (def.value_type) {
    case "numeric": {
      const nums = values.flatMap((v) => (v.type === "numeric" ? [v.value] : []));
      return {
        type: "numeric",
        mean: nums.reduce((s, n) => s + n, 0) / nums.length,
        min: Math.min(...nums),
        max: Math.max(...nums),
        unit: def.unit,
      };
    }
    case "scale": {
      const min = def.scale_min ?? 0;
      const max = def.scale_max ?? 0;
      const counts = [];
      for (let value = min; value <= max; value += 1) {
        counts.push({
          value,
          count: values.filter((v) => v.type === "scale" && v.value === value).length,
        });
      }
      return { type: "scale", counts };
    }
    case "category": {
      const known = def.categories ?? [];
      const seen = values.flatMap((v) => (v.type === "category" ? [v.value] : []));
      const order = [...known, ...seen.filter((c) => !known.includes(c))];
      return {
        type: "category",
        counts: [...new Set(order)].map((value) => ({
          value,
          count: seen.filter((c) => c === value).length,
        })),
      };
    }
    case "boolean": {
      const yes = values.filter((v) => v.type === "boolean" && v.value).length;
      return { type: "boolean", yes, no: values.length - yes };
    }
  }
}
