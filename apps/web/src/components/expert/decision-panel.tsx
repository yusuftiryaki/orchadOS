import { decideAction } from "@/app/uzman/actions";
import { ClassDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { ClassRuleConfig } from "@/lib/expert/mandatory-review";
import {
  uncertaintyField,
  valueField,
  type MeasurementValue,
  type MetricDefinition,
} from "@/lib/expert/metrics";
import type { TreeDetail } from "@/lib/expert/review";
import { HEALTH_CLASSES, type Filter } from "@/lib/expert/summary";
import { FILTER_PARAM } from "@/lib/expert/urls";
import { categoryLabel, formatDate, t } from "@/lib/i18n";
import { ClassBadge } from "./class-badge";
import styles from "./expert.module.css";
import { ValuesList } from "./values-list";

// The keyboard shortcuts of the review page (ReviewShortcuts), as a legend.
export function ShortcutLegend({ editable }: { editable: boolean }) {
  const s = t.expert.review.shortcuts;
  const rows: [string, string][] = [
    ["J", s.next],
    ["K", s.previous],
    ...(editable
      ? ([
          ["A", s.accept],
          ["1–5", s.classes],
        ] as [string, string][])
      : []),
  ];
  return (
    <div className={styles.shortcuts}>
      <h3 className={styles.small}>{s.title}</h3>
      <dl>
        {rows.map(([key, label]) => (
          <div key={key}>
            <dt>
              <kbd className={styles.kbd}>{key}</kbd>
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// Accept the AI suggestion, or correct it: class plus the visit's metrics.
export function DecisionPanel({
  sessionId,
  treeId,
  nextTreeId,
  filter,
  detail,
  metrics,
  allMetrics,
  classRule,
  editable,
}: {
  sessionId: string;
  treeId: string;
  nextTreeId: string | null;
  filter: Filter;
  detail: TreeDetail;
  metrics: MetricDefinition[];
  // Every metric, to label the AI's values.
  allMetrics: MetricDefinition[];
  classRule: ClassRuleConfig;
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
    <section className={styles.decision} data-testid="decision-panel" aria-labelledby="decision">
      <h2 id="decision" className={styles.paneTitle}>
        {r.decision}
      </h2>
      <p data-testid="saved-decision" className={styles.savedDecision}>
        {detail.expert ? (
          <>
            <span>{r.savedDecision}</span> <ClassBadge value={detail.expert.overallClass} />{" "}
            <span className={styles.muted}>{formatDate(detail.expert.assessedAt)}</span>
          </>
        ) : (
          <span className={styles.muted}>{r.noDecision}</span>
        )}
      </p>
      {detail.expert?.notes && <p className={styles.small}>{detail.expert.notes}</p>}

      <div className={styles.aiBox} data-testid="ai-suggestion">
        <h3>{r.ai}</h3>
        {detail.ai ? (
          <>
            <p className={styles.aiLine}>
              <ClassBadge value={detail.ai.overallClass} />
              <span>
                {r.confidence}{" "}
                <strong>
                  {detail.ai.confidence == null ? "—" : r.percent(detail.ai.confidence)}
                </strong>
              </span>
              {detail.ai.model && <span className={styles.muted}>{detail.ai.model}</span>}
            </p>
            <ValuesList values={detail.ai.values} metrics={allMetrics} classRule={classRule} />
          </>
        ) : (
          <p className={styles.small}>{r.noAi}</p>
        )}
      </div>

      {editable && (
        <>
          <form action={decideAction} className={styles.accept}>
            {hidden}
            <input type="hidden" name="decision" value="accept" />
            <Button
              type="submit"
              block
              data-shortcut="accept"
              aria-keyshortcuts="A"
              disabled={!detail.ai?.overallClass}
            >
              {r.accept}
              <kbd className={styles.kbdOnAccent} aria-hidden>
                A
              </kbd>
            </Button>
            <p className={styles.small}>{r.acceptHint}</p>
          </form>

          <form action={decideAction} className={styles.form} data-testid="correction-form">
            {hidden}
            <input type="hidden" name="decision" value="correct" />
            <h3>{r.correct}</h3>
            <p className={styles.small}>{r.correctHint}</p>
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
                    aria-keyshortcuts={String(i + 1)}
                    required
                  />
                  <ClassDot value={c} />
                  <span>{health[c]}</span>
                  <kbd className={styles.kbd} aria-hidden>
                    {i + 1}
                  </kbd>
                </label>
              ))}
            </fieldset>

            <h3>{r.metricsTitle}</h3>
            {metrics.length === 0 && <p className={styles.small}>{r.noMetrics}</p>}
            <div className={styles.metricGrid}>
              {metrics.map((m) => {
                const d = defaults.get(m.id);
                const label = m.unit ? `${m.name} (${m.unit})` : m.name;
                const id = `metric-${m.id}`;
                switch (m.value_type) {
                  case "scale": {
                    const options = [];
                    for (let v = m.scale_min ?? 0; v <= (m.scale_max ?? 0); v++) options.push(v);
                    return (
                      <Field key={m.id} id={id} label={label}>
                        <Select name={valueField(m)} defaultValue={d?.value_scale ?? ""}>
                          <option value="">{r.choose}</option>
                          {options.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    );
                  }
                  case "numeric":
                    return (
                      <div key={m.id} className={styles.numericPair}>
                        <Field id={id} label={label}>
                          <Input
                            name={valueField(m)}
                            inputMode="decimal"
                            defaultValue={d?.value_numeric ?? ""}
                          />
                        </Field>
                        <Field id={`${id}-uncertainty`} label={r.uncertainty}>
                          <Input
                            name={uncertaintyField(m)}
                            inputMode="decimal"
                            defaultValue={d?.value_numeric != null ? (d.uncertainty ?? "") : ""}
                          />
                        </Field>
                      </div>
                    );
                  case "category":
                    return (
                      <Field key={m.id} id={id} label={label}>
                        <Select name={valueField(m)} defaultValue={d?.value_category ?? ""}>
                          <option value="">{r.choose}</option>
                          {(m.categories ?? []).map((c) => (
                            <option key={c} value={c}>
                              {categoryLabel(c)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    );
                  case "boolean":
                    return (
                      <Field key={m.id} id={id} label={label}>
                        <Select
                          name={valueField(m)}
                          defaultValue={d?.value_boolean == null ? "" : String(d.value_boolean)}
                        >
                          <option value="">{r.choose}</option>
                          <option value="true">{r.yes}</option>
                          <option value="false">{r.no}</option>
                        </Select>
                      </Field>
                    );
                }
              })}
            </div>
            <Field id="decision-notes" label={r.notes}>
              <Textarea name="notes" rows={2} />
            </Field>
            <div>
              <Button variant="secondary" type="submit">
                {r.saveCorrection}
              </Button>
            </div>
          </form>
        </>
      )}
      <ShortcutLegend editable={editable} />
    </section>
  );
}
