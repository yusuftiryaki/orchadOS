import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelOrderAction,
  extendDueAction,
  recordManualPaymentAction,
  recordWithdrawalAction,
  requestRemovalAction,
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
import { getOrder, getSetting, type OrderView } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { OPS_WITHDRAWAL_CHANNELS } from "@/lib/billing/types";
import { REMOVAL_REASONS, addDays, outstandingKurus } from "@/lib/back-office/validation";
import { billingText } from "@/lib/i18n/messages/billing";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { opsHref } from "@/lib/operations/urls";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.order;
const L = B.lineState;

type Item = OrderView["items"][number];

// Hizmette / Çıkacak · day / Çıkarıldı · day (IP14 §12).
function lineState(item: Item, orderActive: boolean): React.ReactNode {
  if (item.removed_on) return L.removed(day(item.removed_on));
  if (item.openRemoval) {
    return (
      <Link href={boHref.removal(item.openRemoval.id)}>
        {L.leaving(day(item.openRemoval.effective_on ?? item.openRemoval.requested_effective_on))}
      </Link>
    );
  }
  return orderActive && item.parcel_id ? L.in_service : B.none;
}

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
  const active = o.status === "active";
  const setting = await getSetting(supabase, o.org_id);
  // An add-on is paid by its last valid day at the latest (IP14 §4.1 step 6).
  const addonLastDay =
    view.base?.service_end && setting
      ? addDays(view.base.service_end, 1 - setting.addon_min_days)
      : null;
  const removable = active
    ? items.filter(
        (i) =>
          i.parcel_id && !i.removed_on && !i.openRemoval && o.service_end && o.service_end >= today,
      )
    : [];
  // T03: a withdrawal by e-mail, KEP or post names lines in service without
  // an open withdrawal (an open removal of another kind is superseded).
  const withdrawable = active
    ? items.filter(
        (i) =>
          i.parcel_id &&
          !i.removed_on &&
          !i.openRemoval?.withdrawal &&
          o.service_end &&
          o.service_end >= today,
      )
    : [];
  const withdrawalUntil = o.activated_at ? addDays(todayIn(new Date(o.activated_at)), 14) : null;

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
          ...(view.base
            ? ([
                [
                  B.orderLinks.base,
                  <Link key="b" href={boHref.order(view.base.id)} data-testid="order-base-link">
                    {view.base.number}
                  </Link>,
                ],
              ] as [string, React.ReactNode][])
            : []),
          ...(view.addons.length
            ? ([
                [
                  B.orderLinks.addons,
                  <span key="a" data-testid="order-addons">
                    {view.addons.map((a, i) => (
                      <span key={a.id}>
                        {i > 0 && ", "}
                        <Link href={boHref.order(a.id)}>{a.number}</Link> (
                        {billingText.orderStatus[
                          a.status as keyof typeof billingText.orderStatus
                        ] ?? a.status}
                        )
                      </span>
                    ))}
                  </span>,
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
              <th>{L.title}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} data-item-id={i.id}>
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
                <td data-testid="order-item-state">{lineState(i, active)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {withdrawable.length > 0 && (
        <section className={styles.section} data-testid="record-withdrawal">
          <h2>{B.withdrawal.title}</h2>
          <p className="muted">
            {withdrawalUntil
              ? B.withdrawal.hint(day(withdrawalUntil))
              : B.withdrawal.hintNoActivation}
          </p>
          <ActionForm action={recordWithdrawalAction} testId="record-withdrawal-form">
            <input type="hidden" name="order_id" value={o.id} />
            <fieldset className={styles.fieldset}>
              <legend>{B.withdrawal.gardens}</legend>
              {withdrawable.map((i) => (
                <label key={i.id} className={styles.check}>
                  <input type="checkbox" name="order_item_ids" value={i.id} />
                  {i.parcelName ?? i.garden_name}
                </label>
              ))}
            </fieldset>
            <div className={styles.grid}>
              <Field label={B.withdrawal.channel}>
                <select name="channel" defaultValue="" required>
                  <option value="" disabled>
                    —
                  </option>
                  {OPS_WITHDRAWAL_CHANNELS.map((c) => (
                    <option key={c} value={c}>
                      {billingText.withdrawalChannel[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={B.withdrawal.receivedOn}>
                <input type="date" name="notice_received_on" max={today} required />
              </Field>
            </div>
            <Field label={B.internalNote} optional>
              <textarea name="note" maxLength={2000} rows={2} />
            </Field>
            <div className={styles.actions}>
              <Submit secondary>{B.withdrawal.submit}</Submit>
            </div>
          </ActionForm>
        </section>
      )}

      {removable.length > 0 && (
        <section className={styles.section} data-testid="remove-gardens">
          <h2>{L.removeTitle}</h2>
          <p className="muted">{L.removeHint}</p>
          <p className="muted">{B.removal.shortAccessRule(setting?.removal_access_days ?? 90)}</p>
          {removable.map((i) => (
            <details key={i.id} data-item-id={i.id}>
              <summary>
                {L.removeTitle}: {i.parcelName ?? i.garden_name}
              </summary>
              <ActionForm action={requestRemovalAction} testId="remove-garden-form">
                <input type="hidden" name="order_item_id" value={i.id} />
                <input type="hidden" name="last_day" value={addDays(o.service_end!, 1)} />
                <input
                  type="hidden"
                  name="setting_access_days"
                  value={setting?.removal_access_days ?? 90}
                />
                <Field label={B.fields.reason}>
                  <select name="reason" defaultValue="" required>
                    <option value="" disabled>
                      —
                    </option>
                    {REMOVAL_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {billingText.gardenRemovalReason[r]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={B.fields.effective_on}>
                  <input
                    type="date"
                    name="effective_on"
                    min={today}
                    max={addDays(o.service_end!, 1)}
                    required
                  />
                </Field>
                <Field
                  label={B.fields.access_days}
                  hint={B.removal.accessDaysHint(setting?.removal_access_days ?? 90)}
                  optional
                >
                  <input
                    name="access_days"
                    type="number"
                    min={0}
                    max={365}
                    placeholder={String(setting?.removal_access_days ?? 90)}
                  />
                </Field>
                <label className={styles.check}>
                  <input type="checkbox" name="revoke_all_access" />
                  {B.fields.revoke_all_access}
                </label>
                <Field label={B.internalNote} optional>
                  <textarea name="note" maxLength={2000} rows={2} />
                </Field>
                <div className={styles.actions}>
                  <Submit secondary>{L.removeSubmit}</Submit>
                </div>
              </ActionForm>
            </details>
          ))}
        </section>
      )}

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
              <Field
                label={T.dueOn}
                hint={addonLastDay ? B.orderLinks.dueMax(day(addonLastDay)) : undefined}
              >
                <input
                  type="date"
                  name="due_on"
                  min={today}
                  max={addonLastDay ?? undefined}
                  required
                />
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
            {!o.addon_of_order_id && (
              <p className="muted" data-testid="terminate-addon-hint">
                {B.orderLinks.terminateAddonHint}
              </p>
            )}
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
        {(o.status === "active" || o.status === "completed") && !o.addon_of_order_id && (
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
