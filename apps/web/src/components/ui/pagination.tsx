import Link from "next/link";
import { t } from "@/lib/i18n";
import styles from "./pagination.module.css";

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

// Previous and next links under a paged list (?sayfa=), with the range shown.
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
  const T = t.ui.pagination;
  return (
    <nav aria-label={T.label} className={styles.pagination}>
      <span className={styles.range}>{T.range(from, to, total)}</span>
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
