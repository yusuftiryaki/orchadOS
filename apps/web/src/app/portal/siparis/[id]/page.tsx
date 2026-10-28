import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelOrderAction, reviseOrderAction } from "@/app/portal/billing-actions";
import { ContractDocumentTable } from "@/components/contracts/document-list";
import { FactRow } from "@/components/portal-billing/fact-row";
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
import { EmptyState } from "@/components/ui/empty-state";
import { factsClass } from "@/components/ui/facts";
import { Checkbox } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, panelClass } from "@/components/ui/panel";
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
    <main className={`${layout.page} ${layout.reading}`} data-testid="order" data-status={order.status}>
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
        <Panel title={O.nextPayment} testId="order-pay" id="order-pay">
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
        </Panel>
      )}

      <Panel title={O.summaryTitle} id="order-summary">
        <dl className={factsClass.list}>
          {quote && (
            <FactRow label={O.quote}>
              <Link href={portalHref.quote(quote.id)} className={s.nowrap}>
                {quote.number}
              </Link>
              <br />
              <span className={layout.small}>{quote.package_name}</span>
            </FactRow>
          )}
          {order.service_start && order.service_end && (
            <FactRow label={O.service}>
              <span className={s.nowrap}>{formatDate(order.service_start)}</span> –{" "}
              <span className={s.nowrap}>{formatDate(order.service_end)}</span>
            </FactRow>
          )}
          {!next && awaiting && order.payment_due_at && (
            <FactRow label={O.due}>{formatDateTime(order.payment_due_at)}</FactRow>
          )}
        </dl>
        <dl className={factsClass.summary}>
          {items.map((item) => (
            <FactRow key={item.id} label={item.garden_name}>
              {formatKurus(item.amount_kurus, currency)}
            </FactRow>
          ))}
          <FactRow label={O.total} testId="order-total" total>
            {formatKurus(order.total_kurus, currency)}
          </FactRow>
          <FactRow label={O.paid}>{formatKurus(order.paid_kurus, currency)}</FactRow>
          {order.refunded_kurus > 0 && (
            <FactRow label={O.refunded}>{formatKurus(order.refunded_kurus, currency)}</FactRow>
          )}
        </dl>
      </Panel>

      {plan.length > 0 && (
        <Panel title={billingText.plan.title} plain testId="order-plan">
          <InstallmentPlan rows={plan} currency={currency} withStatus />
        </Panel>
      )}

      <Panel title={O.payments} plain>
        {payments.length === 0 ? (
          <EmptyState title={O.noPayments} headingLevel={3}>
            <p>{O.noPaymentsBody}</p>
          </EmptyState>
        ) : (
          <PaymentTable payments={payments.map((p) => ({ ...p, order_number: order.number }))} />
        )}
      </Panel>

      {order.quote_id && (
        <Panel title={C.list.orderTitle} plain testId="order-contracts">
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
        </Panel>
      )}

      {awaiting && quote?.application_id && (
        <Panel title={O.reviseTitle} plain testId="order-revise">
          <form action={reviseOrderAction} className={`${panelClass} ${s.checks}`}>
            <input type="hidden" name="order_id" value={order.id} />
            <p className={layout.small}>{O.reviseBody}</p>
            <Checkbox id="c-revise-confirm" name="confirm" required label={O.reviseConfirm} />
            <div className={layout.actions}>
              <Button variant="secondary" type="submit" className={s.longButton}>
                {O.revise}
              </Button>
            </div>
          </form>
        </Panel>
      )}

      {awaiting && (
        <Panel title={O.cancelTitle} plain>
          <form action={cancelOrderAction} className={s.form}>
            <input type="hidden" name="order_id" value={order.id} />
            <p className={layout.small}>{O.cancelBody}</p>
            <div className={layout.actions}>
              <Button variant="danger" type="submit">
                {O.cancel}
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </main>
  );
}
