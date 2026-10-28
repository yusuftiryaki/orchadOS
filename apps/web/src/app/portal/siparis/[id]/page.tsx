import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelOrderAction, reviseOrderAction } from "@/app/portal/billing-actions";
import { ContractDocumentTable } from "@/components/contracts/document-list";
import { InstallmentPlan } from "@/components/portal-billing/installment-plan";
import { NumberedTitle } from "@/components/portal-billing/numbered-title";
import { OrderPay } from "@/components/portal-billing/order-pay";
import { PaymentTable } from "@/components/portal-billing/payment-table";
import { PortalResult } from "@/components/portal-billing/result-notice";
import { StatusBadge } from "@/components/portal-billing/status-badge";
import s from "@/components/portal-billing/billing.module.css";
import layout from "@/components/portal/page.module.css";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { installmentLabel, nextOpen, openKurus } from "@/lib/billing/installments";
import { formatKurus } from "@/lib/billing/money";
import {
  accessTokenOf,
  customerDocuments,
  documentState,
  retryAfterResponse,
  stateRefOf,
} from "@/lib/contracts/generate";
import { siteFlags } from "@/lib/flags";
import { formatDate, formatDateTime } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { contractsText as C } from "@/lib/i18n/messages/contracts";
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
// payment; its contract documents (T04), retried after the response when
// missing (after a failed generation at the acceptance, and the withdrawal
// confirmation once the order is active), or the manual-copy note.
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const [{ id }, query, supabase] = await Promise.all([params, searchParams, createClient()]);
  const view = await getOrder(supabase, user.id, id);
  if (!view) notFound();
  const { order, items, payments, quote, plan } = view;
  const awaiting = order.status === "awaiting_payment";
  const next = nextOpen(plan);
  const payable = (awaiting || order.status === "active") && next !== null;
  const { paymentsEnabled } = siteFlags();
  const currency = order.currency;
  const liveAttempt = payable ? liveCardAttempt(payments) : null;
  // The bank details and the documents do not depend on each other.
  const [instructions, allDocuments] = await Promise.all([
    payable ? getPaymentInstructions(supabase, order.id) : Promise.resolve(null),
    order.quote_id ? customerDocuments(supabase) : Promise.resolve([]),
  ]);
  const documents = allDocuments.filter((d) => d.order_id === order.id);
  const documentsState = order.quote_id
    ? await documentState(supabase, stateRefOf(order), documents).catch(() => null)
    : null;
  if (documentsState?.state === "preparing") {
    const accessToken = await accessTokenOf(supabase);
    if (accessToken) retryAfterResponse(accessToken, order.id);
  }
  const preparing =
    !!order.quote_id &&
    documentsState?.state !== "complete" &&
    documentsState?.state !== "manual_copy";
  const manualCopy = documentsState?.state === "manual_copy";
  const lead = awaiting ? O.awaitingLead : order.status === "active" ? O.activeNote : undefined;

  return (
    <main className={`${layout.page} ${s.doc}`} data-testid="order" data-status={order.status}>
      <PageHeader
        title={<NumberedTitle text={O.title(order.number)} number={order.number} />}
        lead={lead}
        meta={
          <>
            <StatusBadge kind="order" status={order.status} testId="order-status" />
            {order.addon_of_order_id && (
              <Badge tone="info" testId="order-addon">
                {O.addonNote}
              </Badge>
            )}
          </>
        }
        back={{ href: portalHref.orders(), label: P.orders.title }}
      />
      <PortalResult params={query} />

      {payable && (
        <section className={layout.panel} data-testid="order-pay" aria-labelledby="order-pay">
          <h2 id="order-pay">{O.nextPayment}</h2>
          {next && (
            <div className={s.due} data-testid="order-next-payment">
              <p>{installmentLabel(next)}</p>
              <p className={s.dueAmount}>{formatKurus(openKurus(next), currency)}</p>
              <p className={layout.small}>{O.dueOn(formatDate(next.dueOn))}</p>
            </div>
          )}
          <p className={`${layout.muted} ${layout.small}`}>{O.payRule}</p>
          <OrderPay
            orderId={order.id}
            paymentsEnabled={paymentsEnabled}
            instructions={instructions}
            liveAttemptId={liveAttempt?.id ?? null}
          />
        </section>
      )}

      <section className={layout.section} aria-labelledby="order-summary">
        <h2 id="order-summary">{O.summaryTitle}</h2>
        <div className={layout.panel}>
          <dl className={layout.facts}>
            {quote && (
              <>
                <dt>{O.quote}</dt>
                <dd>
                  <Link href={portalHref.quote(quote.id)} className={s.nowrap}>
                    {quote.number}
                  </Link>
                  <br />
                  <span className={layout.small}>{quote.package_name}</span>
                </dd>
              </>
            )}
            {order.service_start && order.service_end && (
              <>
                <dt>{O.service}</dt>
                <dd>
                  <span className={s.nowrap}>{formatDate(order.service_start)}</span> –{" "}
                  <span className={s.nowrap}>{formatDate(order.service_end)}</span>
                </dd>
              </>
            )}
            {!next && awaiting && order.payment_due_at && (
              <>
                <dt>{O.due}</dt>
                <dd>{formatDateTime(order.payment_due_at)}</dd>
              </>
            )}
          </dl>
          <dl className={layout.facts}>
            {items.map((item) => (
              <Fact
                key={item.id}
                label={item.garden_name}
                value={formatKurus(item.amount_kurus, currency)}
              />
            ))}
            <dt className={layout.factsTotal}>{O.total}</dt>
            <dd className={layout.factsTotal} data-testid="order-total">
              {formatKurus(order.total_kurus, currency)}
            </dd>
            <dt>{O.paid}</dt>
            <dd>{formatKurus(order.paid_kurus, currency)}</dd>
            {order.refunded_kurus > 0 && (
              <>
                <dt>{O.refunded}</dt>
                <dd>{formatKurus(order.refunded_kurus, currency)}</dd>
              </>
            )}
          </dl>
        </div>
      </section>

      {plan.length > 0 && (
        <section className={layout.section} data-testid="order-plan">
          <h2>{billingText.plan.title}</h2>
          <InstallmentPlan rows={plan} currency={currency} withStatus />
        </section>
      )}

      <section className={layout.section}>
        <h2>{O.payments}</h2>
        {payments.length === 0 ? (
          <p className={layout.muted}>{O.noPayments}</p>
        ) : (
          <PaymentTable payments={payments.map((p) => ({ ...p, order_number: order.number }))} />
        )}
      </section>

      {order.quote_id && (
        <section className={layout.section} data-testid="order-contracts">
          <h2>{C.list.orderTitle}</h2>
          {documents.length > 0 && (
            <ContractDocumentTable
              documents={documents}
              hrefOf={(d) => `/portal/hesap/sozlesmeler/${d.id}`}
            />
          )}
          {preparing && (
            <Alert tone="info" testId="contracts-preparing">
              {C.list.preparing}
            </Alert>
          )}
          {manualCopy && (
            <Alert tone="info" testId="contracts-manual-copy">
              {C.list.manualCopy}
            </Alert>
          )}
          <p>
            <Link href="/portal/hesap/sozlesmeler">{C.list.orderLink}</Link>
          </p>
        </section>
      )}

      {awaiting && quote?.application_id && (
        <section className={layout.section} data-testid="order-revise">
          <h2>{O.reviseTitle}</h2>
          <form action={reviseOrderAction} className={`${layout.panel} ${s.checks}`}>
            <input type="hidden" name="order_id" value={order.id} />
            <p className={layout.small}>{O.reviseBody}</p>
            <Checkbox id="c-revise-confirm" name="confirm" required label={O.reviseConfirm} />
            <div className={layout.actions}>
              <Button variant="secondary" type="submit">
                {O.revise}
              </Button>
            </div>
          </form>
        </section>
      )}

      {awaiting && (
        <section className={layout.section}>
          <h2>{O.cancelTitle}</h2>
          <form action={cancelOrderAction} className={layout.stack}>
            <input type="hidden" name="order_id" value={order.id} />
            <p className={layout.small}>{O.cancelBody}</p>
            <div className={layout.actions}>
              <Button variant="quiet" type="submit">
                {O.cancel}
              </Button>
            </div>
          </form>
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
