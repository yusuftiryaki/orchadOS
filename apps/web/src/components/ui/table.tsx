import type { ComponentProps, ReactNode } from "react";
import styles from "./table.module.css";

// A bordered, horizontally scrollable table. Cells take `className={cell.num}`
// for right-aligned figures and `cell.code` for tree codes and identifiers.
export function Table({
  caption,
  children,
  className,
  ...props
}: ComponentProps<"table"> & { caption?: ReactNode }) {
  return (
    <div className={styles.wrap}>
      <table className={className ? `${styles.table} ${className}` : styles.table} {...props}>
        {caption && <caption>{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export const cell = { num: styles.num, code: styles.code };
