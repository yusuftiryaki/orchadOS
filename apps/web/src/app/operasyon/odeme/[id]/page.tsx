import Link from "next/link";
import { notFound } from "next/navigation";
import {
  requestRefundAction,
  resolveReviewAction,
  voidManualPaymentAction,
} from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import bo from "@/components/back-office/back-office.module.css";
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
import { Field } from "@/components/operations/field";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
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

// One payment: amounts, items, the provider's events, refunds, the receipt,
// and the actions: fraud review, refund request, voiding a wrong transfer.
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

  return (
    <main className="page">
      <OpsNav current="payments" />
      <p>
        <Link href={boHref.payments()}>← {B.payments.title}</Link>
      </p>
      <h1>{p.receipt_number ? T.title(p.receipt_number) : T.untitled}</h1>
      <BoResultNotice params={await searchParams} />
      {mismatch && <Warning testId="mismatch-banner">{T.mismatch[p.failure_code!]}</Warning>}
      <Facts
        testId="payment-facts"
        rows={[
          [
            B.payments.status,
            <Badge key="s" labels={billingText.paymentStatus} value={p.status} />,
          ],
          [B.payments.method, billingText.paymentProvider[p.provider]],
          [
            B.payments.order,
            <Link key="o" href={boHref.order(p.order_id)}>
              {summary?.order_number ?? B.details}
            </Link>,
          ],
          [B.payments.customer, summary?.customer_name],
          [B.payments.amount, money(p.amount_kurus, p.currency)],
          ...(p.provider_amount_kurus != null && p.provider_amount_kurus !== p.amount_kurus
            ? ([[T.providerAmount, money(p.provider_amount_kurus, p.currency)]] as [
                string,
                string,
              ][])
            : []),
          ...(!manual && p.paid_kurus != null
            ? ([
                [T.paid, money(p.paid_kurus, p.currency)],
                [T.installment, String(p.installment ?? 1)],
                [
                  T.card,
                  [p.card_association, p.card_family, p.card_last4 && `•••• ${p.card_last4}`]
                    .filter(Boolean)
                    .join(" ") || B.none,
                ],
                [T.fraud, p.fraud_status != null ? String(p.fraud_status) : B.none],
              ] as [string, string][])
            : []),
          ...(manual
            ? ([
                [T.bankReference, p.bank_reference],
                [T.valueDate, day(p.value_date)],
              ] as [string, string | null][])
            : []),
          [B.refunds.title, money(p.refunded_kurus, p.currency)],
          [B.payments.refundable, money(refundable, p.currency)],
          [B.payments.date, when(p.succeeded_at ?? p.failed_at ?? p.initiated_at)],
          ...(p.failure_code ? ([[T.failure, p.failure_code]] as [string, string][]) : []),
          ...(p.receipt_number
            ? ([
                [
                  B.payments.receipt,
                  <a
                    key="r"
                    href={boHref.receipt(p.id)}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="receipt-link"
                  >
                    {T.receipt}
                  </a>,
                ],
              ] as [string, React.ReactNode][])
            : []),
        ]}
      />

      <section className={styles.section}>
        <h2>{B.internal}</h2>
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
      </section>

      <h2>{T.items}</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table} data-testid="payment-items">
          <thead>
            <tr>
              <th>{B.quote.line}</th>
              <th className={styles.number}>{B.payments.amount}</th>
              <th className={styles.number}>{T.itemRefunded}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.line_no}. {i.name}
                </td>
                <td className={styles.number}>{money(i.amount_kurus, p.currency)}</td>
                <td className={styles.number}>{money(i.refunded_kurus, p.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{T.refunds}</h2>
      {refunds.length === 0 ? (
        <p className="muted">{B.refunds.empty}</p>
      ) : (
        <ul className={styles.plainList} data-testid="payment-refunds">
          {refunds.map((r) => (
            <li key={r.id}>
              {r.number} · {billingText.refundKind[r.kind as keyof typeof billingText.refundKind]} ·{" "}
              <Badge labels={billingText.refundStatus} value={r.status} /> ·{" "}
              {money(r.amount_kurus, r.currency)} ·{" "}
              {billingText.refundReason[r.reason as keyof typeof billingText.refundReason] ??
                r.reason}
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link href={boHref.refunds()}>{B.nav.refunds} →</Link>
      </p>

      <div className={styles.columns}>
        {review && (
          <section className={styles.section}>
            <h2>{T.reviewTitle}</h2>
            <p className="muted">{T.reviewHint}</p>
            <ActionForm action={resolveReviewAction} testId="review-form">
              <input type="hidden" name="payment_id" value={p.id} />
              <Field label={T.providerRef} optional>
                <input
                  name="provider_ref"
                  maxLength={100}
                  defaultValue={p.provider_payment_id ?? ""}
                />
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
          </section>
        )}
        {p.status === "succeeded" && refundable > 0 && (
          <section className={styles.section}>
            <h2>{T.refundTitle}</h2>
            <p className="muted">{T.refundHint}</p>
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
          </section>
        )}
        {manual && p.status === "succeeded" && (
          <section className={styles.section}>
            <h2>{T.voidTitle}</h2>
            <p className="muted">{T.voidHint}</p>
            <ActionForm action={voidManualPaymentAction} testId="void-form">
              <input type="hidden" name="payment_id" value={p.id} />
              <Field label={B.internalNote}>
                <textarea name="note" maxLength={2000} rows={2} required />
              </Field>
              <div className={styles.actions}>
                <Submit secondary>{T.void}</Submit>
              </div>
            </ActionForm>
          </section>
        )}
      </div>

      <h2>{T.events}</h2>
      {events.length === 0 ? (
        <p className="muted">{T.noEvents}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="payment-events">
            <thead>
              <tr>
                <th>{B.audit.when}</th>
                <th>{T.eventType}</th>
                <th>{T.outcome}</th>
                <th>{T.http}</th>
                <th>{T.signature}</th>
                <th>{B.audit.details}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{when(e.received_at)}</td>
                  <td>{e.event_type}</td>
                  <td>{e.outcome ?? B.none}</td>
                  <td>{e.http_status ?? B.none}</td>
                  <td>{e.signature_valid == null ? B.none : e.signature_valid ? B.yes : B.no}</td>
                  <td className={bo.mono}>{e.payload ? JSON.stringify(e.payload) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
