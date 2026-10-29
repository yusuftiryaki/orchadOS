"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { searchCustomersAction } from "@/app/operasyon/back-office-actions";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { Pagination, pageOf } from "@/components/ui/pagination";
import { Toolbar } from "@/components/ui/layout";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, cell } from "@/components/ui/table";
import { boHref } from "@/lib/back-office/urls";
import { formatNumber, t } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { opsHref } from "@/lib/operations/urls";
import type { CustomerListView } from "./customer-rows";
import styles from "./customer-list.module.css";

const T = t.operations;
const B = backOfficeText;
const C = B.customers;

export type CustomerSource = "self" | "ops" | null;

// The owners list with its search. The search term (a name, phone or e-mail)
// is posted to a server action, never put in the URL; the answer replaces the
// rows rendered with the page. The form is not a native form action, so the
// typed term stays in the field. The source filter (?kaynak=) and the page
// (?sayfa=) are links: they hold no personal data. The page renders this with
// key={source}, so changing the source starts without a search.
export function CustomerList({
  initial,
  source,
  page,
  counts,
}: {
  initial: CustomerListView;
  source: CustomerSource;
  page: string | string[] | undefined;
  // Rows of the whole list by source, for the filter tabs.
  counts: { all: number; self: number; ops: number };
}) {
  const [state, search] = useActionState(searchCustomersAction, null);
  const [pending, startTransition] = useTransition();
  // "Aramayı temizle" hides the last answer without a request.
  const [cleared, setCleared] = useState<typeof state>(null);
  const searched = state !== null && state !== cleared;
  const view = searched ? state : initial;
  const form = useRef<HTMLFormElement>(null);
  const rows = view.rows.filter((c) => source === null || c.self === (source === "self"));
  const shown = pageOf(rows, page);
  const href = (query: { kaynak?: CustomerSource; sayfa?: number }) => {
    const base = boHref.customers({ kaynak: query.kaynak });
    return query.sayfa && query.sayfa > 1
      ? `${base}${base.includes("?") ? "&" : "?"}sayfa=${query.sayfa}`
      : base;
  };

  return (
    <div className={styles.list}>
      <form
        ref={form}
        className={styles.search}
        method="post"
        role="search"
        aria-label={C.searchLabel}
        data-testid="owner-filter"
        aria-busy={pending || undefined}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => search(data));
        }}
      >
        {source === "self" && <input type="hidden" name="kaynak" value="self" />}
        <label htmlFor="owner-search" className={styles.label}>
          {C.search}
        </label>
        <div className={styles.row}>
          <input
            id="owner-search"
            type="search"
            name="q"
            maxLength={100}
            autoComplete="off"
            className={styles.input}
          />
          <Button variant="secondary" type="submit" disabled={pending}>
            {C.searchSubmit}
          </Button>
          {searched && (
            <Button
              variant="quiet"
              onClick={() => {
                form.current?.reset();
                setCleared(state);
              }}
            >
              {C.searchClear}
            </Button>
          )}
        </div>
      </form>
      <Toolbar
        end={
          <span data-testid="owner-count">
            {searched
              ? C.searchCount(formatNumber(rows.length))
              : C.count(formatNumber(rows.length))}
          </span>
        }
      >
        <FilterTabs
          label={C.source}
          testId="owner-source"
          items={[
            { href: href({}), label: B.all, count: counts.all, current: source === null },
            {
              href: href({ kaynak: "self" }),
              label: C.sourceSelf,
              count: counts.self,
              current: source === "self",
            },
            {
              href: href({ kaynak: "ops" }),
              label: C.sourceOps,
              count: counts.ops,
              current: source === "ops",
            },
          ]}
        />
      </Toolbar>
      {view.truncated && (
        <p className="muted" data-testid="owner-list-truncated">
          {C.truncated}
        </p>
      )}
      {rows.length === 0 ? (
        searched ? (
          <EmptyState title={C.empty}>
            <p>{C.emptyHint}</p>
          </EmptyState>
        ) : (
          <EmptyState
            title={source === null ? T.owners.empty : C.emptySource}
            action={<ButtonLink href={opsHref.newOwner()}>{T.nav.newOwner}</ButtonLink>}
          >
            <p>{C.emptyAllHint}</p>
          </EmptyState>
        )
      ) : (
        <>
          <Table data-testid="owner-list">
            <thead>
              <tr>
                <th>{T.columns.name}</th>
                <th>{T.columns.phone}</th>
                <th>{T.columns.contact}</th>
                <th>{C.source}</th>
                <th className={cell.num}>{C.parcels}</th>
                <th className={cell.num}>{C.openOrders}</th>
                <th className={cell.num}>{C.paid}</th>
                <th>{T.columns.kvkk}</th>
              </tr>
            </thead>
            <tbody>
              {shown.rows.map((c) => (
                <tr key={c.profileId} data-profile-id={c.profileId}>
                  <td className={cell.nowrap}>
                    <Link href={opsHref.owner(c.profileId)}>{c.name}</Link>
                  </td>
                  <td className={cell.nowrap}>{c.phone}</td>
                  <td>{c.contact}</td>
                  <td data-source={c.self ? "self" : "ops"}>
                    {c.self ? C.sourceSelf : C.sourceOps}
                  </td>
                  <td className={cell.num}>{c.parcels}</td>
                  <td className={cell.num}>{c.openOrders}</td>
                  <td className={`${cell.num} ${cell.nowrap}`}>{c.paid}</td>
                  <td className={cell.nowrap}>
                    {c.kvkkOk ? c.kvkk : <Badge tone="warning">{c.kvkk}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination {...shown} href={(p) => href({ kaynak: source, sayfa: p })} />
        </>
      )}
    </div>
  );
}
