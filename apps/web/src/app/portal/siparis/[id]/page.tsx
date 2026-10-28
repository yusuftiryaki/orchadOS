import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelOrderAction, reviseOrderAction } from "@/app/portal/billing-actions";
import { InstallmentPlan } from "@/components/portal-billing/installment-plan";
import { OrderPay } from "@/components/portal-billing/order-pay";
import { PaymentTable } from "@/components/portal-billing/payment-table";
import { PortalResult } from "@/components/portal-billing/result-notice";
import local from "@/components/portal-billing/portal-billing.module.css";
import ops from "@/components/operations/operations.module.css";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { installmentLabel, nextOpen, openKurus } from "@/lib/billing/installments";
import { formatKurus } from "@/lib/billing/money";
import { siteFlags } from "@/lib/flags";
import { formatDate, formatDateTime } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { getOrder, getPaymentInstructions, liveCardAttempt } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const O = P.order;

// An order: totals, lines, its payment plan (installments-v1, H35) and, while
// a payment is open (awaiting payment, or an active order with an open
// installment), the card button for the next payment (only with the payments
// flag) and the bank transfer details; the cancel button before the first
// payment.
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
  const { order, items, payments, quote, plan } = view;
  const awaiting = order.status === "awaiting_payment";
  const next = nextOpen(plan);
  const payable = (awaiting || order.status === "active") && next !== null;
  const instructions = payable ? await getPaymentInstructions(supabase, order.id) : null;
  const { paymentsEnabled } = siteFlags();
  const currency = order.currency;
  const liveAttempt = payable ? liveCardAttempt(payments) : null;

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
      {order.addon_of_order_id && (
        <p className={styles.notice} data-testid="order-addon">
          {O.addonNote}
        </p>
      )}

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
          {next && (
            <>
              <dt>{O.nextPayment}</dt>
              <dd data-testid="order-next-payment">
                {`${installmentLabel(next)} · ${formatKurus(openKurus(next), currency)}`}
              </dd>
              <dt>{O.due}</dt>
              <dd>{formatDate(next.dueOn)}</dd>
            </>
          )}
          {!next && awaiting && order.payment_due_at && (
            <>
              <dt>{O.due}</dt>
              <dd>{formatDateTime(order.payment_due_at)}</dd>
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

      {plan.length > 0 && (
        <section className={styles.section} data-testid="order-plan">
          <h2>{billingText.plan.title}</h2>
          <InstallmentPlan rows={plan} currency={currency} withStatus />
        </section>
      )}

      {payable && (
        <section className={styles.section} data-testid="order-pay">
          <h2>{O.payTitle}</h2>
          {next && (
            <p>{O.payNext(installmentLabel(next), formatKurus(openKurus(next), currency))}</p>
          )}
          <OrderPay
            orderId={order.id}
            paymentsEnabled={paymentsEnabled}
            instructions={instructions}
            liveAttemptId={liveAttempt?.id ?? null}
          />
        </section>
      )}

      {awaiting && quote?.application_id && (
        <section className={styles.section} data-testid="order-revise">
          <h2>{O.reviseTitle}</h2>
          <p className="muted">{O.reviseBody}</p>
          <form action={reviseOrderAction} className={local.checks}>
            <input type="hidden" name="order_id" value={order.id} />
            <label>
              <input type="checkbox" name="confirm" required />
              <span>{O.reviseConfirm}</span>
            </label>
            <p>
              <button className="button button-secondary" type="submit">
                {O.revise}
              </button>
            </p>
          </form>
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
