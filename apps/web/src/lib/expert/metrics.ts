import type { Database } from "@/lib/database.types";
import type { Season } from "./season";

// Which metrics the expert enters for a visit, and how form input becomes a
// measurement. Pure; the database checks the same limits again on insert.

type Tables = Database["public"]["Tables"];

export type MetricDefinition = Pick<
  Tables["metric_definition"]["Row"],
  | "id"
  | "code"
  | "name"
  | "unit"
  | "value_type"
  | "scale_min"
  | "scale_max"
  | "categories"
  | "valid_seasons"
  | "card_visibility"
  | "subject_kinds"
>;

export const METRIC_COLUMNS =
  "id, code, name, unit, value_type, scale_min, scale_max, categories, valid_seasons, card_visibility, subject_kinds";

// Scale values carry half a step of uncertainty: the expert reads a class off
// the methodology's reference photos, not a measured number.
export const EXPERT_SCALE_UNCERTAINTY = 0.5;

const TYPE_ORDER: Record<MetricDefinition["value_type"], number> = {
  scale: 0,
  category: 1,
  boolean: 2,
  numeric: 3,
};

// Metrics of the visit's season that are shown on the report card and can be
// measured on a tree. Scales first (the expert's main input), then by name.
export function reviewMetrics(definitions: MetricDefinition[], season: Season): MetricDefinition[] {
  return definitions
    .filter(
      (m) =>
        m.valid_seasons.includes(season) &&
        m.card_visibility === "shown" &&
        m.subject_kinds.includes("tree"),
    )
    .sort(
      (a, b) =>
        TYPE_ORDER[a.value_type] - TYPE_ORDER[b.value_type] || a.name.localeCompare(b.name, "tr"),
    );
}

// One value as save_expert_assessment() expects it.
export interface MeasurementInput {
  metric_definition_id: string;
  value_numeric?: number;
  value_scale?: number;
  value_category?: string;
  value_boolean?: boolean;
  uncertainty: number | null;
}

// The value columns of a measurement row.
export interface MeasurementValue {
  metric_definition_id: string;
  value_numeric: number | null;
  value_scale: number | null;
  value_category: string | null;
  value_boolean: boolean | null;
  uncertainty: number | null;
}

// Form field names of a metric's value and (numeric only) uncertainty.
export const valueField = (metric: Pick<MetricDefinition, "code">) => `metric.${metric.code}`;
export const uncertaintyField = (metric: Pick<MetricDefinition, "code">) =>
  `uncertainty.${metric.code}`;

export type MetricInputError = {
  code: string;
  reason: "scale_required" | "invalid" | "out_of_range";
};

// Reads the correction form. At least one scale value is required (scales
// decide the class); any single metric may be left empty when it cannot be
// judged from images (docs/metodoloji.md, section 4).
export function parseMetricInputs(
  metrics: MetricDefinition[],
  read: (name: string) => string | null | undefined,
): { ok: true; values: MeasurementInput[] } | { ok: false; error: MetricInputError } {
  const values: MeasurementInput[] = [];
  for (const m of metrics) {
    const raw = (read(valueField(m)) ?? "").trim();
    if (raw === "") continue;
    const fail = (reason: MetricInputError["reason"]) =>
      ({ ok: false, error: { code: m.code, reason } }) as const;

    switch (m.value_type) {
      case "scale": {
        const n = Number(raw);
        if (!Number.isInteger(n)) return fail("invalid");
        if (n < (m.scale_min ?? 0) || n > (m.scale_max ?? 0)) return fail("out_of_range");
        values.push({
          metric_definition_id: m.id,
          value_scale: n,
          uncertainty: EXPERT_SCALE_UNCERTAINTY,
        });
        break;
      }
      case "numeric": {
        // Turkish decimal comma or point.
        const n = Number(raw.replace(",", "."));
        const uRaw = (read(uncertaintyField(m)) ?? "").trim();
        const u = Number(uRaw.replace(",", "."));
        if (!Number.isFinite(n)) return fail("invalid");
        if (uRaw === "" || !Number.isFinite(u) || u < 0) return fail("invalid");
        values.push({ metric_definition_id: m.id, value_numeric: n, uncertainty: u });
        break;
      }
      case "category":
        if (!(m.categories ?? []).includes(raw)) return fail("invalid");
        values.push({ metric_definition_id: m.id, value_category: raw, uncertainty: null });
        break;
      case "boolean":
        if (raw !== "true" && raw !== "false") return fail("invalid");
        values.push({
          metric_definition_id: m.id,
          value_boolean: raw === "true",
          uncertainty: null,
        });
        break;
    }
  }
  const scales = metrics.filter((m) => m.value_type === "scale");
  const scaleIds = new Set(scales.map((m) => m.id));
  if (scales.length > 0 && !values.some((v) => scaleIds.has(v.metric_definition_id)))
    return { ok: false, error: { code: scales[0].code, reason: "scale_required" } };
  return { ok: true, values };
}

// "Accept AI": the AI's values for the visit's metrics become the expert's,
// with the same uncertainty. Metrics the AI did not measure stay empty.
export function acceptedValues(
  metrics: MetricDefinition[],
  aiValues: MeasurementValue[],
): MeasurementInput[] {
  const out: MeasurementInput[] = [];
  for (const m of metrics) {
    const v = aiValues.find((x) => x.metric_definition_id === m.id);
    if (!v) continue;
    const input: MeasurementInput = { metric_definition_id: m.id, uncertainty: v.uncertainty };
    if (v.value_scale != null) input.value_scale = v.value_scale;
    else if (v.value_numeric != null) input.value_numeric = v.value_numeric;
    else if (v.value_category != null) input.value_category = v.value_category;
    else if (v.value_boolean != null) input.value_boolean = v.value_boolean;
    else continue;
    out.push(input);
  }
  return out;
}

// Display text of a stored value (unit appended when the metric has one).
export function formatValue(
  metric: Pick<MetricDefinition, "unit" | "value_type" | "scale_max">,
  value: Omit<MeasurementValue, "metric_definition_id">,
  labels: { yes: string; no: string; category?: (code: string) => string },
): string {
  if (value.value_scale != null) return `${value.value_scale}/${metric.scale_max ?? "?"}`;
  if (value.value_numeric != null) {
    const n = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(
      value.value_numeric,
    );
    const u =
      value.uncertainty != null
        ? ` ±${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value.uncertainty)}`
        : "";
    return metric.unit ? `${n}${u} ${metric.unit}` : `${n}${u}`;
  }
  if (value.value_category != null)
    return labels.category ? labels.category(value.value_category) : value.value_category;
  if (value.value_boolean != null) return value.value_boolean ? labels.yes : labels.no;
  return "—";
}
