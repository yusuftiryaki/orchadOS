import Link from "next/link";
import type { ReactNode } from "react";
import { formatNumber } from "@/lib/i18n";
import styles from "./filter-tabs.module.css";

export interface FilterItem {
  href: string;
  label: ReactNode;
  count?: number;
  current?: boolean;
}

// The filters of a list as a segmented control ("Tümü 12", "İncelemede 3").
// Each filter is its own URL (?durum=), so these are links with
// aria-current, not buttons. Use Tabs for in-page panels and TabLinks for the
// sub-pages of a screen.
export function FilterTabs({
  label,
  items,
  testId,
}: {
  label: string;
  items: FilterItem[];
  testId?: string;
}) {
  return (
    <nav aria-label={label} className={styles.filters} data-testid={testId}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={styles.filter}
          aria-current={item.current ? "page" : undefined}
        >
          {item.label}
          {item.count != null && <span className={styles.count}>{formatNumber(item.count)}</span>}
        </Link>
      ))}
    </nav>
  );
}
