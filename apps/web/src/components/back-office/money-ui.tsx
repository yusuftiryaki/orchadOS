import type { ReactNode } from "react";
import styles from "./money-ui.module.css";

// Small layout pieces of the order, payment, refund and reconciliation
// screens (wave 2b). Generic candidates for ops-ui are listed in the PR.

export function Badges({ children }: { children: ReactNode }) {
  return <span className={styles.badges}>{children}</span>;
}

// A second line in a table cell, quieter than the first.
export function Sub({ children, code = false }: { children: ReactNode; code?: boolean }) {
  return <span className={code ? `${styles.sub} ${styles.code}` : styles.sub}>{children}</span>;
}

// A rarely used action (cancel, terminate, record a withdrawal): closed by
// default so the aside stays short and the common action stays in view.
export function ActionDisclosure({
  title,
  children,
  testId,
  open = false,
}: {
  title: ReactNode;
  children: ReactNode;
  testId?: string;
  open?: boolean;
}) {
  return (
    <details className={styles.disclosure} data-testid={testId} open={open || undefined}>
      <summary>{title}</summary>
      <div className={styles.disclosureBody}>{children}</div>
    </details>
  );
}

// What happens when the button below is pressed.
export function Consequence({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className={styles.consequence} data-testid={testId}>
      {children}
    </p>
  );
}

export function Amount({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <span className={styles.amount} data-testid={testId}>
      {children}
    </span>
  );
}

// The details object of an audit or provider event: one "key value" per line
// instead of a raw JSON string.
export function EventDetails({ value }: { value: unknown }) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    return <code className={styles.details}>{JSON.stringify(value)}</code>;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return null;
  return (
    <ul className={styles.details}>
      {entries.map(([k, v]) => (
        <li key={k}>
          <span className={styles.detailsKey}>{k}</span>{" "}
          {typeof v === "string" ? v : JSON.stringify(v)}
        </li>
      ))}
    </ul>
  );
}

export const moneyUi = {
  rowForm: styles.rowForm,
  rowActions: styles.rowActions,
  // A text cell that must not shrink to one word per line in a scrolled table.
  wide: styles.wide,
};
