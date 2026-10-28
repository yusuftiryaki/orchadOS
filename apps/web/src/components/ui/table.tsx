import type { ComponentProps, ReactNode } from "react";
import { ScrollBox } from "./scroll-box";
import styles from "./table.module.css";

// A bordered, horizontally scrollable table. Cells take `className={cell.num}`
// for right-aligned figures, `cell.code` for tree codes and identifiers and
// `cell.nowrap` for names, dates and amounts that must stay on one line. A
// `tfoot` row reads as the total. `label` names the scroll region when the
// table is wider than the screen (defaults to a string caption).
export function Table({
  caption,
  label,
  children,
  className,
  ...props
}: ComponentProps<"table"> & { caption?: ReactNode; label?: string }) {
  return (
    <ScrollBox
      className={styles.wrap}
      label={label ?? (typeof caption === "string" ? caption : undefined)}
    >
      <table className={className ? `${styles.table} ${className}` : styles.table} {...props}>
        {caption && <caption>{caption}</caption>}
        {children}
      </table>
    </ScrollBox>
  );
}

// `cell.nowrap` keeps a name, date or amount on one line in a scrolled table.
export const cell = { num: styles.num, code: styles.code, nowrap: styles.nowrap };
