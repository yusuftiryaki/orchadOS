import { decideAction } from "@/app/uzman/actions";
import {
  uncertaintyField,
  valueField,
  type MeasurementValue,
  type MetricDefinition,
} from "@/lib/expert/metrics";
import type { TreeDetail } from "@/lib/expert/review";
import { HEALTH_CLASSES, type Filter } from "@/lib/expert/summary";
import { FILTER_PARAM } from "@/lib/expert/urls";
import { formatDate, t } from "@/lib/i18n";
import { ClassBadge } from "./class-badge";
import styles from "./expert.module.css";

// Accept the AI suggestion, or correct it: class plus the visit's metrics.
export function DecisionPanel({
  sessionId,
  treeId,
  nextTreeId,
  filter,
  detail,
  metrics,
  editable,
}: {
  sessionId: string;
  treeId: string;
  nextTreeId: string | null;
  filter: Filter;
  detail: TreeDetail;
  metrics: MetricDefinition[];
  editable: boolean;
}) {
  const r = t.expert.review;
  const health = t.tree.values.health;
  // Start from the expert's last decision, else from the AI suggestion.
  const base = detail.expert ?? detail.ai;
  const defaults = new Map<string, MeasurementValue>(
    (base?.values ?? []).map((v) => [v.metric_definition_id, v]),
  );

  const hidden = (
    <>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="treeId" value={treeId} />
      <input type="hidden" name="next" value={nextTreeId ?? treeId} />
      <input type="hidden" name="filter" value={FILTER_PARAM[filter]} />
    </>
  );

  return (
    <section className={styles.panel} data-testid="decision-panel">
      <h3>{r.decision}</h3>
      <p data-testid="saved-decision">
        {detail.expert ? (
          <>
            {r.savedDecision}: <ClassBadge value={detail.expert.overallClass} />{" "}
            <span className="muted">({formatDate(detail.expert.assessedAt)})</span>
          </>
        ) : (
          <span className="muted">{r.noDecision}</span>
        )}
      </p>
      {detail.expert?.notes && <p className="muted">{detail.expert.notes}</p>}

      {editable && (
        <>
          <form action={decideAction} className={styles.inline}>
            {hidden}
            <input type="hidden" name="decision" value="accept" />
            <button
              className="button"
              type="submit"
              data-shortcut="accept"
              disabled={!detail.ai?.overallClass}
            >
              {r.accept}
            </button>
            <span className={`muted ${styles.hint}`}>{r.acceptHint}</span>
          </form>

          <form action={decideAction} className={styles.form} data-testid="correction-form">
            {hidden}
            <input type="hidden" name="decision" value="correct" />
            <h3>{r.correct}</h3>
            <p className={`muted ${styles.hint}`}>{r.correctHint}</p>
            <fieldset className={styles.classes}>
              <legend>{r.class}</legend>
              {HEALTH_CLASSES.map((c, i) => (
                <label key={c}>
                  <input
                    type="radio"
                    name="overallClass"
                    value={c}
                    defaultChecked={base?.overallClass === c}
                    data-shortcut-class={i + 1}
                    required
                  />
                  {health[c]} <span className="muted">({i + 1})</span>
                </label>
              ))}
            </fieldset>

            <h3>{r.metricsTitle}</h3>
            {metrics.length === 0 && <p className="muted">{r.noMetrics}</p>}
            {metrics.map((m) => {
              const d = defaults.get(m.id);
              const label = m.unit ? `${m.name} (${m.unit})` : m.name;
              switch (m.value_type) {
                case "scale": {
                  const options = [];
                  for (let v = m.scale_min ?? 0; v <= (m.scale_max ?? 0); v++) options.push(v);
                  return (
                    <label key={m.id} className={styles.field}>
                      {label}
                      <select name={valueField(m)} defaultValue={d?.value_scale ?? ""} required>
                        <option value="">{r.choose}</option>
                        {options.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }
                case "numeric":
                  return (
                    <div key={m.id} className={styles.inline}>
                      <label className={styles.field}>
                        {label}
                        <input
                          className={styles.numberInput}
                          name={valueField(m)}
                          inputMode="decimal"
                          defaultValue={d?.value_numeric ?? ""}
                        />
                      </label>
                      <label className={styles.field}>
                        {r.uncertainty}
                        <input
                          className={styles.numberInput}
                          name={uncertaintyField(m)}
                          inputMode="decimal"
                          defaultValue={d?.value_numeric != null ? (d.uncertainty ?? "") : ""}
                        />
                      </label>
                    </div>
                  );
                case "category":
                  return (
                    <label key={m.id} className={styles.field}>
                      {label}
                      <select name={valueField(m)} defaultValue={d?.value_category ?? ""}>
                        <option value="">{r.choose}</option>
                        {(m.categories ?? []).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                case "boolean":
                  return (
                    <label key={m.id} className={styles.field}>
                      {label}
                      <select
                        name={valueField(m)}
                        defaultValue={d?.value_boolean == null ? "" : String(d.value_boolean)}
                      >
                        <option value="">{r.choose}</option>
                        <option value="true">{r.yes}</option>
                        <option value="false">{r.no}</option>
                      </select>
                    </label>
                  );
              }
            })}
            <label className={styles.field}>
              {r.notes}
              <textarea name="notes" rows={2} />
            </label>
            <div>
              <button className="button button-secondary" type="submit">
                {r.saveCorrection}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
