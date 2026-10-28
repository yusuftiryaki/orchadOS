import type { ReactNode } from "react";
import styles from "./alert.module.css";

export type AlertTone = "neutral" | "success" | "warning" | "danger" | "info";

// A message about the page or the last action. Errors say what happened and
// how to fix it; `role="alert"` only for errors that appear after an action,
// "status" for confirmations.
export function Alert({
  tone = "neutral",
  title,
  children,
  role,
  testId,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  role?: "alert" | "status";
  testId?: string;
}) {
  const cls = tone === "neutral" ? styles.alert : `${styles.alert} ${styles[tone]}`;
  return (
    <div className={cls} role={role} data-testid={testId}>
      <div className={styles.body}>
        {title && <p className={styles.title}>{title}</p>}
        {children}
      </div>
    </div>
  );
}
