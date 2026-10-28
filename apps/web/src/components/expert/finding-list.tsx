import { approveFindingAction, deleteFindingAction } from "@/app/uzman/actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Crop, ReviewFinding } from "@/lib/expert/review";
import { t } from "@/lib/i18n";
import styles from "./expert.module.css";
import { FindingForm } from "./finding-form";

export const SEVERITY_TONE: Record<ReviewFinding["severity"], BadgeTone> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
  info: "info",
};

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
  if (findings.length === 0) return <p className={styles.small}>{f.none}</p>;
  return (
    <ul className={styles.items} data-testid="finding-list">
      {findings.map((finding) => (
        <li key={finding.id} className={styles.item} data-finding-id={finding.id}>
          <div className={styles.itemHead}>
            <strong>{f.kinds[finding.kind] ?? finding.kind}</strong>
            <Badge tone={SEVERITY_TONE[finding.severity]}>{f.severities[finding.severity]}</Badge>
            {finding.approvedAt && <Badge tone="success">{f.approved}</Badge>}
            {treeCode && (
              <span className={styles.muted}>
                {finding.treeId ? (
                  <>
                    {f.tree} <span className={styles.code}>{treeCode(finding.treeId)}</span>
                  </>
                ) : (
                  f.parcel
                )}
              </span>
            )}
          </div>
          <p>{finding.description}</p>
          {finding.recommendation && (
            <p>
              <span className={styles.muted}>{f.recommendation}: </span>
              {finding.recommendation}
            </p>
          )}
          {editable && (
            <div className={styles.itemActions}>
              {finding.severity === "high" && !finding.approvedAt && (
                <form action={approveFindingAction} title={f.approveNowHint}>
                  <input type="hidden" name="sessionId" value={sessionId} />
                  <input type="hidden" name="findingId" value={finding.id} />
                  <input type="hidden" name="return" value={returnPath} />
                  <Button variant="secondary" size="sm" type="submit" data-testid="approve-finding">
                    {f.approveNow}
                  </Button>
                </form>
              )}
              <form action={deleteFindingAction}>
                <input type="hidden" name="sessionId" value={sessionId} />
                <input type="hidden" name="findingId" value={finding.id} />
                <input type="hidden" name="return" value={returnPath} />
                <Button variant="quiet" size="sm" type="submit" className={styles.dangerQuiet}>
                  {f.delete}
                </Button>
              </form>
              <details className={styles.disclosure}>
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
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
