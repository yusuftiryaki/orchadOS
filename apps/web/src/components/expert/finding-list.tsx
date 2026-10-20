import { deleteFindingAction } from "@/app/uzman/actions";
import type { Crop, ReviewFinding } from "@/lib/expert/review";
import { t } from "@/lib/i18n";
import styles from "./expert.module.css";
import { FindingForm } from "./finding-form";

// Findings with edit and delete while the visit is not published.
export function FindingList({
  sessionId,
  findings,
  treeCode,
  returnPath,
  editable,
  evidenceOptions,
}: {
  sessionId: string;
  findings: ReviewFinding[];
  // Slot code per tree id, for findings listed outside their tree.
  treeCode?: (treeId: string) => string;
  returnPath: string;
  editable: boolean;
  evidenceOptions: (finding: ReviewFinding) => Crop[];
}) {
  const f = t.expert.findings;
  if (findings.length === 0) return <p className="muted">{f.none}</p>;
  return (
    <ul className={styles.findings} data-testid="finding-list">
      {findings.map((finding) => (
        <li key={finding.id} className={styles.finding} data-finding-id={finding.id}>
          <div className={styles.inline}>
            <strong>{f.kinds[finding.kind] ?? finding.kind}</strong>
            <span>· {f.severities[finding.severity]}</span>
            {treeCode && (
              <span className="muted">
                · {finding.treeId ? `${f.tree} ${treeCode(finding.treeId)}` : f.parcel}
              </span>
            )}
            {finding.approvedAt && <span className="muted">· {f.approved}</span>}
          </div>
          <p>{finding.description}</p>
          {finding.recommendation && (
            <p>
              <span className="muted">{f.recommendation}: </span>
              {finding.recommendation}
            </p>
          )}
          {editable && (
            <div className={styles.inline}>
              <details>
                <summary>{f.edit}</summary>
                <FindingForm
                  sessionId={sessionId}
                  treeId={finding.treeId}
                  returnPath={returnPath}
                  finding={finding}
                  evidenceOptions={evidenceOptions(finding)}
                  submitLabel={f.save}
                />
              </details>
              <form action={deleteFindingAction}>
                <input type="hidden" name="sessionId" value={sessionId} />
                <input type="hidden" name="findingId" value={finding.id} />
                <input type="hidden" name="return" value={returnPath} />
                <button className={`button ${styles.danger}`} type="submit">
                  {f.delete}
                </button>
              </form>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
