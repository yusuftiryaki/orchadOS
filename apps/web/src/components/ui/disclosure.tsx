import type { ReactNode } from "react";
import styles from "./disclosure.module.css";

// A rarely used or irreversible action (cancel, terminate, reject, record a
// withdrawal): closed by default, so the common action stays in view and the
// rare one takes a deliberate open first. The title names the action; inside,
// a Consequence says what happens, then the form and its button.
export function Disclosure({
  title,
  children,
  testId,
  open = false,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  testId?: string;
  open?: boolean;
  className?: string;
}) {
  return (
    <details
      className={className ? `${styles.disclosure} ${className}` : styles.disclosure}
      data-testid={testId}
      open={open || undefined}
    >
      <summary className={styles.summary}>{title}</summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}

// What happens when the button below is pressed, in one or two sentences.
export function Consequence({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className={styles.consequence} data-testid={testId}>
      {children}
    </p>
  );
}
