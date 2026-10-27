import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelOrderAction,
  extendDueAction,
  recordManualPaymentAction,
  terminateOrderAction,
} from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { AuditTable } from "@/components/back-office/audit-table";
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
import { getOrder } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { outstandingKurus } from "@/lib/back-office/validation";
import { billingText } from "@/lib/i18n/messages/billing";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { opsHref } from "@/lib/operations/urls";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.order;

// One order: summary, items with their parcels, payments, the actions on its
// state (transfer, due date, cancel, terminate, renewal) and its audit trail.
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
  const view = await getOrder(supabase, id);
  if (!view) notFound();
  const { order: o, summary, items, payments, audit, internal } = view;
  const outstanding = outstandingKurus(o);
  const today = todayIn(new Date());
  const awaiting = o.status === "awaiting_payment";

  return (
    <main className="page">
      <OpsNav current="orders" />
      <p>
        <Link href={boHref.orders()}>← {B.orders.title}</Link>
      </p>
      <h1>{T.title(o.number)}</h1>
      <BoResultNotice params={await searchParams} />
      {summary?.overdue && <Warning>{B.orders.overdue}</Warning>}
      {summary?.live_payment && <Warning>{billingText.errors.payment_in_progress}</Warning>}
      <Facts
        testId="order-facts"
        rows={[
          [B.orders.status, <Badge key="s" labels={billingText.orderStatus} value={o.status} />],
          [B.orders.customer, summary?.customer_name],
          [B.orders.package, summary?.package_name],
          [B.orders.total, money(o.total_kurus, o.currency)],
          [B.orders.paid, money(o.paid_kurus, o.currency)],
          [T.refunded, money(o.refunded_kurus, o.currency)],
          [
            T.outstanding,
            <span key="out" data-testid="order-outstanding">
              {money(outstanding, o.currency)}
            </span>,
          ],
          [B.orders.due, awaiting ? when(o.payment_due_at) : B.none],
          [
            B.orders.service,
            o.service_start ? `${day(o.service_start)} – ${day(o.service_end)}` : B.none,
          ],
          [
            T.quote,
            summary?.quote_id ? (
              <Link key="q" href={boHref.quote(summary.quote_id)}>
                {summary.quote_number}
              </Link>
            ) : (
              B.none
            ),
          ],
          ...(o.renewal_of_order_id
            ? ([
                [
                  T.renewalOf,
                  <Link key="r" href={boHref.order(o.renewal_of_order_id)}>
                    {T.renewalOf}
                  </Link>,
                ],
              ] as [string, React.ReactNode][])
            : []),
          ...(internal.termination_note
            ? ([[T.terminationNote, internal.termination_note as string]] as [string, string][])
            : []),
        ]}
      />

      <h2>{T.items}</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table} data-testid="order-items">
          <thead>
            <tr>
              <th>{B.quote.line}</th>
              <th className={styles.number}>{B.orders.total}</th>
              <th>{T.parcel}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.line_no}. {i.garden_name}
                </td>
                <td className={styles.number}>{money(i.amount_kurus, o.currency)}</td>
                <td>
                  {i.parcel_id ? (
                    <Link href={opsHref.parcel(i.parcel_id)} data-testid="order-parcel-link">
                      {i.parcelName ?? i.garden_name}
                    </Link>
                  ) : (
                    B.none
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{T.payments}</h2>
      {payments.length === 0 ? (
        <p className="muted">{T.noPayments}</p>
      ) : (
        <ul className={styles.plainList} data-testid="order-payments">
          {payments.map((p) => (
            <li key={p.id}>
              <Link href={boHref.payment(p.id)}>{p.receipt_number ?? p.id.slice(0, 8)}</Link> ·{" "}
              {billingText.paymentProvider[p.provider as keyof typeof billingText.paymentProvider]}{" "}
              · <Badge labels={billingText.paymentStatus} value={p.status} /> ·{" "}
              {money(p.amount_kurus, p.currency)}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.columns}>
        {awaiting && outstanding > 0 && (
          <section className={styles.section}>
            <h2>{T.manualTitle}</h2>
            <p className="muted">{T.manualHint}</p>
            <ActionForm action={recordManualPaymentAction} testId="manual-payment-form">
              <input type="hidden" name="order_id" value={o.id} />
              <Field label={T.amount}>
                <input name="amount" inputMode="decimal" required />
              </Field>
              <Field label={T.valueDate}>
                <input type="date" name="value_date" defaultValue={today} max={today} required />
              </Field>
              <Field label={T.bankReference}>
                <input name="bank_reference" maxLength={100} required />
              </Field>
              <Field label={T.note} optional>
                <textarea name="note" maxLength={2000} rows={2} />
              </Field>
              <div className={styles.actions}>
                <Submit>{T.record}</Submit>
              </div>
            </ActionForm>
          </section>
        )}
        {awaiting && (
          <section className={styles.section}>
            <h2>{T.extendTitle}</h2>
            <ActionForm action={extendDueAction} testId="extend-due-form">
              <input type="hidden" name="order_id" value={o.id} />
              <Field label={T.dueOn}>
                <input type="date" name="due_on" min={today} required />
              </Field>
              <div className={styles.actions}>
                <Submit secondary>{T.extend}</Submit>
              </div>
            </ActionForm>
            <h2>{T.cancelTitle}</h2>
            <p className="muted">{T.cancelHint}</p>
            <ActionForm action={cancelOrderAction} testId="cancel-order-form">
              <input type="hidden" name="order_id" value={o.id} />
              <Field label={T.note} optional>
                <textarea name="note" maxLength={2000} rows={2} />
              </Field>
              <div className={styles.actions}>
                <Submit secondary>{T.cancel}</Submit>
              </div>
            </ActionForm>
          </section>
        )}
        {o.status === "active" && (
          <section className={styles.section}>
            <h2>{T.terminateTitle}</h2>
            <p className="muted">{T.terminateHint}</p>
            <ActionForm action={terminateOrderAction} testId="terminate-form">
              <input type="hidden" name="order_id" value={o.id} />
              <Field label={T.note}>
                <textarea name="note" maxLength={2000} rows={2} required />
              </Field>
              <label className={styles.check}>
                <input type="checkbox" name="confirm" required />
                {T.terminateConfirm}
              </label>
              <div className={styles.actions}>
                <Submit secondary>{T.terminate}</Submit>
              </div>
            </ActionForm>
          </section>
        )}
        {(o.status === "active" || o.status === "completed") && (
          <section className={styles.section}>
            <h2>{T.renewal}</h2>
            <Link className="button" href={boHref.newQuote({ siparis: o.id })}>
              {T.renewal}
            </Link>
          </section>
        )}
      </div>

      <h2>{T.audit}</h2>
      <AuditTable rows={audit} testId="order-audit" />
    </main>
  );
}
