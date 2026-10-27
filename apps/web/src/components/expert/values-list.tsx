import { ruleClass } from "@/lib/expert/class-rule";
import { DEFAULT_REVIEW_RULES, type ClassRuleConfig } from "@/lib/expert/mandatory-review";
import { formatValue, type MeasurementValue, type MetricDefinition } from "@/lib/expert/metrics";
import { categoryLabel, t } from "@/lib/i18n";
import styles from "./expert.module.css";

// Measurement values with the metric's name and unit.
export function ValuesList({
  values,
  metrics,
  classRule = DEFAULT_REVIEW_RULES.classRule,
}: {
  values: MeasurementValue[];
  metrics: MetricDefinition[];
  // The general class rule of the visit's methodology version.
  classRule?: ClassRuleConfig;
}) {
  const r = t.expert.review;
  const rows = values
    .map((v) => ({ v, m: metrics.find((m) => m.id === v.metric_definition_id) }))
    .filter((x): x is { v: MeasurementValue; m: MetricDefinition } => x.m != null)
    .sort((a, b) => a.m.name.localeCompare(b.m.name, "tr"));
  if (rows.length === 0) return null;
  const rule = ruleClass(values, metrics, classRule);
  return (
    <dl className={styles.list}>
      {rule && (
        <div style={{ display: "contents" }} data-testid="rule-class">
          <dt>{r.ruleClass}</dt>
          <dd>{t.tree.values.health[rule]}</dd>
        </div>
      )}
      {rows.map(({ v, m }) => (
        <div key={m.id} style={{ display: "contents" }} data-metric={m.code}>
          <dt>{m.name}</dt>
          <dd>{formatValue(m, v, { yes: r.yes, no: r.no, category: categoryLabel })}</dd>
        </div>
      ))}
    </dl>
  );
}
