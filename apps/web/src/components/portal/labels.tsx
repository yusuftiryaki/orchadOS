import { formatNumber, t } from "@/lib/i18n";
import type { Approval } from "@/lib/portal/classes";
import { trendOf, type ScoreBasis } from "@/lib/portal/score";
import styles from "./parcel.module.css";

// Small shared pieces of the portal: who gave a class, finding kinds, the
// score line.

export function findingKindLabel(kind: string): string {
  return t.portal.findingKinds[kind] ?? kind.replaceAll("_", " ");
}

// `marked` carries the test id of the tree's latest decision; the rows of
// the class history show the same badge without it.
export function ApprovalBadge({
  approval,
  marked = true,
}: {
  approval: Approval;
  marked?: boolean;
}) {
  return (
    <span
      className={approval === "expert" ? styles.approvalExpert : styles.approval}
      data-testid={marked ? "approval" : undefined}
    >
      {approval === "expert" ? "✓ " : ""}
      {t.portal.approval[approval]}
    </span>
  );
}

export function percent(count: number, total: number): string {
  return total > 0 ? formatNumber((100 * count) / total, 0) : "0";
}

// Overall condition score with its change since the previous visit (▲ ▼).
export function ScoreLine({
  score,
  change,
  basis = "previous",
  unassessedPct = null,
  size = "small",
}: {
  score: number | null;
  change: number | null;
  basis?: ScoreBasis;
  unassessedPct?: number | null;
  size?: "small" | "large";
}) {
  const sc = t.portal.score;
  if (score == null) {
    return (
      <p className={`muted ${styles.small}`} data-testid="health-score">
        {sc.none}
      </p>
    );
  }
  const trend = change == null ? null : trendOf(change);
  const titles = basis === "same_season" ? sc.changeTitleSameSeason : sc.changeTitle;
  return (
    <p className={size === "large" ? styles.scoreLarge : styles.score}>
      <span className={styles.scoreLabel}>{sc.label}</span>{" "}
      <strong className={styles.scoreValue} data-testid="health-score">
        {formatNumber(score)}
      </strong>
      <span className="muted"> {sc.outOf}</span>{" "}
      {trend == null ? (
        <span className={`muted ${styles.small}`} data-testid="score-change">
          {basis === "no_same_season" ? sc.noSameSeason : sc.first}
        </span>
      ) : (
        <span
          className={trend === "up" ? styles.better : trend === "down" ? styles.worse : "muted"}
          title={trend === "same" ? titles.same : titles[trend](Math.abs(change!))}
          data-testid="score-change"
          data-trend={trend}
        >
          {trend === "same" ? sc.change.same : sc.change[trend](Math.abs(change!))}
          {basis === "same_season" && ` (${sc.sameSeasonNote})`}
        </span>
      )}
      {unassessedPct != null && (
        <span className={`${styles.small} ${styles.worse}`} data-testid="score-unassessed">
          {sc.unassessed(unassessedPct)}
        </span>
      )}
    </p>
  );
}
