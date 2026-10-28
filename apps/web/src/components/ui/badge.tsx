import type { CSSProperties, ReactNode } from "react";
import styles from "./badge.module.css";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "highlight";

// A short state label: "Ödendi", "İncelemede", "Süresi geçti". The tone says
// how the reader should feel about it; the text says what it is.
export function Badge({
  tone = "neutral",
  children,
  testId,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  testId?: string;
}) {
  const cls = tone === "neutral" ? styles.badge : `${styles.badge} ${styles[tone]}`;
  return (
    <span className={cls} data-testid={testId}>
      {children}
    </span>
  );
}

// Tree classes of docs/metodoloji.md §5, plus the planting spot without a
// tree. Colours are the map's (src/lib/map/tree-style.ts).
export type TreeClass =
  "healthy" | "attention" | "problem" | "dead" | "absent" | "unassessed" | "empty";

const CLASS_COLOR: Record<TreeClass, string> = {
  healthy: "var(--class-healthy)",
  attention: "var(--class-attention)",
  problem: "var(--class-problem)",
  dead: "var(--class-dead)",
  absent: "var(--class-absent)",
  unassessed: "var(--class-unassessed)",
  empty: "transparent",
};

export function ClassDot({ value }: { value: TreeClass }) {
  return (
    <span
      className={styles.dot}
      data-class={value}
      style={{ "--dot": CLASS_COLOR[value] } as CSSProperties}
      aria-hidden
    />
  );
}

// A tree's class: a coloured dot and the class name (the colour is never the
// only signal).
export function ClassBadge({ value, children }: { value: TreeClass; children: ReactNode }) {
  return (
    <span className={`${styles.badge} ${styles.class}`}>
      <ClassDot value={value} />
      {children}
    </span>
  );
}
