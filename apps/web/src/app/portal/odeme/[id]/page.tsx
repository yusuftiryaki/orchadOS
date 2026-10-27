import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalResult } from "@/components/portal-billing/result-notice";
import ops from "@/components/operations/operations.module.css";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { formatKurus } from "@/lib/billing/money";
import { formatDate, formatDateTime } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { getPayment } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

const T = P.payment;

// Statuses still waiting for the provider: the page reloads itself every 10 s
// (the callback, the webhook or the reconcile job settles them).
const WAITING = new Set(["initiated", "pending_review"]);

// The result page of a payment: the provider's return lands here (§8.4).
export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const { id } = await params;
  const view = await getPayment(await createClient(), user.id, id);
  if (!view) notFound();
  const { payment, items, refunds, order } = view;
  const waiting = WAITING.has(payment.status);
  const failed = payment.status === "failed" || payment.status === "expired";
  const currency = payment.currency;

  return (
    <main className={styles.page} data-testid="payment" data-status={payment.status}>
      {waiting && <meta httpEquiv="refresh" content="10" />}
      <div className={styles.titleRow}>
        <h1>{payment.receipt_number ? T.titleWithReceipt(payment.receipt_number) : T.title}</h1>
        <span className={ops.badge} data-testid="payment-status">
          {billingText.paymentStatus[payment.status]}
        </span>
      </div>
      <PortalResult params={await searchParams} />
      <p
        className={failed ? `${ops.notice} ${ops.error}` : ops.notice}
        role="status"
        data-testid="payment-result"
      >
        {T.results[payment.status]}
      </p>

      <section className={styles.section}>
        <dl className={ops.dl}>
          {order && (
            <>
              <dt>{T.order}</dt>
              <dd>
                <Link href={portalHref.order(order.id)}>{order.number}</Link>
              </dd>
            </>
          )}
          <dt>{T.method}</dt>
          <dd>{billingText.paymentProvider[payment.provider]}</dd>
          <dt>{T.amount}</dt>
          <dd data-testid="payment-amount">{formatKurus(payment.amount_kurus, currency)}</dd>
          <dt>{T.date}</dt>
          <dd>
            {formatDateTime(payment.succeeded_at ?? payment.initiated_at ?? payment.created_at)}
          </dd>
          {(payment.card_association || payment.card_last4) && (
            <>
              <dt>{T.card}</dt>
              <dd>{T.cardText(payment.card_association, payment.card_last4)}</dd>
            </>
          )}
          {payment.installment != null && payment.installment > 1 && (
            <>
              <dt>{T.installment}</dt>
              <dd>{payment.installment}</dd>
            </>
          )}
          {payment.bank_reference && (
            <>
              <dt>{T.bankReference}</dt>
              <dd>{payment.bank_reference}</dd>
            </>
          )}
          {payment.value_date && (
            <>
              <dt>{T.valueDate}</dt>
              <dd>{formatDate(payment.value_date)}</dd>
            </>
          )}
        </dl>
        {items.length > 0 && (
          <ul className={ops.plainList}>
            {items.map((item) => (
              <li key={item.id}>
                {item.name}: {formatKurus(item.amount_kurus, currency)}
              </li>
            ))}
          </ul>
        )}
        <p className={ops.actions}>
          {payment.receipt_number && (
            <a
              className="button"
              href={portalHref.receipt(payment.id)}
              target="_blank"
              rel="noopener"
              data-testid="receipt-link"
            >
              {T.receipt}
            </a>
          )}
          {failed && order && order.status === "awaiting_payment" && (
            <Link className="button button-secondary" href={portalHref.order(order.id)}>
              {T.retry}
            </Link>
          )}
        </p>
      </section>

      {refunds.length > 0 && (
        <section className={styles.section}>
          <h2>{T.refunds}</h2>
          <ul className={ops.plainList}>
            {refunds.map((r) => (
              <li key={r.id}>
                {r.number} · {billingText.refundKind[r.kind]} ·{" "}
                {formatKurus(r.amount_kurus, r.currency)} · {billingText.refundStatus[r.status]}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
