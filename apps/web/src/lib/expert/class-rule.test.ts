import { describe, expect, it } from "vitest";
import { ruleClass } from "./class-rule";

const metrics = [
  { id: "db", code: "dead_branch_scale", value_type: "scale" as const, scale_max: 3 },
  { id: "tb", code: "trunk_base_scale", value_type: "scale" as const, scale_max: 3 },
  { id: "fl", code: "fruit_load_scale", value_type: "scale" as const, scale_max: 3 },
  { id: "ps", code: "pest_sign_severity", value_type: "category" as const, scale_max: null },
  { id: "pr", code: "pruning_status", value_type: "category" as const, scale_max: null },
  { id: "dp", code: "dieback_pattern", value_type: "category" as const, scale_max: null },
  { id: "dl", code: "dried_leaves_attached", value_type: "boolean" as const, scale_max: null },
  { id: "bs", code: "basal_sprout_level", value_type: "category" as const, scale_max: null },
];
const v = (id: string, value: number | string | boolean) => ({
  metric_definition_id: id,
  value_numeric: null,
  value_scale: typeof value === "number" ? value : null,
  value_category: typeof value === "string" ? value : null,
  value_boolean: typeof value === "boolean" ? value : null,
  uncertainty: null,
});

describe("general class rule (methodology 5)", () => {
  it("scale 3 or marked pests: problem; scale 2 or mild pests: attention; else healthy", () => {
    expect(ruleClass([v("db", 3), v("tb", 0)], metrics)).toBe("problem");
    expect(ruleClass([v("db", 1), v("ps", "marked")], metrics)).toBe("problem");
    expect(ruleClass([v("db", 2)], metrics)).toBe("attention");
    expect(ruleClass([v("db", 0), v("ps", "mild")], metrics)).toBe("attention");
    expect(ruleClass([v("db", 1), v("ps", "none")], metrics)).toBe("healthy");
  });

  it("fruit load and pruning do not count; nothing to judge by gives null", () => {
    expect(ruleClass([v("fl", 3), v("pr", "not_done"), v("db", 0)], metrics)).toBe("healthy");
    expect(ruleClass([v("fl", 3)], metrics)).toBeNull();
    expect(ruleClass([], metrics)).toBeNull();
  });

  it("dieback pattern and hanging dried leaves raise the class; basal sprouts do not", () => {
    expect(ruleClass([v("db", 1), v("dp", "one_sided")], metrics)).toBe("attention");
    expect(ruleClass([v("db", 1), v("dp", "top_down")], metrics)).toBe("attention");
    expect(ruleClass([v("db", 1), v("dp", "tip_dieback")], metrics)).toBe("healthy");
    expect(ruleClass([v("db", 1), v("dl", true)], metrics)).toBe("problem");
    expect(ruleClass([v("db", 0), v("dl", false)], metrics)).toBe("healthy");
    expect(ruleClass([v("db", 0), v("bs", "dense")], metrics)).toBe("healthy");
  });
});

describe("methodology v0.1 pest rule", () => {
  it("mild signs do not count, marked ones mean attention", async () => {
    const { reviewRulesFor } = await import("./mandatory-review");
    const rule = reviewRulesFor("methodology-v0.1").classRule;
    expect(ruleClass([v("db", 0), v("ps", "mild")], metrics, rule)).toBe("healthy");
    expect(ruleClass([v("db", 0), v("ps", "marked")], metrics, rule)).toBe("attention");
    expect(ruleClass([v("db", 3), v("ps", "mild")], metrics, rule)).toBe("problem");
  });
});
