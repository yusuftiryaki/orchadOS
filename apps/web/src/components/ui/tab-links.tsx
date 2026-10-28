import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./tabs.module.css";

export interface TabLinkItem {
  href: string;
  label: ReactNode;
  current?: boolean;
}

// Sub-pages of one screen as tabs (Karne / Harita / Gezi). Each tab is a
// page, so this is a nav with aria-current, not an ARIA tablist.
export function TabLinks({ label, items }: { label: string; items: TabLinkItem[] }) {
  return (
    <nav aria-label={label} className={styles.list}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={styles.tab}
          aria-current={item.current ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
