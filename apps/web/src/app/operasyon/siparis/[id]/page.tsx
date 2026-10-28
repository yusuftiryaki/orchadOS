import Link from "next/link";
import { notFound } from "next/navigation";
import {
  allowUnpaidVisitAction,
  cancelOrderAction,
  extendDueAction,
  recordManualPaymentAction,
  recordWithdrawalAction,
  requestRemovalAction,
  terminateOrderAction,
} from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { ContractDocumentTable } from "@/components/contracts/document-list";
import { GenerateResult } from "@/components/contracts/ops-parts";
import { AuditTable } from "@/components/back-office/audit-table";
import { statusTone } from "@/components/ui/status";
import { EmptyState } from "@/components/ui/empty-state";
import { Badges } from "@/components/back-office/money-ui";
import { Consequence, Disclosure } from "@/components/ui/disclosure";
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
import { Panel } from "@/components/ui/panel";
import { Split } from "@/components/ui/layout";
import { InstallmentPlan } from "@/components/portal-billing/installment-plan";
import styles from "@/components/operations/operations.module.css";
import { Alert } from "@/components/ui/alert";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { getOrder, getSetting, type OrderView } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { OPS_WITHDRAWAL_CHANNELS } from "@/lib/billing/types";
import { OPS_REMOVAL_REASONS, addDays } from "@/lib/back-office/validation";
import { installmentLabel, openKurus, planRowOf } from "@/lib/billing/installments";
import {
  documentState,
  opsDocuments,
  stateRefOf,
  type ContractDocumentRow,
} from "@/lib/contracts/generate";
import { billingText } from "@/lib/i18n/messages/billing";
import { contractsText as C } from "@/lib/i18n/messages/contracts";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { opsHref } from "@/lib/operations/urls";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";
import { generateOrderDocumentsAction } from "../actions";

const B = backOfficeText;
const T = B.order;
const L = B.lineState;

type Item = OrderView["items"][number];

// Hizmette / Çıkacak: day / Çıkarıldı: day (IP14 §12).
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

// One order. Left: the record (summary, payment plan with the unpaid-visit
// override (H35), items with their parcels, payments, contract documents (T04)
// and the audit trail). Right: what can be done to it, the common action
// (record a transfer) open, the rare and irreversible ones (withdrawal,
// removal, due date, cancel, terminate) closed until asked for.
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
  const plan = view.plan.map((r) => ({
    id: r.id,
    overrideAt: r.visit_override_at,
    overrideNote: r.visit_override_note,
    row: planRowOf(r),
  }));
  const openPlan = plan.filter((p) => openKurus(p.row) > 0);
  const outstanding = openPlan.reduce((sum, p) => sum + openKurus(p.row), 0);
  const today = todayIn(new Date());
  const awaiting = o.status === "awaiting_payment";
  const active = o.status === "active";
  // The setting, the documents and their state do not depend on each other.
  const [setting, documents, query] = await Promise.all([
    getSetting(supabase, o.org_id),
    o.quote_id
      ? opsDocuments(supabase, o.id).catch(() => [] as ContractDocumentRow[])
      : Promise.resolve([] as ContractDocumentRow[]),
    searchParams,
  ]);
  const documentsState = o.quote_id
    ? await documentState(supabase, stateRefOf(o), documents).catch(() => null)
    : null;
  const documentsMissing = !!o.quote_id && documentsState?.state !== "complete";
  const manualCopy = documentsState?.state === "manual_copy";
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
  const accessDays = setting?.removal_access_days ?? 90;
  const canRecord = o.status !== "cancelled" && outstanding > 0;
  const canRenew = (active || o.status === "completed") && !o.addon_of_order_id;

  const facts: [string, React.ReactNode][] = [
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
  ];
  if (o.renewal_of_order_id) {
    facts.push([
      T.renewalOf,
      <Link key="r" href={boHref.order(o.renewal_of_order_id)}>
        {T.renewalOf}
      </Link>,
    ]);
  }
  if (view.base) {
    facts.push([
      B.orderLinks.base,
      <Link key="b" href={boHref.order(view.base.id)} data-testid="order-base-link">
        {view.base.number}
      </Link>,
    ]);
  }
  if (view.addons.length) {
    facts.push([
      B.orderLinks.addons,
      <span key="a" data-testid="order-addons" className={cell.nowrap}>
        {view.addons.map((a) => (
          <Badges key={a.id}>
            <Link href={boHref.order(a.id)}>{a.number}</Link>
            <Badge labels={billingText.orderStatus} value={a.status} kind="order" />
          </Badges>
        ))}
      </span>,
    ]);
  }
  if (internal.termination_note) {
    facts.push([T.terminationNote, internal.termination_note as string]);
  }

  const aside = (
    <>
      {canRecord && (
        <Panel title={T.manualTitle} description={T.manualHint}>
          <Consequence>
            {T.outstandingNow}: <strong>{money(outstanding, o.currency)}</strong>
          </Consequence>
          <ActionForm action={recordManualPaymentAction} testId="manual-payment-form">
            <input type="hidden" name="order_id" value={o.id} />
            {openPlan.length > 0 && (
              <Field label={T.installment}>
                <select name="installment_id" defaultValue="">
                  <option value="">{T.installmentSpread}</option>
                  {openPlan.map((p) => (
                    <option key={p.id} value={p.id}>
                      {`${p.row.seq}. ${installmentLabel(p.row)}: ${money(openKurus(p.row), o.currency)}`}
                    </option>
                  ))}
                </select>
              </Field>
            )}
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
        </Panel>
      )}

      {awaiting && (
        <Disclosure title={T.extendTitle}>
          <Consequence>{T.extendHint(when(o.payment_due_at))}</Consequence>
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
        </Disclosure>
      )}

      {withdrawable.length > 0 && (
        <Disclosure title={B.withdrawal.title} testId="record-withdrawal">
          <Consequence>
            {withdrawalUntil
              ? B.withdrawal.hint(day(withdrawalUntil))
              : B.withdrawal.hintNoActivation}
          </Consequence>
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
            <Field label={B.internalNote} optional>
              <textarea name="note" maxLength={2000} rows={2} />
            </Field>
            <div className={styles.actions}>
              <Submit secondary>{B.withdrawal.submit}</Submit>
            </div>
          </ActionForm>
        </Disclosure>
      )}

      {removable.length > 0 && (
        <Disclosure title={L.removeTitle} testId="remove-gardens">
          <Consequence>{L.removeHint}</Consequence>
          <Consequence>{B.removal.shortAccessRule(accessDays)}</Consequence>
          <ActionForm action={requestRemovalAction} testId="remove-garden-form">
            {removable.length === 1 ? (
              <input type="hidden" name="order_item_id" value={removable[0].id} />
            ) : (
              <Field label={T.removeGarden}>
                <select name="order_item_id" defaultValue="" required>
                  <option value="" disabled>
                    —
                  </option>
                  {removable.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.parcelName ?? i.garden_name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {removable.length === 1 && (
              <p className={styles.hint}>
                {T.removeGarden}: {removable[0].parcelName ?? removable[0].garden_name}
              </p>
            )}
            <input type="hidden" name="last_day" value={addDays(o.service_end!, 1)} />
            <input type="hidden" name="setting_access_days" value={accessDays} />
            <Field label={B.fields.reason} hint={B.removal.reasonHint}>
              <select name="reason" defaultValue="" required>
                <option value="" disabled>
                  —
                </option>
                {OPS_REMOVAL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {billingText.gardenRemovalReason[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={B.fields.owner_consent_note} hint={B.removal.consentHint} optional>
              <textarea name="owner_consent_note" maxLength={2000} rows={2} />
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
              hint={B.removal.accessDaysHint(accessDays)}
              optional
            >
              <input
                name="access_days"
                type="number"
                min={0}
                max={365}
                placeholder={String(accessDays)}
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
        </Disclosure>
      )}

      {awaiting && (
        <Disclosure title={T.cancelTitle}>
          <Consequence>{T.cancelHint}</Consequence>
          <ActionForm action={cancelOrderAction} testId="cancel-order-form">
            <input type="hidden" name="order_id" value={o.id} />
            <Field label={T.note} optional>
              <textarea name="note" maxLength={2000} rows={2} />
            </Field>
            <div className={styles.actions}>
              <Button type="submit" variant="danger">
                {T.cancel}
              </Button>
            </div>
          </ActionForm>
        </Disclosure>
      )}

      {active && (
        <Disclosure title={T.terminateTitle}>
          <Consequence>{T.terminateHint}</Consequence>
          {!o.addon_of_order_id && (
            <Consequence testId="terminate-addon-hint">
              {B.orderLinks.terminateAddonHint}
            </Consequence>
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
              <Button type="submit" variant="danger">
                {T.terminate}
              </Button>
            </div>
          </ActionForm>
        </Disclosure>
      )}
    </>
  );

  return (
    <main className="page">
      <PageHeader
        title={T.title(o.number)}
        back={{ href: boHref.orders(), label: B.orders.title }}
        meta={
          <Badges>
            <UiBadge tone={statusTone(o.status, "order")} testId="order-status">
              {billingText.orderStatus[o.status as keyof typeof billingText.orderStatus] ??
                o.status}
            </UiBadge>
            {o.addon_of_order_id && <UiBadge>{B.orders.addon}</UiBadge>}
          </Badges>
        }
        actions={
          canRenew ? (
            <ButtonLink
              variant={canRecord ? "secondary" : "primary"}
              href={boHref.newQuote({ siparis: o.id })}
            >
              {T.renewal}
            </ButtonLink>
          ) : undefined
        }
      />
      <BoResultNotice params={query} />
      <GenerateResult value={query.belgeler} />
      {summary?.overdue && <Warning>{B.orders.overdue}</Warning>}
      {summary?.live_payment && <Warning>{billingText.errors.payment_in_progress}</Warning>}

      <Split aside={aside}>
        <Panel title={T.summary}>
          <Facts testId="order-facts" rows={facts} />
        </Panel>

        {plan.length > 0 && (
          <Panel plain title={T.planTitle} testId="order-plan">
            <InstallmentPlan
              rows={plan.map((p) => p.row)}
              currency={o.currency}
              withStatus
              notes={false}
              action={(row) => {
                const p = plan.find((x) => x.row.seq === row.seq)!;
                if (p.overrideAt) {
                  return (
                    <span className="muted" data-testid="visit-allowed">
                      {billingText.plan.visitAllowed}: {p.overrideNote}
                    </span>
                  );
                }
                if (row.kind !== "visit" || row.status !== "pending" || !active) return null;
                return (
                  <Disclosure title={T.allowVisit}>
                    <Consequence>{T.allowVisitHint}</Consequence>
                    <ActionForm
                      action={allowUnpaidVisitAction}
                      testId={`allow-visit-form-${row.seq}`}
                    >
                      <input type="hidden" name="order_id" value={o.id} />
                      <input type="hidden" name="installment_id" value={p.id} />
                      <Field label={T.allowVisitNote}>
                        <textarea name="note" maxLength={500} rows={2} required />
                      </Field>
                      <div className={styles.actions}>
                        <Button type="submit" variant="secondary" size="sm">
                          {T.allowVisitSubmit}
                        </Button>
                      </div>
                    </ActionForm>
                  </Disclosure>
                );
              }}
            />
          </Panel>
        )}

        <Panel plain title={T.items}>
          <Table data-testid="order-items">
            <thead>
              <tr>
                <th>{B.quote.line}</th>
                <th className={cell.num}>{B.orders.total}</th>
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
                  <td className={cell.num}>{money(i.amount_kurus, o.currency)}</td>
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
          </Table>
        </Panel>

        <Panel plain title={T.payments}>
          {payments.length === 0 ? (
            <EmptyState compact headingLevel={3} title={T.noPayments} />
          ) : (
            <Table data-testid="order-payments">
              <thead>
                <tr>
                  <th>{B.payments.receipt}</th>
                  <th>{B.payments.method}</th>
                  <th className={cell.num}>{B.payments.date}</th>
                  <th className={cell.num}>{B.payments.amount}</th>
                  <th>{B.payments.status}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} data-payment-id={p.id}>
                    <td className={cell.code}>
                      <Link href={boHref.payment(p.id)}>
                        {p.receipt_number ?? p.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className={cell.nowrap}>
                      {
                        billingText.paymentProvider[
                          p.provider as keyof typeof billingText.paymentProvider
                        ]
                      }
                    </td>
                    <td className={cell.num}>{when(p.succeeded_at ?? p.initiated_at)}</td>
                    <td className={cell.num}>{money(p.amount_kurus, p.currency)}</td>
                    <td>
                      <Badge labels={billingText.paymentStatus} value={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        {o.quote_id && (
          <Panel
            title={C.ops.documentsTitle}
            description={C.ops.copyHint}
            testId="order-contract-documents"
            actions={
              documentsMissing ? (
                <form action={generateOrderDocumentsAction}>
                  <input type="hidden" name="order_id" value={o.id} />
                  <Button type="submit" variant="secondary" size="sm">
                    {manualCopy ? C.ops.retry : C.ops.generate}
                  </Button>
                </form>
              ) : undefined
            }
          >
            {manualCopy && (
              <Alert tone="warning" testId="order-contracts-manual-copy" title={C.ops.manualState}>
                <p>{C.ops.manualHint}</p>
              </Alert>
            )}
            {documents.length === 0 ? (
              <EmptyState compact headingLevel={3} title={C.ops.documentsEmpty} />
            ) : (
              <ContractDocumentTable
                documents={documents}
                hrefOf={(d) => `/operasyon/siparis/${o.id}/belge/${d.id}`}
                showGenerator
              />
            )}
          </Panel>
        )}

        <Panel plain title={T.audit}>
          <AuditTable rows={audit} testId="order-audit" />
        </Panel>
      </Split>
    </main>
  );
}
