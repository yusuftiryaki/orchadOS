import { formatNumber, t } from "@/lib/i18n";
import { MARKER_COLORS } from "@/lib/map/tree-style";
import { distributionTotal, type Approval, type Distribution } from "@/lib/portal/classes";
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
