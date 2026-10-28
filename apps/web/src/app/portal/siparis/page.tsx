import Link from "next/link";
import { PortalResult } from "@/components/portal-billing/result-notice";
import { StatusBadge } from "@/components/portal-billing/status-badge";
import s from "@/components/portal-billing/billing.module.css";
import layout from "@/components/portal/page.module.css";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { formatKurus } from "@/lib/billing/money";
import { formatDate } from "@/lib/i18n";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { listOrders } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const O = P.orders;

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
    <main className={`${layout.page} ${s.doc}`}>
      <PageHeader title={O.title} />
      <PortalResult params={params} />
      {orders.length === 0 ? (
        <EmptyState
          title={O.emptyTitle}
          action={
            <ButtonLink variant="secondary" href={portalHref.applications()}>
              {O.emptyAction}
            </ButtonLink>
          }
        >
          <p>{O.emptyBody}</p>
        </EmptyState>
      ) : (
        <div className={layout.panel}>
          <ul className={layout.rows} data-testid="order-list">
            {orders.map((o) => (
              <li key={o.id} data-order-id={o.id}>
                <div className={layout.rowMain}>
                  <Link href={portalHref.order(o.id)} className={s.rowTitle}>
                    {P.order.title(o.number)}
                  </Link>
                  {o.service_start && o.service_end && (
                    <span className={s.meta}>
                      {O.serviceText(formatDate(o.service_start), formatDate(o.service_end))}
                    </span>
                  )}
                </div>
                <div className={s.rowSide}>
                  <StatusBadge kind="order" status={o.status} />
                  <span className={s.amount}>{formatKurus(o.total_kurus, o.currency)}</span>
                  <span className={s.meta}>
                    {O.paidOf(formatKurus(o.paid_kurus, o.currency))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
