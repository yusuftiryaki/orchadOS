import type { ReactNode } from "react";
import styles from "./empty-state.module.css";

// Nothing to show yet. The title says what is missing, the body why and what
// happens next, the action invites the next step ("Bahçe ekleyin").
export function EmptyState({
  title,
  children,
  action,
  headingLevel = 2,
  testId,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  headingLevel?: 2 | 3;
  testId?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={styles.empty} data-testid={testId}>
      {/* Empty planting rows: the orchard grid with no trees in it. */}
      <span className={styles.grid} aria-hidden />
      <Heading>{title}</Heading>
      {children && <div>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
