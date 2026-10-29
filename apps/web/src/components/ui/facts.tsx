import type { ReactNode } from "react";
import styles from "./facts.module.css";

// Label → value pairs as a description list. `list` (the default) reads a
// record: labels on the left in a narrow column, values beside them. `summary`
// reads money: values right-aligned and tabular, with an optional total under
// a rule ("Toplam (KDV dahil)"). Both stack on the narrowest phones.
export function Facts({
  rows,
  total,
  variant = "list",
  testId,
  none = "—",
}: {
  rows: [ReactNode, ReactNode][];
  total?: [ReactNode, ReactNode];
  variant?: "list" | "summary";
  testId?: string;
  none?: string;
}) {
  return (
    <dl className={variant === "summary" ? styles.summary : styles.facts} data-testid={testId}>
      {rows.map(([label, value], i) => (
        <div key={i} className={styles.fact}>
          <dt>{label}</dt>
          <dd>{value ?? none}</dd>
        </div>
      ))}
      {total && (
        <div className={`${styles.fact} ${styles.total}`}>
          <dt>{total[0]}</dt>
          <dd>{total[1]}</dd>
        </div>
      )}
    </dl>
  );
}

// The classes of Facts, for a list whose rows carry their own markup (test
// ids on a value, a row that is conditional): <dl className={factsClass.summary}>
// with <div className={factsClass.fact}><dt/><dd/></div> rows.
export const factsClass = {
  list: styles.facts,
  summary: styles.summary,
  fact: styles.fact,
  total: `${styles.fact} ${styles.total}`,
};
