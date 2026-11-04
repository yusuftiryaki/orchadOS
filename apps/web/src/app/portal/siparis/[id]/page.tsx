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
import {
  DetailHeader,
  DetailLayout,
  Lifecycle,
  Section,
  SummaryCard,
  workClass as w,
  type FlowNote,
} from "@/components/portal-billing/workspace";
import layout from "@/components/portal/page.module.css";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { factsClass } from "@/components/ui/facts";
import { Checkbox } from "@/components/ui/field";
import { IconCalendar } from "@/components/ui/icons";
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

  const flow: { current: number; note: FlowNote } | null = awaiting
    ? { current: 2, note: "pay" }
    : order.status === "active"
      ? { current: 3, note: "active" }
      : order.status === "completed"
        ? { current: 4, note: "done" }
        : null;
  const remaining = Math.max(0, order.total_kurus - order.paid_kurus);
  const paidShare =
    order.total_kurus > 0
      ? Math.min(100, Math.round((order.paid_kurus / order.total_kurus) * 100))
      : 0;

  return (
    <main className={layout.page} data-testid="order" data-status={order.status}>
      <DetailHeader
        title={<NumberedTitle text={O.title(order.number)} number={order.number} />}
        badges={
          <>
            <StatusBadge kind="order" status={order.status} testId="order-status" />
            {order.addon_of_order_id && (
              <Badge tone="info" testId="order-addon">
                {O.addonNote}
              </Badge>
            )}
          </>
        }
        lead={lead}
        back={{ href: portalHref.orders(), label: P.orders.title }}
      />
      <PortalResult params={query} />
      {flow && <Lifecycle current={flow.current} note={flow.note} />}

      <DetailLayout
        asideFirst={!payable}
        aside={
          <SummaryCard id="order-summary" title={O.summaryTitle}>
            <dl className={factsClass.summary}>
              {items.map((item) => (
                <FactRow key={item.id} label={item.garden_name}>
                  {formatKurus(item.amount_kurus, currency)}
                </FactRow>
              ))}
              <FactRow label={O.total} testId="order-total" total>
                {formatKurus(order.total_kurus, currency)}
              </FactRow>
            </dl>
            <div className={w.paidBox}>
              <div className={w.kv}>
                <span>{O.paid}</span>
                <span>{formatKurus(order.paid_kurus, currency)}</span>
              </div>
              <div className={w.meter} role="img" aria-label={`${O.paid}: %${paidShare}`}>
                <span style={{ width: `${paidShare}%` }} />
              </div>
              {order.refunded_kurus > 0 && (
                <div className={w.kv}>
                  <span>{O.refunded}</span>
                  <span>{formatKurus(order.refunded_kurus, currency)}</span>
                </div>
              )}
              {remaining > 0 && order.status !== "cancelled" && (
                <div className={w.kv}>
                  <span>{O.outstanding}</span>
                  <span>{formatKurus(remaining, currency)}</span>
                </div>
              )}
            </div>
            <dl className={`${factsClass.list} ${w.transfer}`}>
              {quote && (
                <FactRow label={O.quote}>
                  <Link href={portalHref.quote(quote.id)} className={s.nowrap}>
                    {quote.number}
                  </Link>
                  {` · ${quote.package_name}`}
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
          </SummaryCard>
        }
        end={
          awaiting && (
            <>
              {quote?.application_id && (
                <form
                  action={reviseOrderAction}
                  className={w.danger}
                  data-testid="order-revise"
                  aria-labelledby="order-revise-title"
                >
                  <input type="hidden" name="order_id" value={order.id} />
                  <h2 id="order-revise-title" className={w.dangerTitle}>
                    {O.reviseTitle}
                  </h2>
                  <p className={w.fine}>{O.reviseBody}</p>
                  <Checkbox id="c-revise-confirm" name="confirm" required label={O.reviseConfirm} />
                  <div>
                    <Button variant="secondary" type="submit" className={s.longButton}>
                      {O.revise}
                    </Button>
                  </div>
                </form>
              )}
              <form
                action={cancelOrderAction}
                className={w.danger}
                aria-labelledby="order-cancel-title"
              >
                <input type="hidden" name="order_id" value={order.id} />
                <div className={w.dangerRow}>
                  <div>
                    <h2 id="order-cancel-title" className={w.dangerTitle}>
                      {O.cancelTitle}
                    </h2>
                    <p className={w.fine}>{O.cancelBody}</p>
                  </div>
                  <Button variant="secondary" className={w.dangerButton} type="submit">
                    {O.cancel}
                  </Button>
                </div>
              </form>
            </>
          )
        }
      >
        {payable && (
          <section
            className={w.payCard}
            data-testid="order-pay"
            id="order-pay"
            aria-labelledby="order-pay-title"
          >
            {next && (
              <div className={w.payDue} data-testid="order-next-payment">
                <div className={w.figure}>
                  <h2 id="order-pay-title" className={w.figureLabel}>
                    {`${O.nextPayment}: ${installmentLabel(next)}`}
                  </h2>
                  <p className={w.figureValue}>{formatKurus(openKurus(next), currency)}</p>
                </div>
                <p className={w.dueChip}>
                  <IconCalendar size={16} />
                  {O.dueOn(formatDate(next.dueOn))}
                </p>
              </div>
            )}
            {!next && (
              <h2 id="order-pay-title" className="sr-only">
                {O.nextPayment}
              </h2>
            )}
            <OrderPay
              orderId={order.id}
              paymentsEnabled={paymentsEnabled}
              instructions={instructions}
              liveAttemptId={liveAttempt?.id ?? null}
            />
            <p className={`${w.fine} ${w.payRule}`}>{O.payRule}</p>
          </section>
        )}

        {plan.length > 0 && (
          <Section title={billingText.plan.title} id="order-plan-section" testId="order-plan">
            <InstallmentPlan rows={plan} currency={currency} withStatus />
          </Section>
        )}

        <Section title={O.payments} id="order-payments-section">
          {payments.length === 0 ? (
            <EmptyState title={O.noPayments} headingLevel={3} compact>
              <p>{O.noPaymentsBody}</p>
            </EmptyState>
          ) : (
            <PaymentTable payments={payments.map((p) => ({ ...p, order_number: order.number }))} />
          )}
        </Section>

        {order.quote_id && (
          <Section
            title={C.list.orderTitle}
            id="order-contracts-section"
            testId="order-contracts"
            actions={
              <Link href="/portal/hesap/sozlesmeler" className={w.sectionLink}>
                {C.list.orderLink}
              </Link>
            }
          >
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
          </Section>
        )}
      </DetailLayout>
    </main>
  );
}
