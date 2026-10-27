import type { HealthClass } from "@/lib/map/tree-style";
import { DEFAULT_REVIEW_RULES, type ClassRuleConfig } from "./mandatory-review";
import type { MeasurementValue, MetricDefinition } from "./metrics";

// General class rule of docs/metodoloji.md section 5, rules 3-5, from the
// scale values: any 0-3 scale at 3 -> problem; any scale at 2 -> attention;
// else healthy. Pest signs raise the class as the methodology version says
// (v0: marked -> problem, mild -> attention; v0.1: marked -> attention). "Yok" and "Kuru" need
// the expert (two directions, signs of life) and are never derived. Pruning,
// fruit load and basal sprouts do not affect the class. The dieback pattern
// raises it (section 4.10): one-sided or top-down dieback -> at least
// attention, dried leaves still hanging -> at least problem. Null without any
// value to judge by.

const NOT_A_HEALTH_SCALE = new Set(["fruit_load_scale"]);
const DIEBACK_RAISES = new Set(["one_sided", "top_down"]);

export function ruleClass(
  values: MeasurementValue[],
  metrics: Pick<MetricDefinition, "id" | "code" | "value_type" | "scale_max">[],
  config: ClassRuleConfig = DEFAULT_REVIEW_RULES.classRule,
): HealthClass | null {
  const byId = new Map(metrics.map((m) => [m.id, m]));
  let worst: 0 | 1 | 2 | null = null;
  const raise = (level: 0 | 1 | 2) => {
    worst = worst === null ? level : (Math.max(worst, level) as 0 | 1 | 2);
  };
  for (const v of values) {
    const m = byId.get(v.metric_definition_id);
    if (!m) continue;
    if (m.value_type === "scale" && m.scale_max === 3 && !NOT_A_HEALTH_SCALE.has(m.code)) {
      if (v.value_scale === null) continue;
      raise(v.value_scale >= 3 ? 2 : v.value_scale >= 2 ? 1 : 0);
    } else if (m.code === "pest_sign_severity" && v.value_category) {
      raise(
        v.value_category === "marked"
          ? config.pestMarked
          : v.value_category === "mild"
            ? config.pestMild
            : 0,
      );
    } else if (m.code === "dieback_pattern" && v.value_category) {
      raise(DIEBACK_RAISES.has(v.value_category) ? 1 : 0);
    } else if (m.code === "dried_leaves_attached" && v.value_boolean !== null) {
      raise(v.value_boolean ? 2 : 0);
    }
  }
  if (worst === null) return null;
  return (["healthy", "attention", "problem"] as const)[worst];
}
