import type { ReactNode } from "react";
import styles from "./empty-state.module.css";

// Nothing to show yet. The title says what is missing, the body why and what
// happens next, the action invites the next step ("Bahçe ekleyin").
// `compact` is for an empty list inside a panel: no picture, less padding.
// The title is a heading, so a sentence's closing period is dropped (the
// same message may end a sentence elsewhere).
export function EmptyState({
  title,
  children,
  action,
  headingLevel = 2,
  compact = false,
  testId,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3;
  compact?: boolean;
  testId?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div
      className={compact ? `${styles.empty} ${styles.compact}` : styles.empty}
      data-testid={testId}
    >
      {/* Empty planting rows: the orchard grid with no trees in it. */}
      {!compact && <span className={styles.grid} aria-hidden />}
      <Heading>{typeof title === "string" ? title.replace(/\.$/, "") : title}</Heading>
      {children && <div>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
