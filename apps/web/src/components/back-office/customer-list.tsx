"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { searchCustomersAction } from "@/app/operasyon/back-office-actions";
import styles from "@/components/operations/operations.module.css";
import { t } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { opsHref } from "@/lib/operations/urls";
import type { CustomerListView } from "./customer-rows";

const T = t.operations;
const C = backOfficeText.customers;

// The owners list with its search. The search term (a name, phone or e-mail)
// is posted to a server action, never put in the URL; the answer replaces the
// rows rendered with the page. The form is not a native form action, so the
// typed term stays in the field.
export function CustomerList({
  initial,
  selfOnly,
}: {
  initial: CustomerListView;
  selfOnly: boolean;
}) {
  const [state, search] = useActionState(searchCustomersAction, null);
  const [pending, startTransition] = useTransition();
  const view = state ?? initial;
  const searched = state !== null;

  return (
    <>
      <form
        className={styles.inline}
        method="post"
        data-testid="owner-filter"
        aria-busy={pending || undefined}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => search(data));
        }}
      >
        <label>
          {C.search}
          <input type="search" name="q" maxLength={100} autoComplete="off" />
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="kaynak" value="self" defaultChecked={selfOnly} />
          {C.selfOnly}
        </label>
        <button className="button button-secondary" type="submit" disabled={pending}>
          {backOfficeText.filter}
        </button>
      </form>
      {view.truncated && (
        <p className="muted" data-testid="owner-list-truncated">
          {C.truncated}
        </p>
      )}
      {view.rows.length === 0 ? (
        <p className="muted">{searched || selfOnly ? C.empty : T.owners.empty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="owner-list">
            <thead>
              <tr>
                <th>{T.columns.name}</th>
                <th>{T.columns.phone}</th>
                <th>{T.columns.contact}</th>
                <th>{C.source}</th>
                <th className={styles.number}>{C.parcels}</th>
                <th className={styles.number}>{C.openOrders}</th>
                <th className={styles.number}>{C.paid}</th>
                <th>{T.columns.kvkk}</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((c) => (
                <tr key={c.profileId} data-profile-id={c.profileId}>
                  <td>
                    <Link href={opsHref.owner(c.profileId)}>{c.name}</Link>
                  </td>
                  <td>{c.phone}</td>
                  <td>{c.contact}</td>
                  <td>
                    <span className={styles.badge} data-source={c.self ? "self" : "ops"}>
                      {c.self ? C.sourceSelf : C.sourceOps}
                    </span>
                  </td>
                  <td className={styles.number}>{c.parcels}</td>
                  <td className={styles.number}>{c.openOrders}</td>
                  <td className={styles.number}>{c.paid}</td>
                  <td>{c.kvkk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
