import Link from "next/link";
import { PortalResult } from "@/components/portal-billing/result-notice";
import { NumberedTitle } from "@/components/portal-billing/numbered-title";
import { StatusBadge } from "@/components/portal-billing/status-badge";
import { listClass } from "@/components/portal-billing/workspace";
import layout from "@/components/portal/page.module.css";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { IconChevronRight } from "@/components/ui/icons";
import { requireSection } from "@/lib/auth/session";
import { formatKurus } from "@/lib/billing/money";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { listOrders } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const O = P.orders;
const W = P.work;

// The customer's orders, newest first: number, state, service period, total
// and what is paid.
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const [orders, params] = await Promise.all([
    createClient().then((supabase) => listOrders(supabase, user.id)),
    searchParams,
  ]);
  return (
    <main className={layout.page}>
      <PageHeader title={O.title} />
      <PortalResult params={params} />
      {orders.length === 0 ? (
        <EmptyState
          title={O.emptyTitle}
          action={<ButtonLink href={portalHref.applications()}>{O.emptyAction}</ButtonLink>}
        >
          <p>{O.emptyBody}</p>
        </EmptyState>
      ) : (
        <div className={listClass.box}>
          <table className={listClass.table} data-testid="order-list">
            <thead>
              <tr>
                <th scope="col">{W.orderCol}</th>
                <th scope="col">{W.statusCol}</th>
                <th scope="col">{W.paidCol}</th>
                <th scope="col" className={listClass.num}>
                  {W.totalCol}
                </th>
                <th scope="col">
                  <span className="sr-only">{O.open}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} data-order-id={o.id}>
                  <td className={listClass.primary}>
                    <Link href={portalHref.order(o.id)} className={listClass.rowLink}>
                      <NumberedTitle text={P.order.title(o.number)} number={o.number} />
                    </Link>
                    {o.service_start && o.service_end && (
                      <span className={listClass.sub}>
                        {O.serviceText(formatDate(o.service_start), formatDate(o.service_end))}
                      </span>
                    )}
                  </td>
                  <td className={listClass.status}>
                    <StatusBadge kind="order" status={o.status} />
                  </td>
                  <td className={listClass.muted} data-label={W.paidCol}>
                    {formatKurus(o.paid_kurus, o.currency)}
                  </td>
                  <td className={listClass.num}>{formatKurus(o.total_kurus, o.currency)}</td>
                  <td className={listClass.chevron}>
                    <IconChevronRight size={18} />
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
