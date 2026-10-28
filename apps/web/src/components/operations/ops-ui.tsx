import Link from "next/link";
import type { ReactNode } from "react";
import { formatNumber } from "@/lib/i18n";
import { opsUiText } from "@/lib/i18n/messages/back-office";
import styles from "./ops-ui.module.css";

// Building blocks of the dense operations and back office screens that the
// shared design system (components/ui) does not have yet; proposed for it in
// the wave 2b PR ("Tasarım sistemine önerilenler").

// A titled region of a screen: an h2 (or h3), optional actions on the right,
// a bordered surface. `plain` drops the surface for regions that hold a
// table (the table has its own frame).
export function Panel({
  title,
  description,
  actions,
  children,
  testId,
  plain = false,
  headingLevel = 2,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  testId?: string;
  plain?: boolean;
  headingLevel?: 2 | 3;
  id?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      className={plain ? styles.plain : styles.panel}
      data-testid={testId}
      aria-labelledby={id ? `${id}-title` : undefined}
      id={id}
    >
      <div className={styles.panelHead}>
        <div className={styles.panelText}>
          <Heading id={id ? `${id}-title` : undefined} className={styles.panelTitle}>
            {title}
          </Heading>
          {description && <p className={styles.panelDescription}>{description}</p>}
        </div>
        {actions && <div className={styles.panelActions}>{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export interface FilterItem {
  href: string;
  label: ReactNode;
  count?: number;
  current?: boolean;
}

// Status filters of a list as a segmented control. Each filter is its own
// URL (?durum=), so these are links with aria-current, not buttons.
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
          {item.count != null && (
            <span className={styles.filterCount}>{formatNumber(item.count)}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

// The row above a table: filters or a search on the left, a count or an
// action on the right.
export function Toolbar({ children, end }: { children?: ReactNode; end?: ReactNode }) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarStart}>{children}</div>
      {end && <div className={styles.toolbarEnd}>{end}</div>}
    </div>
  );
}

// One page of a long list. The list is already in memory (the RPCs return
// it whole); this keeps the DOM and the scanning short.
export const PAGE_SIZE = 50;

export function pageOf<T>(rows: T[], param: string | string[] | undefined, size = PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const raw = Number(Array.isArray(param) ? param[0] : param);
  const page = Number.isInteger(raw) && raw >= 1 ? Math.min(raw, pages) : 1;
  return {
    rows: rows.slice((page - 1) * size, page * size),
    page,
    pages,
    total: rows.length,
    size,
  };
}

export function Pagination({
  page,
  pages,
  total,
  size,
  href,
}: {
  page: number;
  pages: number;
  total: number;
  size: number;
  href: (page: number) => string;
}) {
  if (pages <= 1) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const T = opsUiText.pagination;
  return (
    <nav aria-label={T.label} className={styles.pagination}>
      <span className={styles.paginationRange}>{T.range(from, to, total)}</span>
      {page > 1 ? (
        <Link className="button button-secondary button-sm" href={href(page - 1)} rel="prev">
          {T.prev}
        </Link>
      ) : (
        <span className="button button-secondary button-sm" aria-disabled="true">
          {T.prev}
        </span>
      )}
      {page < pages ? (
        <Link className="button button-secondary button-sm" href={href(page + 1)} rel="next">
          {T.next}
        </Link>
      ) : (
        <span className="button button-secondary button-sm" aria-disabled="true">
          {T.next}
        </span>
      )}
    </nav>
  );
}

export interface QueueItem {
  key: string;
  label: ReactNode;
  value: number;
  href: string;
  // How urgent a non-zero value is: "danger" (late, failed), "warning"
  // (waits on us today), "info" (in progress).
  tone?: "danger" | "warning" | "info";
}

// Work queues: a count per kind of work. Non-zero counts are links in their
// tone, most urgent first; the empty queues follow as one quiet line, so what
// needs action stands out and nothing is hidden.
export function QueueList({
  items,
  testId,
  label,
}: {
  items: QueueItem[];
  testId?: string;
  label?: string;
}) {
  const rank = { danger: 0, warning: 1, info: 2 } as const;
  const open = items
    .filter((i) => i.value > 0)
    .sort((a, b) => rank[a.tone ?? "info"] - rank[b.tone ?? "info"]);
  const empty = items.filter((i) => i.value <= 0);
  return (
    <div className={styles.queueWrap} data-testid={testId}>
      {open.length > 0 && (
        <ul className={styles.queues} aria-label={label}>
          {open.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className={styles.queue}
                data-tone={item.tone ?? "info"}
                data-stat={item.key}
              >
                <span className={styles.queueValue}>{formatNumber(item.value)}</span>
                <span className={styles.queueLabel}>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {empty.length > 0 && (
        <ul
          className={styles.queueZero}
          aria-label={label ? opsUiText.queuesEmpty(label) : undefined}
        >
          {empty.map((item) => (
            <li key={item.key} data-stat={item.key}>
              <span className={styles.queueZeroValue}>{formatNumber(item.value)}</span> {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Label → value pairs in a dense two-column list.
export function Facts({
  rows,
  testId,
  none = "—",
}: {
  rows: [ReactNode, ReactNode][];
  testId?: string;
  none?: string;
}) {
  return (
    <dl className={styles.facts} data-testid={testId}>
      {rows.map(([label, value], i) => (
        <div key={i} className={styles.fact}>
          <dt>{label}</dt>
          <dd>{value ?? none}</dd>
        </div>
      ))}
    </dl>
  );
}

// Two columns from 1024px: the record on the left, its actions on the right.
export function Split({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <div className={styles.split}>
      <div className={styles.splitMain}>{children}</div>
      <aside className={styles.splitAside}>{aside}</aside>
    </div>
  );
}

// Table cells that must not wrap (names, dates, amounts on a phone).
export const opsCell = { nowrap: styles.nowrap };

// A vertical stack of regions with the screen's rhythm.
export function Stack({ children, gap = "md" }: { children: ReactNode; gap?: "sm" | "md" }) {
  return <div className={gap === "sm" ? styles.stackSm : styles.stack}>{children}</div>;
}
