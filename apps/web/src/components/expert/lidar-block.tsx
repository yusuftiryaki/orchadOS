import { acceptSizeClassAction } from "@/app/uzman/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Facts } from "@/components/ui/facts";
import { cell, Table } from "@/components/ui/table";
import type { MetricDefinition } from "@/lib/expert/metrics";
import type { Filter } from "@/lib/expert/summary";
import { FILTER_PARAM } from "@/lib/expert/urls";
import { categoryLabel, formatDate, formatMeasure, formatNumber, t } from "@/lib/i18n";
import { hasFacts, LIDAR_FACTS, type LidarFact } from "@/lib/lidar/facts";
import { canAccept, suggestionState, type AgeClass } from "@/lib/lidar/size-class";
import type { TreeLidar } from "@/lib/lidar/staff";
import styles from "./expert.module.css";

// The tree's LiDAR values in this and the previous visit, and its size class
// suggestion against the recorded class, accepted with one click
// (docs/3d-dunya.md §9.2). Nothing is shown when the tree has neither.

const r = t.expert.review;
const sw = t.staffWorld;
const ageNames = t.tree.values.ageClass;

export function LidarBlock({
  parcelId,
  sessionId,
  treeId,
  filter,
  ageClass,
  visit,
  previous,
  lidar,
  metrics,
  message,
}: {
  parcelId: string;
  sessionId: string;
  treeId: string;
  filter: Filter;
  ageClass: AgeClass;
  visit: { id: string; time: string };
  previous: { id: string; time: string } | null;
  lidar: TreeLidar;
  metrics: Pick<MetricDefinition, "code" | "name">[];
  // After accepting: "ok" or "failed".
  message: string | null;
}) {
  const current = lidar.facts[visit.id];
  const before = previous ? lidar.facts[previous.id] : undefined;
  const { suggestion } = lidar;
  if (!hasFacts(current) && !hasFacts(before) && !suggestion) return null;

  const rows = LIDAR_FACTS.filter((f) => current?.[f.code] || before?.[f.code]);
  const name = (code: string) => metrics.find((m) => m.code === code)?.name ?? code;
  const state = suggestionState(suggestion, ageClass);

  return (
    <section className={styles.block} data-testid="lidar-block" aria-labelledby="lidar-title">
      <h3 id="lidar-title">{r.lidar.title}</h3>
      {rows.length > 0 && (
        <>
          <p className={styles.small}>{r.lidar.note}</p>
          <Table data-testid="lidar-values">
            <thead>
              <tr>
                <th scope="col">{r.lidar.metric}</th>
                <th scope="col">{r.lidar.current(formatDate(visit.time))}</th>
                {previous && <th scope="col">{r.lidar.previous(formatDate(previous.time))}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.code} data-metric={f.code}>
                  <th scope="row">{name(f.code)}</th>
                  <td className={cell.nowrap}>{factText(current?.[f.code], f.unit)}</td>
                  {previous && (
                    <td className={cell.nowrap}>{factText(before?.[f.code], f.unit)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
      <div data-testid="lidar-suggestion" data-state={state}>
        <Facts
          rows={[
            [sw.recorded, ageNames[ageClass]],
            [
              sw.suggestion,
              suggestion
                ? `${sw.suggestionValue(
                    ageNames[suggestion.sizeClass],
                    suggestion.confidence === null ? null : formatNumber(suggestion.confidence, 2),
                  )}, ${sw.suggestionScan(formatDate(suggestion.measuredAt))}`
                : sw.states.none,
            ],
          ]}
        />
        {suggestion && state !== "match" && <p className={styles.small}>{sw.states[state]}</p>}
        {suggestion && canAccept(state) && (
          <form action={acceptSizeClassAction}>
            <input type="hidden" name="parcelId" value={parcelId} />
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="treeId" value={treeId} />
            <input type="hidden" name="filter" value={FILTER_PARAM[filter]} />
            <input type="hidden" name="sizeClass" value={suggestion.sizeClass} />
            <Button type="submit" size="sm" variant="secondary" data-testid="lidar-accept">
              {sw.accept}
            </Button>
          </form>
        )}
        {message === "ok" && (
          <Alert tone="success" role="status" testId="lidar-accepted">
            {sw.accepted(ageNames[ageClass])}
          </Alert>
        )}
        {message === "failed" && (
          <Alert tone="danger" role="alert">
            {sw.acceptFailed}
          </Alert>
        )}
      </div>
    </section>
  );
}

function factText(fact: LidarFact | undefined, unit: string | null): string {
  if (!fact) return r.lidar.none;
  if (fact.category !== null) return categoryLabel(fact.category);
  if (fact.numeric === null) return r.lidar.none;
  if (unit === "count") return formatMeasure(fact.numeric, unit, null, 0);
  return formatMeasure(fact.numeric, unit, fact.uncertainty);
}
