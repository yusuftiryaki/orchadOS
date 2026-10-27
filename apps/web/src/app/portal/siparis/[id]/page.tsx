import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelOrderAction } from "@/app/portal/billing-actions";
import { OrderPay } from "@/components/portal-billing/order-pay";
import { PaymentTable } from "@/components/portal-billing/payment-table";
import { PortalResult } from "@/components/portal-billing/result-notice";
import local from "@/components/portal-billing/portal-billing.module.css";
import ops from "@/components/operations/operations.module.css";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { formatKurus } from "@/lib/billing/money";
import { siteFlags } from "@/lib/flags";
import { formatDate, formatDateTime } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import {
  getOrder,
  getPaymentInstructions,
  liveCardAttempt,
  outstandingKurus,
} from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const O = P.order;

// An order: totals, lines, and while it awaits payment the card button (only
// with the payments flag), the bank transfer details and the cancel button.
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const { id } = await params;
  const supabase = await createClient();
  const view = await getOrder(supabase, user.id, id);
  if (!view) notFound();
  const { order, items, payments, quote } = view;
  const awaiting = order.status === "awaiting_payment";
  const instructions = awaiting ? await getPaymentInstructions(supabase, order.id) : null;
  const { paymentsEnabled } = siteFlags();
  const currency = order.currency;
  const outstanding = outstandingKurus(order);
  const liveAttempt = awaiting ? liveCardAttempt(payments) : null;

  return (
    <main className={styles.page} data-testid="order" data-status={order.status}>
      <div className={styles.titleRow}>
        <h1>{O.title(order.number)}</h1>
        <span className={ops.badge} data-testid="order-status">
          {billingText.orderStatus[order.status]}
        </span>
      </div>
      <PortalResult params={await searchParams} />
      {order.status === "active" && <p className={ops.notice}>{O.activeNote}</p>}

      <section className={styles.section}>
        <dl className={ops.dl}>
          {quote && (
            <>
              <dt>{O.quote}</dt>
              <dd>
                <Link href={portalHref.quote(quote.id)}>{quote.number}</Link> · {quote.package_name}
              </dd>
            </>
          )}
          <dt>{O.total}</dt>
          <dd data-testid="order-total">{formatKurus(order.total_kurus, currency)}</dd>
          <dt>{O.paid}</dt>
          <dd>{formatKurus(order.paid_kurus, currency)}</dd>
          {order.refunded_kurus > 0 && (
            <>
              <dt>{O.refunded}</dt>
              <dd>{formatKurus(order.refunded_kurus, currency)}</dd>
            </>
          )}
          {awaiting && (
            <>
              <dt>{O.outstanding}</dt>
              <dd>{formatKurus(outstanding, currency)}</dd>
              {order.payment_due_at && (
                <>
                  <dt>{O.due}</dt>
                  <dd>{formatDateTime(order.payment_due_at)}</dd>
                </>
              )}
            </>
          )}
          {order.service_start && order.service_end && (
            <>
              <dt>{O.service}</dt>
              <dd>{`${formatDate(order.service_start)} – ${formatDate(order.service_end)}`}</dd>
            </>
          )}
        </dl>
      </section>

      <section className={styles.section}>
        <h2>{O.items}</h2>
        <dl className={local.totals}>
          {items.map((item) => (
            <div key={item.id} style={{ display: "contents" }}>
              <dt>{item.garden_name}</dt>
              <dd>{formatKurus(item.amount_kurus, currency)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {awaiting && (
        <section className={styles.section} data-testid="order-pay">
          <h2>{O.payTitle}</h2>
          <OrderPay
            orderId={order.id}
            paymentsEnabled={paymentsEnabled}
            instructions={instructions}
            liveAttemptId={liveAttempt?.id ?? null}
          />
        </section>
      )}

      {awaiting && (
        <section className={styles.section}>
          <h2>{O.cancelTitle}</h2>
          <p className="muted">{O.cancelBody}</p>
          <form action={cancelOrderAction}>
            <input type="hidden" name="order_id" value={order.id} />
            <button className="button button-secondary" type="submit">
              {O.cancel}
            </button>
          </form>
        </section>
      )}

      <section className={styles.section}>
        <h2>{O.payments}</h2>
        {payments.length === 0 ? (
          <p className="muted">{O.noPayments}</p>
        ) : (
          <PaymentTable payments={payments.map((p) => ({ ...p, order_number: order.number }))} />
        )}
      </section>
    </main>
  );
}
