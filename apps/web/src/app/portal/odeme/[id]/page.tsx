import Link from "next/link";
import { notFound } from "next/navigation";
import { NumberedTitle } from "@/components/portal-billing/numbered-title";
import { PortalResult } from "@/components/portal-billing/result-notice";
import { StatusBadge, statusTone } from "@/components/portal-billing/status-badge";
import s from "@/components/portal-billing/billing.module.css";
import layout from "@/components/portal/page.module.css";
import { Alert, type AlertTone } from "@/components/ui/alert";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { installmentLabel } from "@/lib/billing/installments";
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
// The outcome first, then the receipt (or the way back to the order after a
// failure), then the facts of the payment.
export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const [{ id }, query, supabase] = await Promise.all([params, searchParams, createClient()]);
  const view = await getPayment(supabase, user.id, id);
  if (!view) notFound();
  const { payment, items, refunds, order, planInstallment } = view;
  const waiting = WAITING.has(payment.status);
  const failed = payment.status === "failed" || payment.status === "expired";
  const currency = payment.currency;
  const tone = statusTone("payment", payment.status);
  const retry =
    failed && order && (order.status === "awaiting_payment" || order.status === "active");

  return (
    <main className={`${layout.page} ${s.doc}`} data-testid="payment" data-status={payment.status}>
      {waiting && <meta httpEquiv="refresh" content="10" />}
      <PageHeader
        title={
          payment.receipt_number ? (
            <NumberedTitle
              text={T.titleWithReceipt(payment.receipt_number)}
              number={payment.receipt_number}
            />
          ) : (
            T.title
          )
        }
        meta={<StatusBadge kind="payment" status={payment.status} testId="payment-status" />}
        back={{ href: portalHref.payments(), label: P.payments.title }}
      />
      <PortalResult params={query} />
      <Alert
        tone={(tone === "highlight" ? "neutral" : tone) as AlertTone}
        role="status"
        testId="payment-result"
      >
        {T.results[payment.status]}
      </Alert>
      {(payment.receipt_number || retry) && (
        <div className={layout.actions}>
          {payment.receipt_number && (
            <a
              className={buttonClass()}
              href={portalHref.receipt(payment.id)}
              target="_blank"
              rel="noopener"
              data-testid="receipt-link"
            >
              {T.receipt}
            </a>
          )}
          {retry && <ButtonLink href={portalHref.order(order.id)}>{T.retry}</ButtonLink>}
        </div>
      )}

      <section className={layout.panel} aria-labelledby="payment-facts">
        <h2 id="payment-facts" className="sr-only">
          {T.title}
        </h2>
        <dl className={layout.facts}>
          <dt>{T.amount}</dt>
          <dd className={layout.factsTotal} data-testid="payment-amount">
            {formatKurus(payment.amount_kurus, currency)}
          </dd>
          {order && (
            <>
              <dt>{T.order}</dt>
              <dd>
                <Link href={portalHref.order(order.id)} className={s.nowrap}>
                  {order.number}
                </Link>
              </dd>
            </>
          )}
          {planInstallment && (
            <>
              <dt>{T.planInstallment}</dt>
              <dd data-testid="payment-installment">
                {T.planInstallmentText(
                  planInstallment.row.seq,
                  planInstallment.count,
                  installmentLabel(planInstallment.row),
                )}
              </dd>
            </>
          )}
          <dt>{T.method}</dt>
          <dd>{billingText.paymentProvider[payment.provider]}</dd>
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
      </section>

      {items.length > 0 && (
        <section className={layout.section}>
          <h2>{T.itemsTitle}</h2>
          <div className={layout.panel}>
            <dl className={layout.facts}>
              {items.map((item) => (
                <Fact
                  key={item.id}
                  label={item.name}
                  value={formatKurus(item.amount_kurus, currency)}
                />
              ))}
            </dl>
          </div>
        </section>
      )}

      {refunds.length > 0 && (
        <section className={layout.section}>
          <h2>{T.refunds}</h2>
          <div className={layout.panel}>
            <ul className={layout.rows}>
              {refunds.map((r) => (
                <li key={r.id}>
                  <div className={layout.rowMain}>
                    <span className={s.rowTitle}>{r.number}</span>
                    <span className={s.meta}>{billingText.refundKind[r.kind]}</span>
                  </div>
                  <div className={s.rowSide}>
                    <StatusBadge kind="refund" status={r.status} />
                    <span className={s.amount}>{formatKurus(r.amount_kurus, r.currency)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
