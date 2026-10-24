import type { CoverageSummary, PipelineChecks } from "@/lib/expert/pipeline-checks";
import { formatNumber, t } from "@/lib/i18n";
import styles from "./expert.module.css";

// Codes listed before "…"; the coverage.json of the run has them all.
const CODES_SHOWN = 40;

const p = t.expert.pipeline;

function codes(list: string[]): string {
  return list.length > CODES_SHOWN
    ? `${list.slice(0, CODES_SHOWN).join(", ")}, …`
    : list.join(", ");
}

export function CoverageLine({ coverage }: { coverage: CoverageSummary | null }) {
  if (!coverage) return <p className="muted">{p.noCoverage}</p>;
  return (
    <div data-testid="coverage" data-passed={coverage.passed} data-rescan={coverage.rescanNeeded}>
      <p>
        <strong>{coverage.passed ? p.passed : p.failed}</strong> ·{" "}
        {p.coverageLine(
          formatNumber(coverage.ratio * 100, 1),
          coverage.coveredTrees,
          coverage.activeTrees,
          formatNumber(coverage.threshold * 100, 1),
        )}
        {coverage.blindSpots > 0 && <> · {p.blindSpots(coverage.blindSpots)}</>}
      </p>
      {coverage.missingTrees > 0 && (
        <p className="muted">{p.missing(coverage.missingTrees, codes(coverage.missingCodes))}</p>
      )}
      {coverage.rescanNeeded && <p className="muted">{p.rescan}</p>}
      <p className="muted">{p.version(coverage.pipelineVersion)}</p>
    </div>
  );
}

// What the processing pipeline found on the visit: coverage, trees it did not
// see, empty slots that look planted.
export function PipelineChecksPanel({ checks }: { checks: PipelineChecks }) {
  return (
    <section className={styles.panel} data-testid="pipeline-checks">
      <h3>{p.title}</h3>
      <h4>{p.coverage}</h4>
      <CoverageLine coverage={checks.coverage} />
      {checks.notVisible.length > 0 && (
        <p data-testid="not-visible">
          {p.notVisible(checks.notVisible.length, codes(checks.notVisible))}
        </p>
      )}
      {checks.suggestions.length > 0 && (
        <>
          <h4>{p.suggestions}</h4>
          <p className="muted">{p.suggestionsHint}</p>
          <ul data-testid="planting-suggestions">
            {checks.suggestions.map((s) => (
              <li key={s.slotId} data-slot={s.code}>
                {p.suggestion(s.code, s.cropIds.length)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
