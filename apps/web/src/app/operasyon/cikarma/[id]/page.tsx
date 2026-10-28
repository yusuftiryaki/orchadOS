import Link from "next/link";
import { notFound } from "next/navigation";
import {
  cancelRemovalAction,
  completeRemovalAction,
  scheduleRemovalAction,
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
import { getRemoval, type RemovalPreview } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { formatNumber } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsHref } from "@/lib/operations/urls";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.removal;

const label = <K extends string>(labels: Record<K, string>, value: string | null | undefined) =>
  value ? (labels[value as K] ?? value) : B.none;

// One garden removal (docs/bahce-yonetimi.md §5.2, §12): who and what, the
// refund calculation (ops_garden_removal_preview) with its warnings, the
// work on the parcel and the access that ends, the actions (confirm or move
// the day, complete now, cancel) and, once completed, its refunds.
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
  const view = await getRemoval(supabase, id);
  if (!view) notFound();
  const { removal: r, row, preview, refunds, setting } = view;
  // Past the list's limit the internal note and the revoke-all choice are
  // unknown: shown as such, and the stored choice is kept on save.
  const unknown = row ? null : T.unknown;
  const today = todayIn(new Date());
  const open = r.status === "requested" || r.status === "scheduled";
  const effectiveOn = r.effective_on ?? r.requested_effective_on;
  const due = effectiveOn <= today;
  const settingAccessDays = setting?.removal_access_days ?? 90;

  return (
    <main className="page">
      <OpsNav current="removals" />
      <p>
        <Link href={boHref.removals()}>← {B.removals.title}</Link>
      </p>
      <h1>{T.title(r.number)}</h1>
      <BoResultNotice params={await searchParams} />
      {view.blockedReason && <Warning testId="removal-blocked">{T.blocked}</Warning>}

      <section className={styles.section}>
        <h2>{T.details}</h2>
        <Facts
          testId="removal-facts"
          rows={[
            [
              B.removals.status,
              <Badge key="s" labels={billingText.gardenRemovalStatus} value={r.status} />,
            ],
            [
              B.removals.customer,
              view.profileId ? (
                <Link key="c" href={boHref.customer(view.profileId)}>
                  {view.customerName ?? B.details}
                </Link>
              ) : (
                (view.customerName ?? B.none)
              ),
            ],
            [
              T.parcel,
              <Link key="p" href={opsHref.parcel(r.parcel_id)} data-testid="removal-parcel-link">
                {r.garden_name}
              </Link>,
            ],
            [
              B.removals.order,
              r.order_id ? (
                <Link key="o" href={boHref.order(r.order_id)}>
                  {view.orderNumber ?? B.details}
                </Link>
              ) : (
                B.none
              ),
            ],
            [T.reason, label(billingText.gardenRemovalReason, r.reason)],
            [T.initiatedBy, label(billingText.removalInitiatedBy, r.initiated_by)],
            [
              B.removals.withdrawal,
              r.withdrawal ? B.yes : r.at_period_end ? B.removals.atPeriodEnd : B.no,
            ],
            [T.customerNote, r.customer_note],
            [T.opsNote, row ? row.ops_note : unknown],
            [T.requestedOn, day(r.requested_effective_on)],
            [T.effectiveOn, day(r.effective_on)],
            [T.accessDays, T.days(r.access_days)],
            [T.accessUntil, day(r.access_until ?? preview?.access_until)],
            [T.revokeAll, row ? (row.revoke_all_access ? B.yes : B.no) : unknown],
            [T.requestedAt, when(r.requested_at)],
            [T.scheduledAt, when(r.scheduled_at)],
            ...(r.completed_at
              ? ([
                  [T.completedAt, when(r.completed_at)],
                  [T.refundMode, label(billingText.removalRefundMode, r.refund_mode)],
                  [T.refundKurus, money(r.refund_kurus)],
                ] as [string, string][])
              : []),
            ...(r.cancelled_at
              ? ([
                  [T.cancelledAt, when(r.cancelled_at)],
                  [T.cancelledBy, label(billingText.removalCancelledBy, r.cancelled_by)],
                ] as [string, string][])
              : []),
            ...(r.access_revoked_at
              ? ([[T.accessRevokedAt, when(r.access_revoked_at)]] as [string, string][])
              : []),
          ]}
        />
      </section>

      <section className={styles.section}>
        <h2>{T.preview}</h2>
        {!preview ? (
          <p className="muted">{T.noPreview}</p>
        ) : (
          <RemovalCalculation preview={preview} completed={r.status === "completed"} />
        )}
      </section>

      {preview && <RemovalContext preview={preview} />}

      {open && (
        <div className={styles.columns}>
          <section className={styles.section}>
            <h2>{T.scheduleTitle}</h2>
            <p className="muted" data-testid="schedule-hint">
              {r.status === "requested" ? T.confirmHint : T.scheduleHint}
            </p>
            <p className="muted">{T.shortAccessRule(settingAccessDays)}</p>
            <ActionForm action={scheduleRemovalAction} testId="schedule-removal-form">
              <input type="hidden" name="removal_id" value={r.id} />
              <input type="hidden" name="requested_on" value={r.requested_effective_on} />
              <input type="hidden" name="removal_reason" value={r.reason} />
              <input type="hidden" name="current_access_days" value={r.access_days} />
              <input type="hidden" name="setting_access_days" value={settingAccessDays} />
              {row && <input type="hidden" name="revoke_known" value="1" />}
              <Field label={B.fields.effective_on}>
                <input
                  type="date"
                  name="effective_on"
                  min={today}
                  defaultValue={effectiveOn < today ? today : effectiveOn}
                  required
                />
              </Field>
              <Field label={B.fields.access_days}>
                <input
                  name="access_days"
                  type="number"
                  min={0}
                  max={365}
                  defaultValue={r.access_days}
                  required
                />
              </Field>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  name="revoke_all_access"
                  defaultChecked={row?.revoke_all_access ?? false}
                />
                {B.fields.revoke_all_access}
              </label>
              {!row && <p className={styles.hint}>{T.revokeAllUnknown}</p>}
              <p className={styles.hint}>{T.revokeAllHint}</p>
              <Field label={B.internalNote} optional>
                <textarea name="note" maxLength={2000} rows={2} />
              </Field>
              <div className={styles.actions}>
                <Submit>{T.schedule}</Submit>
              </div>
            </ActionForm>
          </section>
          <section className={styles.section}>
            <h2>{T.completeTitle}</h2>
            {due ? (
              <>
                <p className="muted">{T.completeHint}</p>
                <ActionForm action={completeRemovalAction} testId="complete-removal-form">
                  <input type="hidden" name="removal_id" value={r.id} />
                  <label className={styles.check}>
                    <input type="checkbox" name="confirm" required />
                    {T.completeConfirm}
                  </label>
                  <div className={styles.actions}>
                    <Submit>{T.complete}</Submit>
                  </div>
                </ActionForm>
              </>
            ) : (
              <p className="muted" data-testid="removal-not-due">
                {T.notDue(day(effectiveOn))}
              </p>
            )}
            <h2>{T.cancelTitle}</h2>
            <p className="muted">{T.cancelHint}</p>
            <ActionForm action={cancelRemovalAction} testId="cancel-removal-form">
              <input type="hidden" name="removal_id" value={r.id} />
              <Field label={B.internalNote}>
                <textarea name="note" maxLength={2000} rows={2} required />
              </Field>
              <div className={styles.actions}>
                <Submit secondary>{T.cancel}</Submit>
              </div>
            </ActionForm>
          </section>
        </div>
      )}

      {r.status === "completed" && (
        <section className={styles.section}>
          <h2>{T.refunds}</h2>
          {refunds.length === 0 ? (
            <p className="muted">{T.noRefunds}</p>
          ) : (
            <>
              <ul className={styles.plainList} data-testid="removal-refunds">
                {refunds.map((x) => (
                  <li key={x.id}>
                    <Link href={x.payment_id ? boHref.payment(x.payment_id) : boHref.refunds()}>
                      {x.number}
                    </Link>{" "}
                    · <Badge labels={billingText.refundStatus} value={x.status} /> ·{" "}
                    {money(x.amount_kurus, x.currency)}
                  </li>
                ))}
              </ul>
              <p className="muted">
                <Link href={boHref.refunds()}>{T.refundsHint}</Link>
              </p>
            </>
          )}
        </section>
      )}
    </main>
  );
}

// The removal-v1 lines with their warnings.
function RemovalCalculation({
  preview: p,
  completed,
}: {
  preview: RemovalPreview;
  completed: boolean;
}) {
  return (
    <>
      <p className="muted">{completed ? T.calculation : T.previewHint}</p>
      {p.unallocated_kurus > 0 && (
        <Warning testId="removal-unallocated">{T.unallocated(money(p.unallocated_kurus))}</Warning>
      )}
      {p.unattributed_refunds && <Warning testId="removal-unattributed">{T.unattributed}</Warning>}
      {p.pending_orders?.length > 0 && (
        <Warning testId="removal-pending-orders">
          {T.pendingOrders(p.pending_orders.join(", "))}
        </Warning>
      )}
      <Facts
        rows={[
          [T.effectiveOn, day(p.effective_on)],
          [T.refundMode, label(billingText.removalRefundMode, p.mode)],
        ]}
      />
      <div className={styles.tableWrap}>
        <table className={styles.table} data-testid="removal-lines">
          <thead>
            <tr>
              <th>{T.line}</th>
              <th className={styles.number}>{T.amount}</th>
              <th className={styles.number}>{T.visits}</th>
              <th className={styles.number}>{T.visitFee}</th>
              <th className={styles.number}>{T.inventoryShare}</th>
              <th className={styles.number}>{T.gross}</th>
              <th className={styles.number}>{T.alreadyRefunded}</th>
              <th className={styles.number}>{T.refund}</th>
              <th className={styles.number}>{T.refundVat}</th>
            </tr>
          </thead>
          <tbody>
            {(p.lines ?? []).map((l) => (
              <tr key={l.order_item_id} data-unattributed={l.unattributed || undefined}>
                <td>
                  {l.order_number} · {label(billingText.removalRefundMode, l.mode)}
                </td>
                <td className={styles.number}>{money(l.amount_kurus)}</td>
                <td className={styles.number}>
                  {formatNumber(l.visits_entitled)} / {formatNumber(l.visits_used)} /{" "}
                  {formatNumber(l.visits_excluded)}
                </td>
                <td className={styles.number}>{money(l.visit_fee_kurus)}</td>
                <td className={styles.number}>
                  {money(l.inventory_share_kurus)}
                  {l.inventory_done && <span className="muted"> ({T.inventoryDone})</span>}
                </td>
                <td className={styles.number}>{money(l.gross_kurus)}</td>
                <td className={styles.number}>{money(-l.already_refunded_kurus)}</td>
                <td className={styles.number}>{money(l.refund_kurus)}</td>
                <td className={styles.number}>{money(l.refund_vat_kurus)}</td>
              </tr>
            ))}
            <tr className={bo.totals}>
              <td colSpan={7}>{T.total}</td>
              <td className={styles.number} data-testid="removal-refund-total">
                {money(p.refund_kurus)}
              </td>
              <td className={styles.number}>{money(p.refund_vat_kurus)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

// Planned work on the parcel and the access that ends.
function RemovalContext({ preview: p }: { preview: RemovalPreview }) {
  const scope = p.access_scope ?? {
    customer_owner: 0,
    invited_viewers: 0,
    other_viewers: 0,
    other_owners: 0,
  };
  return (
    <div className={styles.columns}>
      <section className={styles.section}>
        <h2>{T.context}</h2>
        <Facts
          testId="removal-context"
          rows={[
            [T.plannedBefore, formatNumber(p.planned_visits_before ?? 0)],
            [T.plannedAfter, formatNumber(p.planned_visits_after ?? 0)],
            [T.capturedUnpublished, formatNumber(p.captured_unpublished ?? 0)],
            [T.openFollowups, formatNumber(p.open_followups ?? 0)],
            [T.pendingInvitations, formatNumber(p.pending_invitations ?? 0)],
            [T.openRefunds, formatNumber(p.open_refunds ?? 0)],
          ]}
        />
      </section>
      <section className={styles.section}>
        <h2>{T.accessScope}</h2>
        <Facts
          testId="removal-access-scope"
          rows={[
            [T.customerOwner, formatNumber(scope.customer_owner)],
            [T.invitedViewers, formatNumber(scope.invited_viewers)],
            [T.otherViewers, formatNumber(scope.other_viewers)],
            [T.otherOwners, formatNumber(scope.other_owners)],
          ]}
        />
      </section>
    </div>
  );
}
