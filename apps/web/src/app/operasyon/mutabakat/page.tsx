import Link from "next/link";
import { resolveReconciliationAction } from "@/app/operasyon/mutabakat/actions";
import bo from "@/components/back-office/back-office.module.css";
import { day, money } from "@/components/back-office/parts";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { ResultNotice } from "@/components/operations/result-notice";
import { requireSection } from "@/lib/auth/session";
import { boHref } from "@/lib/back-office/urls";
import { visitsText } from "@/lib/i18n/messages/visits";
import { opsOrgs } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { createClient } from "@/lib/supabase/server";

const T = visitsText.reconciliation;

// The 8A reconciliation tasks (T06, contract 8A/6; kararlar.md H21): lines
// whose periodic visits fell short at a window or period end, with the day
// the refund is due (14 days after) and an overdue badge. Open ones by
// default (?durum=all for all). Ops only.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const params = await searchParams;
  const all = params.durum === "all";
  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  const rows = (
    await Promise.all(
      orgs.map(async (o) => {
        const { data } = await supabase.rpc("ops_visit_reconciliations", {
          p_org_id: o.id,
          ...(all ? { p_status: "all" } : {}),
        });
        return data ?? [];
      }),
    )
  ).flat();

  return (
    <main className="page">
      <OpsNav current="reconciliation" />
      <h1>{T.title}</h1>
      <p className="muted">{T.lead}</p>
      <ResultNotice params={params} />
      <nav className={styles.inline}>
        <Link href={opsHref.reconciliation()} aria-current={all ? undefined : "page"}>
          {T.open}
        </Link>
        <Link href={opsHref.reconciliation({ durum: "all" })} aria-current={all ? "page" : undefined}>
          {T.all}
        </Link>
      </nav>
      {rows.length === 0 ? (
        <p className="muted">{T.empty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="reconciliation-list">
            <thead>
              <tr>
                <th>{T.columns.customer}</th>
                <th>{T.columns.garden}</th>
                <th>{T.columns.order}</th>
                <th>{T.columns.trigger}</th>
                <th>{T.columns.visits}</th>
                <th className={styles.number}>{T.columns.shortfall}</th>
                <th className={styles.number}>{T.columns.fee}</th>
                <th>{T.columns.due}</th>
                <th>{T.columns.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  data-reconciliation-id={r.id}
                  data-overdue={r.overdue || undefined}
                  className={r.overdue ? bo.highlight : undefined}
                >
                  <td>{r.customer_name ?? "—"}</td>
                  <td>{r.parcel_name}</td>
                  <td>
                    <Link href={boHref.order(r.order_id)}>{r.order_number}</Link>
                  </td>
                  <td>
                    {T.trigger[r.trigger] ?? r.trigger} · {r.window_label ?? day(r.scope_end)}
                  </td>
                  <td>{T.visits(r.visits_used, r.visits_entitled, r.visits_refunded, r.visits_carried)}</td>
                  <td className={styles.number}>{r.shortfall}</td>
                  <td className={styles.number}>{money(r.visit_fee_kurus)}</td>
                  <td>
                    {day(r.due_on)}
                    {r.overdue && (
                      <span className={styles.badgeLate} data-testid="reconciliation-overdue">
                        {" "}
                        {T.overdue}
                      </span>
                    )}
                  </td>
                  <td>
                    {r.status === "open" ? (
                      <form action={resolveReconciliationAction} className={styles.actions}>
                        <input type="hidden" name="id" value={r.id} />
                        <select name="resolution" required defaultValue="">
                          <option value="" disabled>
                            —
                          </option>
                          {Object.entries(T.resolution).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <input name="note" placeholder={T.note} maxLength={2000} />
                        <button className="button button-secondary" type="submit">
                          {T.resolve}
                        </button>
                      </form>
                    ) : (
                      <>
                        {T.resolved} · {r.resolution ? T.resolution[r.resolution] : ""}
                        {r.resolution_note ? ` · ${r.resolution_note}` : ""}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
