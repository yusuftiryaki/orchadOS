import type { ReactNode } from "react";
import styles from "./money-ui.module.css";

// Small layout pieces of the order, payment, refund and reconciliation
// screens. The rare-action disclosure and its consequence line are
// components/ui/disclosure.tsx.

export function Badges({ children }: { children: ReactNode }) {
  return <span className={styles.badges}>{children}</span>;
}

// A second line in a table cell, quieter than the first.
export function Sub({ children, code = false }: { children: ReactNode; code?: boolean }) {
  return <span className={code ? `${styles.sub} ${styles.code}` : styles.sub}>{children}</span>;
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
