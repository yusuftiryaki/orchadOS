import { formatNumber, t } from "@/lib/i18n";
import { MARKER_COLORS } from "@/lib/map/tree-style";
import { distributionTotal, type Approval, type Distribution } from "@/lib/portal/classes";
import { trendOf, type ScoreBasis } from "@/lib/portal/score";
import styles from "./portal.module.css";

// Small shared pieces of the portal: who gave a class, finding kinds, the
// class distribution bar.

export function findingKindLabel(kind: string): string {
  return t.portal.findingKinds[kind] ?? kind.replaceAll("_", " ");
}

export function ApprovalBadge({ approval }: { approval: Approval }) {
  return (
    <span
      className={approval === "expert" ? styles.badgeExpert : styles.badgeMachine}
      data-testid="approval"
    >
      {approval === "expert" ? "✓ " : ""}
      {t.portal.approval[approval]}
    </span>
  );
}

const BAR_ORDER = ["healthy", "attention", "problem", "dead", "absent", "unassessed"] as const;

export function percent(count: number, total: number): string {
  return total > 0 ? formatNumber((100 * count) / total, 0) : "0";
}

// Horizontal bar of class shares; the title lists the numbers.
export function DistributionBar({ distribution }: { distribution: Distribution }) {
  const total = distributionTotal(distribution);
  const title = BAR_ORDER.filter((c) => distribution[c] > 0)
    .map((c) => `${t.portal.classes[c]}: ${distribution[c]}`)
    .join(", ");
  return (
    <div className={styles.bar} role="img" aria-label={title} title={title} data-testid="class-bar">
      {total > 0 &&
        BAR_ORDER.map((c) =>
          distribution[c] > 0 ? (
            <span
              key={c}
              style={{ width: `${(100 * distribution[c]) / total}%`, background: MARKER_COLORS[c] }}
            />
          ) : null,
        )}
    </div>
  );
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
          {basis === "same_season" && ` · ${sc.sameSeasonNote}`}
        </span>
      )}
      {unassessedPct != null && (
        <span className={`${styles.small} ${styles.worse}`} data-testid="score-unassessed">
          {" "}
          · {sc.unassessed(unassessedPct)}
        </span>
      )}
    </p>
  );
}
