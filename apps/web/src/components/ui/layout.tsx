import type { ReactNode } from "react";
import styles from "./layout.module.css";

// Page layout helpers shared by every section (portal, back office, office,
// expert). They only arrange regions; surfaces come from Panel and Table.

// A vertical stack of regions with the screen's rhythm.
export function Stack({ children, gap = "md" }: { children: ReactNode; gap?: "sm" | "md" }) {
  return <div className={gap === "sm" ? styles.stackSm : styles.stack}>{children}</div>;
}

// The record on the left, its summary or actions in a narrow column on the
// right once the content area (not the window) is wide enough; one column
// before that, main first.
export function Split({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <div className={styles.splitBox}>
      <div className={styles.split}>
        <div className={styles.main}>{children}</div>
        <aside className={styles.aside}>{aside}</aside>
      </div>
    </div>
  );
}

// The row above a list: filters or a search on the left, a count or an
// action on the right.
export function Toolbar({ children, end }: { children?: ReactNode; end?: ReactNode }) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarStart}>{children}</div>
      {end && <div className={styles.toolbarEnd}>{end}</div>}
    </div>
  );
}
