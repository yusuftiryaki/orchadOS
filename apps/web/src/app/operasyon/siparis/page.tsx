import Link from "next/link";
import bo from "@/components/back-office/back-office.module.css";
import { Badge, day, money } from "@/components/back-office/parts";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { listOrders, listOverdueInstallments } from "@/lib/back-office/data";
import { boHref, pick } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsOrgs } from "@/lib/operations/data";
import { createClient } from "@/lib/supabase/server";

const T = backOfficeText.orders;
const STATUSES = ["awaiting_payment", "active", "completed", "cancelled", "terminated"] as const;

// Orders (ops_orders); overdue payments are highlighted, and installments 30
// or more days past due are listed first (ops_overdue_installments, H35 (c)).
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const status = pick((await searchParams).durum, STATUSES);
  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  const [rows, overdue] = await Promise.all([
    listOrders(supabase, orgs, status),
    listOverdueInstallments(supabase, orgs),
  ]);

  return (
    <main className="page">
      <OpsNav current="orders" />
      <h1>{T.title}</h1>
      <nav className={styles.inline} aria-label={T.status}>
        <Link href={boHref.orders()} aria-current={!status ? "page" : undefined}>
          {backOfficeText.all}
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={boHref.orders({ durum: s })}
            aria-current={status === s ? "page" : undefined}
          >
            {billingText.orderStatus[s]}
          </Link>
        ))}
      </nav>
      {overdue.length > 0 && (
        <section className={styles.section} data-testid="overdue-installments">
          <h2>{T.overdueInstallments}</h2>
          <p className="muted">{T.overdueInstallmentsHint}</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{T.number}</th>
                  <th>{T.customer}</th>
                  <th className={styles.number}>{T.installmentSeq}</th>
                  <th>{T.due}</th>
                  <th className={styles.number}>{T.daysOverdue}</th>
                  <th className={styles.number}>{T.open}</th>
                </tr>
              </thead>
              <tbody>
                {overdue.map((r) => (
                  <tr key={r.installment_id}>
                    <td>
                      <Link href={boHref.order(r.order_id)}>{r.order_number}</Link>
                    </td>
                    <td>{r.customer_name}</td>
                    <td className={styles.number}>{r.seq}</td>
                    <td>{day(r.due_on)}</td>
                    <td className={styles.number}>{r.days_overdue}</td>
                    <td className={styles.number}>{money(r.open_kurus, "TRY")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {rows.length === 0 ? (
        <p className="muted">{T.empty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="order-list">
            <thead>
              <tr>
                <th>{T.number}</th>
                <th>{T.customer}</th>
                <th>{T.package}</th>
                <th className={styles.number}>{T.total}</th>
                <th className={styles.number}>{T.paid}</th>
                <th>{T.due}</th>
                <th>{T.service}</th>
                <th>{T.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr
                  key={o.id}
                  data-order-id={o.id}
                  data-overdue={o.overdue || undefined}
                  className={o.overdue ? bo.highlight : undefined}
                >
                  <td>
                    <Link href={boHref.order(o.id)}>{o.number}</Link>
                    {o.addon_of_order_id && (
                      <span className={styles.badge} data-testid="order-addon-badge">
                        {" "}
                        {T.addon}
                      </span>
                    )}
                  </td>
                  <td>{o.customer_name ?? backOfficeText.none}</td>
                  <td>{o.package_name}</td>
                  <td className={styles.number}>{money(o.total_kurus, o.currency)}</td>
                  <td className={styles.number}>
                    {money(o.paid_kurus - o.refunded_kurus, o.currency)}
                  </td>
                  <td>
                    {o.status === "awaiting_payment" ? day(o.payment_due_at) : backOfficeText.none}
                  </td>
                  <td>
                    {o.service_start
                      ? `${day(o.service_start)} – ${day(o.service_end)}`
                      : backOfficeText.none}
                  </td>
                  <td>
                    <Badge labels={billingText.orderStatus} value={o.status} />
                    {o.overdue && <span className={styles.badgeLate}> {T.overdue}</span>}
                    {o.renewal_due && !o.addon_of_order_id && (
                      <span className={styles.badge}> {T.renewalDue}</span>
                    )}
                    {o.live_payment && <span className={styles.badge}> {T.livePayment}</span>}
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
