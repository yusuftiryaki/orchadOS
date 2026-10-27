import Link from "next/link";
import { PortalResult } from "@/components/portal-billing/result-notice";
import ops from "@/components/operations/operations.module.css";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { formatKurus } from "@/lib/billing/money";
import { formatDate } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { listOrders } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const O = P.orders;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const orders = await listOrders(await createClient(), user.id);
  return (
    <main className={styles.page}>
      <h1>{O.title}</h1>
      <PortalResult params={await searchParams} />
      {orders.length === 0 ? (
        <p className="muted">{O.empty}</p>
      ) : (
        <div className={ops.tableWrap}>
          <table className={ops.table} data-testid="order-list">
            <thead>
              <tr>
                <th>{O.number}</th>
                <th>{O.status}</th>
                <th className={ops.number}>{O.total}</th>
                <th className={ops.number}>{O.paid}</th>
                <th>{O.service}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.number}</td>
                  <td>
                    <span className={ops.badge}>{billingText.orderStatus[o.status]}</span>
                  </td>
                  <td className={ops.number}>{formatKurus(o.total_kurus, o.currency)}</td>
                  <td className={ops.number}>{formatKurus(o.paid_kurus, o.currency)}</td>
                  <td>
                    {o.service_start && o.service_end
                      ? `${formatDate(o.service_start)} – ${formatDate(o.service_end)}`
                      : P.none}
                  </td>
                  <td>
                    <Link href={portalHref.order(o.id)}>{O.open}</Link>
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
