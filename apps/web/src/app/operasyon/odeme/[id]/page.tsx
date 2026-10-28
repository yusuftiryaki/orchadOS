import Link from "next/link";
import { notFound } from "next/navigation";
import {
  requestRefundAction,
  resolveReviewAction,
  voidManualPaymentAction,
} from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import {
  EventDetails,
} from "@/components/back-office/money-ui";
import { Consequence, Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Badge,
  BoResultNotice,
  Facts,
  Submit,
  Warning,
  day,
  money,
  when,
} from "@/components/back-office/parts";
import { statusTone } from "@/components/ui/status";
import { Field } from "@/components/operations/field";
import { Panel } from "@/components/ui/panel";
import { Split } from "@/components/ui/layout";
import styles from "@/components/operations/operations.module.css";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button, buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { getPayment, userName } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.payment;
const REASONS = Object.keys(billingText.refundReason).filter(
  (r) => r !== "provider_mismatch" && r !== "order_closed",
) as (keyof typeof billingText.refundReason)[];
const MISMATCH = ["amount_mismatch", "reference_mismatch"];

// One payment. Left: amounts, internal facts, items, refunds and the
// provider's events. Right: the actions its state allows (fraud review,
// refund request open; voiding a wrong transfer closed until asked for).
// The receipt opens from the header.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSection("operasyon");
  const { id } = await params;
  const supabase = await createClient();
  const view = await getPayment(supabase, id);
  if (!view) notFound();
  const { payment: p, summary, items, events, refunds, internal } = view;
  const manual = p.provider === "manual";
  const mismatch = p.status === "pending_review" && MISMATCH.includes(p.failure_code ?? "");
  const review = p.status === "pending_review" && !mismatch;
  const refundable = summary?.refundable_kurus ?? 0;
  // A transfer on an order still awaiting payment is corrected by voiding it,
  // not refunded (a refund there leaves the order unpayable and uncancellable).
  const refundOpen =
    p.status === "succeeded" &&
    refundable > 0 &&
    !(manual && view.orderStatus === "awaiting_payment");

  const facts: [string, React.ReactNode][] = [
    [B.payments.method, billingText.paymentProvider[p.provider]],
    [
      B.payments.order,
      <Link key="o" href={boHref.order(p.order_id)}>
        {summary?.order_number ?? B.details}
      </Link>,
    ],
    [B.payments.customer, summary?.customer_name],
    [B.payments.amount, money(p.amount_kurus, p.currency)],
  ];
  if (p.provider_amount_kurus != null && p.provider_amount_kurus !== p.amount_kurus) {
    facts.push([T.providerAmount, money(p.provider_amount_kurus, p.currency)]);
  }
  if (!manual && p.paid_kurus != null) {
    facts.push(
      [T.paid, money(p.paid_kurus, p.currency)],
      [T.installment, String(p.installment ?? 1)],
      [
        T.card,
        [p.card_association, p.card_family, p.card_last4 && `•••• ${p.card_last4}`]
          .filter(Boolean)
          .join(" ") || B.none,
      ],
      [T.fraud, p.fraud_status != null ? String(p.fraud_status) : B.none],
    );
  }
  if (manual) {
    facts.push([T.bankReference, p.bank_reference], [T.valueDate, day(p.value_date)]);
  }
  facts.push(
    [B.refunds.title, money(p.refunded_kurus, p.currency)],
    [B.payments.refundable, money(refundable, p.currency)],
    [B.payments.date, when(p.succeeded_at ?? p.failed_at ?? p.initiated_at)],
  );
  if (p.failure_code) {
    facts.push([
      T.failure,
      <span key="f" className={cell.nowrap}>
        {p.failure_code}
      </span>,
    ]);
  }

  const aside = (
    <>
      {review && (
        <Panel title={T.reviewTitle} description={T.reviewHint}>
          <Consequence>
            {B.payments.amount}: <strong>{money(p.amount_kurus, p.currency)}</strong>
          </Consequence>
          <ActionForm action={resolveReviewAction} testId="review-form">
            <input type="hidden" name="payment_id" value={p.id} />
            <Field label={T.providerRef} optional>
              {/* Left empty on purpose: ops pastes the id they checked in the
                  provider panel; a pre-filled value would make it one click. */}
              <input name="provider_ref" maxLength={100} defaultValue="" />
            </Field>
            <Field label={B.internalNote} optional>
              <textarea name="note" maxLength={2000} rows={2} />
            </Field>
            <div className={styles.actions}>
              <Submit name="outcome" value="succeeded">
                {T.outcomeSucceeded}
              </Submit>
              <Submit name="outcome" value="failed" secondary>
                {T.outcomeFailed}
              </Submit>
            </div>
          </ActionForm>
        </Panel>
      )}
      {refundOpen && (
        <Panel title={T.refundTitle} description={T.refundHint}>
          <Consequence>
            {B.payments.refundable}: <strong>{money(refundable, p.currency)}</strong>
          </Consequence>
          <ActionForm action={requestRefundAction} testId="refund-form">
            <input type="hidden" name="payment_id" value={p.id} />
            <Field label={T.refundAmount}>
              <input name="amount" inputMode="decimal" required />
            </Field>
            <Field label={T.refundReason}>
              <select name="reason" defaultValue="" required>
                <option value="" disabled>
                  —
                </option>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {billingText.refundReason[r]}
                  </option>
                ))}
              </select>
            </Field>
            {items.length > 1 && (
              <Field label={T.refundItem} optional>
                <select name="payment_item_id" defaultValue="">
                  <option value="">{T.anyItem}</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.line_no}. {i.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={B.internalNote} optional>
              <textarea name="note" maxLength={2000} rows={2} />
            </Field>
            <div className={styles.actions}>
              <Submit>{T.requestRefund}</Submit>
            </div>
          </ActionForm>
        </Panel>
      )}
      {manual && p.status === "succeeded" && (
        <Disclosure title={T.voidTitle}>
          <Consequence>{T.voidHint}</Consequence>
          <Consequence>
            {B.payments.amount}: <strong>{money(p.amount_kurus, p.currency)}</strong>
          </Consequence>
          <ActionForm action={voidManualPaymentAction} testId="void-form">
            <input type="hidden" name="payment_id" value={p.id} />
            <Field label={B.internalNote}>
              <textarea name="note" maxLength={2000} rows={2} required />
            </Field>
            <div className={styles.actions}>
              <Button type="submit" variant="danger">
                {T.void}
              </Button>
            </div>
          </ActionForm>
        </Disclosure>
      )}
      {!review && !refundOpen && !(manual && p.status === "succeeded") && (
        <Panel title={B.order.actions}>
          <p className="muted">{T.noActions}</p>
        </Panel>
      )}
    </>
  );

  return (
    <main className="page">
      <PageHeader
        title={p.receipt_number ? T.title(p.receipt_number) : T.untitled}
        back={{ href: boHref.payments(), label: B.payments.title }}
        meta={
          <UiBadge tone={statusTone(p.status)} testId="payment-status">
            {billingText.paymentStatus[p.status as keyof typeof billingText.paymentStatus] ??
              p.status}
          </UiBadge>
        }
        actions={
          p.receipt_number ? (
            <a
              className={buttonClass({ variant: "secondary" })}
              href={boHref.receipt(p.id)}
              target="_blank"
              rel="noreferrer"
              data-testid="receipt-link"
            >
              {T.receipt}
            </a>
          ) : undefined
        }
      />
      <BoResultNotice params={await searchParams} />
      {mismatch && <Warning testId="mismatch-banner">{T.mismatch[p.failure_code!]}</Warning>}
      <Split aside={aside}>
        <Panel title={T.summary}>
          <Facts testId="payment-facts" rows={facts} />
        </Panel>

        <Panel title={B.internal}>
          <Facts
            rows={[
              [T.recordedBy, userName(internal.recorded_by) ?? B.none],
              [T.manualNote, (internal.manual_note as string | null) ?? B.none],
              ...(!manual
                ? ([[T.returnOrigin, (internal.return_origin as string | null) ?? B.none]] as [
                    string,
                    string,
                  ][])
                : []),
            ]}
          />
        </Panel>

        <Panel plain title={T.items}>
          <Table data-testid="payment-items">
            <thead>
              <tr>
                <th>{B.quote.line}</th>
                <th className={cell.num}>{B.payments.amount}</th>
                <th className={cell.num}>{T.itemRefunded}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.line_no}. {i.name}
                  </td>
                  <td className={cell.num}>{money(i.amount_kurus, p.currency)}</td>
                  <td className={cell.num}>{money(i.refunded_kurus, p.currency)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Panel>

        <Panel
          plain
          title={T.refunds}
          actions={
            <Link href={boHref.refunds()} className={buttonClass({ variant: "quiet", size: "sm" })}>
              {T.allRefunds}
            </Link>
          }
        >
          {refunds.length === 0 ? (
            <EmptyState compact headingLevel={3} title={B.refunds.empty} />
          ) : (
            <Table data-testid="payment-refunds">
              <thead>
                <tr>
                  <th>{B.refunds.number}</th>
                  <th>{B.refunds.kind}</th>
                  <th className={cell.num}>{B.refunds.amount}</th>
                  <th>{B.refunds.reason}</th>
                  <th>{B.refunds.status}</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id} data-refund-id={r.id} data-status={r.status}>
                    <td className={cell.code}>{r.number}</td>
                    <td className={cell.nowrap}>
                      {billingText.refundKind[r.kind as keyof typeof billingText.refundKind]}
                    </td>
                    <td className={cell.num}>{money(r.amount_kurus, r.currency)}</td>
                    <td>
                      {billingText.refundReason[
                        r.reason as keyof typeof billingText.refundReason
                      ] ?? r.reason}
                    </td>
                    <td>
                      <Badge labels={billingText.refundStatus} value={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        <Panel plain title={T.events}>
          {events.length === 0 ? (
            <EmptyState compact headingLevel={3} title={T.noEvents} />
          ) : (
            <Table data-testid="payment-events">
              <thead>
                <tr>
                  <th>{B.audit.when}</th>
                  <th>{T.eventType}</th>
                  <th>{T.outcome}</th>
                  <th className={cell.num}>{T.http}</th>
                  <th>{T.signature}</th>
                  <th>{B.audit.details}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className={`${cell.num} ${cell.nowrap}`}>{when(e.received_at)}</td>
                    <td className={cell.code}>{e.event_type}</td>
                    <td>{e.outcome ?? B.none}</td>
                    <td className={cell.num}>{e.http_status ?? B.none}</td>
                    <td>{e.signature_valid == null ? B.none : e.signature_valid ? B.yes : B.no}</td>
                    <td>
                      <EventDetails value={e.payload} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </Split>
    </main>
  );
}
