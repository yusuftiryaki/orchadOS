import { formatValue, type MeasurementValue, type MetricDefinition } from "@/lib/expert/metrics";
import { t } from "@/lib/i18n";
import styles from "./expert.module.css";

// Measurement values with the metric's name and unit.
export function ValuesList({
  values,
  metrics,
}: {
  values: MeasurementValue[];
  metrics: MetricDefinition[];
}) {
  const r = t.expert.review;
  const rows = values
    .map((v) => ({ v, m: metrics.find((m) => m.id === v.metric_definition_id) }))
    .filter((x): x is { v: MeasurementValue; m: MetricDefinition } => x.m != null)
    .sort((a, b) => a.m.name.localeCompare(b.m.name, "tr"));
  if (rows.length === 0) return null;
  return (
    <dl className={styles.list}>
      {rows.map(({ v, m }) => (
        <div key={m.id} style={{ display: "contents" }} data-metric={m.code}>
          <dt>{m.name}</dt>
          <dd>{formatValue(m, v, { yes: r.yes, no: r.no })}</dd>
        </div>
      ))}
    </dl>
  );
}
