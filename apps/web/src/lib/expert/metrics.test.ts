import { describe, expect, it } from "vitest";
import {
  EXPERT_SCALE_UNCERTAINTY,
  acceptedValues,
  formatValue,
  parseMetricInputs,
  reviewMetrics,
  type MetricDefinition,
} from "./metrics";

// The seed's metric registry (supabase/seed.sql) plus a category and a yes/no metric.
function metric(
  code: string,
  value_type: MetricDefinition["value_type"],
  valid_seasons: MetricDefinition["valid_seasons"],
  card_visibility: MetricDefinition["card_visibility"] = "shown",
  extra: Partial<MetricDefinition> = {},
): MetricDefinition {
  return {
    id: `id-${code}`,
    code,
    name: code,
    unit: null,
    value_type,
    scale_min: value_type === "scale" ? 0 : null,
    scale_max: value_type === "scale" ? 3 : null,
    categories: null,
    valid_seasons,
    card_visibility,
    subject_kinds: ["tree"],
    ...extra,
  };
}
const ALL = ["winter", "spring", "summer", "harvest"] as const;
const DEFS: MetricDefinition[] = [
  metric("dead_branch_scale", "scale", [...ALL]),
  metric("crown_diameter", "numeric", ["spring", "summer"], "shown", { unit: "m" }),
  metric("trunk_diameter_h30", "numeric", [...ALL], "shown", { unit: "cm" }),
  metric("scaffold_branch_count", "numeric", ["winter"], "shown", { unit: "count" }),
  metric("fractal_dimension", "numeric", ["winter"], "hidden"),
  metric("fruit_load_scale", "scale", ["summer"]),
  metric("canopy_temp_delta", "numeric", ["summer"], "under_evaluation", { unit: "degC" }),
  metric("pruning", "category", ["winter"], "shown", {
    categories: ["done", "partial", "not_done"],
  }),
  metric("parcel_weeds", "scale", [...ALL], "shown", { subject_kinds: ["parcel"] }),
  metric("harvest_complete", "boolean", ["harvest"]),
];
const codes = (ms: MetricDefinition[]) => ms.map((m) => m.code);

describe("reviewMetrics", () => {
  it("keeps the season's metrics shown on the report card, scales first", () => {
    expect(codes(reviewMetrics(DEFS, "winter"))).toEqual([
      "dead_branch_scale",
      "pruning",
      "scaffold_branch_count",
      "trunk_diameter_h30",
    ]);
    expect(codes(reviewMetrics(DEFS, "summer"))).toEqual([
      "dead_branch_scale",
      "fruit_load_scale",
      "crown_diameter",
      "trunk_diameter_h30",
    ]);
    expect(codes(reviewMetrics(DEFS, "harvest"))).toEqual([
      "dead_branch_scale",
      "harvest_complete",
      "trunk_diameter_h30",
    ]);
  });

  it("leaves out hidden, under-evaluation and non-tree metrics", () => {
    const all = ALL.flatMap((s) => codes(reviewMetrics(DEFS, s)));
    expect(all).not.toContain("fractal_dimension");
    expect(all).not.toContain("canopy_temp_delta");
    expect(all).not.toContain("parcel_weeds");
  });
});

describe("parseMetricInputs", () => {
  const winter = reviewMetrics(DEFS, "winter");
  const form = (values: Record<string, string>) => (name: string) => values[name];

  it("turns form fields into measurement inputs", () => {
    const result = parseMetricInputs(
      winter,
      form({
        "metric.dead_branch_scale": "2",
        "metric.pruning": "partial",
        "metric.trunk_diameter_h30": "24,5",
        "uncertainty.trunk_diameter_h30": "0.3",
        "metric.scaffold_branch_count": "",
      }),
    );
    expect(result).toEqual({
      ok: true,
      values: [
        {
          metric_definition_id: "id-dead_branch_scale",
          value_scale: 2,
          uncertainty: EXPERT_SCALE_UNCERTAINTY,
        },
        { metric_definition_id: "id-pruning", value_category: "partial", uncertainty: null },
        { metric_definition_id: "id-trunk_diameter_h30", value_numeric: 24.5, uncertainty: 0.3 },
      ],
    });
  });

  it("requires scale values and checks their range", () => {
    expect(parseMetricInputs(winter, form({}))).toEqual({
      ok: false,
      error: { code: "dead_branch_scale", reason: "required" },
    });
    expect(parseMetricInputs(winter, form({ "metric.dead_branch_scale": "4" }))).toEqual({
      ok: false,
      error: { code: "dead_branch_scale", reason: "out_of_range" },
    });
    expect(parseMetricInputs(winter, form({ "metric.dead_branch_scale": "1.5" }))).toEqual({
      ok: false,
      error: { code: "dead_branch_scale", reason: "invalid" },
    });
  });

  it("rejects unknown categories and numbers without uncertainty", () => {
    const base = { "metric.dead_branch_scale": "0" };
    expect(parseMetricInputs(winter, form({ ...base, "metric.pruning": "maybe" }))).toMatchObject({
      ok: false,
      error: { code: "pruning", reason: "invalid" },
    });
    expect(
      parseMetricInputs(winter, form({ ...base, "metric.trunk_diameter_h30": "24" })),
    ).toMatchObject({ ok: false, error: { code: "trunk_diameter_h30", reason: "invalid" } });
  });

  it("reads yes/no values", () => {
    const harvest = reviewMetrics(DEFS, "harvest");
    const result = parseMetricInputs(
      harvest,
      form({ "metric.dead_branch_scale": "0", "metric.harvest_complete": "false" }),
    );
    expect(result.ok && result.values[1]).toEqual({
      metric_definition_id: "id-harvest_complete",
      value_boolean: false,
      uncertainty: null,
    });
  });
});

describe("acceptedValues", () => {
  it("copies the AI's values of the visit's metrics only", () => {
    const harvest = reviewMetrics(DEFS, "harvest");
    const ai = [
      {
        metric_definition_id: "id-dead_branch_scale",
        value_numeric: null,
        value_scale: 1,
        value_category: null,
        value_boolean: null,
        uncertainty: 0.4,
      },
      {
        metric_definition_id: "id-fruit_load_scale",
        value_numeric: null,
        value_scale: 2,
        value_category: null,
        value_boolean: null,
        uncertainty: 0.5,
      },
    ];
    expect(acceptedValues(harvest, ai)).toEqual([
      { metric_definition_id: "id-dead_branch_scale", value_scale: 1, uncertainty: 0.4 },
    ]);
  });
});

describe("formatValue", () => {
  const labels = { yes: "Evet", no: "Hayır" };
  const empty = {
    value_numeric: null,
    value_scale: null,
    value_category: null,
    value_boolean: null,
  };
  it("formats scale, numeric, category and yes/no values", () => {
    expect(formatValue(DEFS[0], { ...empty, value_scale: 2, uncertainty: 0.5 }, labels)).toBe(
      "2/3",
    );
    expect(formatValue(DEFS[2], { ...empty, value_numeric: 24.5, uncertainty: 0.3 }, labels)).toBe(
      "24,5 ±0,3 cm",
    );
    expect(
      formatValue(DEFS[7], { ...empty, value_category: "done", uncertainty: null }, labels),
    ).toBe("done");
    expect(formatValue(DEFS[9], { ...empty, value_boolean: true, uncertainty: null }, labels)).toBe(
      "Evet",
    );
  });
});
