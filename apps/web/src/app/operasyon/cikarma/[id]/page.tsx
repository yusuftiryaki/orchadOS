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
  Warning,
  day,
  money,
  when,
} from "@/components/back-office/parts";
import { Field } from "@/components/operations/field";
import ops from "@/components/operations/operations.module.css";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Split, Stack } from "@/components/ui/layout";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { getRemoval, type RemovalPreview } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { formatNumber } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsHref } from "@/lib/operations/urls";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";
import styles from "./removal.module.css";

const B = backOfficeText;
const T = B.removal;

const DAY_MS = 86_400_000;

// Days from today to an ISO day (negative: past).
const daysFrom = (today: string, iso: string) =>
  Math.round((Date.parse(iso) - Date.parse(today)) / DAY_MS);

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
  // T05: the customer's timing, the owner's consent and the notice rule
  // (read beside the removal, not after it).
  const [view, termsResult, query] = await Promise.all([
    getRemoval(supabase, id),
    supabase.rpc("ops_garden_removal_terms", { p_removal_id: id }),
    searchParams,
  ]);
  if (!view) notFound();
  const terms = termsResult.data?.[0] ?? null;
  const { removal: r, row, preview, refunds, setting } = view;
  // Past the list's limit the internal note and the revoke-all choice are
  // unknown: shown as such, and the stored choice is kept on save.
  const unknown = row ? null : T.unknown;
  const today = todayIn(new Date());
  const open = r.status === "requested" || r.status === "scheduled";
  const effectiveOn = r.effective_on ?? r.requested_effective_on;
  const due = effectiveOn <= today;
  const settingAccessDays = setting?.removal_access_days ?? 90;

  const calendar = (
    <Panel title={T.calendar} testId="removal-calendar">
      <dl className={styles.dates}>
        <div className={styles.date} data-key="effective">
          <dt>{T.effectiveOn}</dt>
          <dd>
            <strong>{day(r.effective_on ?? r.requested_effective_on)}</strong>
            {open && (
              <span className={styles.relative}>
                {B.removals.relative(daysFrom(today, effectiveOn))}
              </span>
            )}
          </dd>
        </div>
        <div className={styles.date}>
          <dt>{T.requestedOn}</dt>
          <dd>
            <strong>{day(r.requested_effective_on)}</strong>
          </dd>
        </div>
        <div className={styles.date}>
          <dt>{T.accessUntil}</dt>
          <dd>
            <strong>{day(r.access_until ?? preview?.access_until)}</strong>
            <span className={styles.relative}>{T.days(r.access_days)}</span>
          </dd>
        </div>
        <div className={styles.date}>
          <dt>{r.status === "completed" ? T.refundKurus : T.refundEstimate}</dt>
          <dd>
            <strong>
              {r.status === "completed" ? money(r.refund_kurus) : money(preview?.refund_kurus)}
            </strong>
          </dd>
        </div>
      </dl>
    </Panel>
  );

  const record = (
    <>
      {calendar}
      <Panel title={T.details}>
        <Facts
          testId="removal-facts"
          rows={[
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
            [T.timing, terms?.timing ? label(T.timings, terms.timing) : B.none],
            [T.noticeRule, terms?.notice_rule ? label(T.noticeRules, terms.notice_rule) : B.none],
            [T.ownerConsent, terms?.owner_consent_note ?? B.none],
            [T.customerNote, r.customer_note],
            [T.opsNote, row ? row.ops_note : unknown],
            [T.revokeAll, row ? (row.revoke_all_access ? B.yes : B.no) : unknown],
            ...(r.completed_at
              ? ([[T.refundMode, label(billingText.removalRefundMode, r.refund_mode)]] as [
                  string,
                  string,
                ][])
              : []),
            ...(r.cancelled_at
              ? ([[T.cancelledBy, label(billingText.removalCancelledBy, r.cancelled_by)]] as [
                  string,
                  string,
                ][])
              : []),
          ]}
        />
      </Panel>

      <Panel title={T.preview}>
        {!preview ? (
          <p className="muted">{T.noPreview}</p>
        ) : (
          <RemovalCalculation preview={preview} completed={r.status === "completed"} />
        )}
      </Panel>

      {preview && <RemovalContext preview={preview} />}

      {r.status === "completed" && (
        <Panel
          plain
          title={T.refunds}
          actions={
            refunds.length > 0 && (
              <ButtonLink variant="secondary" size="sm" href={boHref.refunds()}>
                {T.refundsLink}
              </ButtonLink>
            )
          }
        >
          {refunds.length === 0 ? (
            <EmptyState compact headingLevel={3} title={T.noRefunds} />
          ) : (
            <Table data-testid="removal-refunds">
              <thead>
                <tr>
                  <th>{T.refundNumber}</th>
                  <th>{T.refundStatus}</th>
                  <th className={cell.num}>{T.refundAmount}</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((x) => (
                  <tr key={x.id}>
                    <td className={`${cell.code} ${cell.nowrap}`}>
                      <Link href={x.payment_id ? boHref.payment(x.payment_id) : boHref.refunds()}>
                        {x.number}
                      </Link>
                    </td>
                    <td>
                      <Badge labels={billingText.refundStatus} value={x.status} />
                    </td>
                    <td className={`${cell.num} ${cell.nowrap}`}>
                      {money(x.amount_kurus, x.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      )}

      <Panel title={T.history}>
        <Facts
          rows={[
            [T.requestedAt, when(r.requested_at)],
            [T.scheduledAt, when(r.scheduled_at)],
            ...(r.completed_at
              ? ([[T.completedAt, when(r.completed_at)]] as [string, string][])
              : []),
            ...(r.cancelled_at
              ? ([[T.cancelledAt, when(r.cancelled_at)]] as [string, string][])
              : []),
            ...(r.access_revoked_at
              ? ([[T.accessRevokedAt, when(r.access_revoked_at)]] as [string, string][])
              : []),
          ]}
        />
      </Panel>
    </>
  );

  const actions = (
    <>
      <Panel title={T.scheduleTitle}>
        <p className={styles.hint} data-testid="schedule-hint">
          {r.status === "requested" ? T.confirmHint : T.scheduleHint}
        </p>
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
          <Field label={B.fields.access_days} hint={T.shortAccessRule(settingAccessDays)}>
            <input
              name="access_days"
              type="number"
              min={0}
              max={365}
              defaultValue={r.access_days}
              required
            />
          </Field>
          <Checkbox
            id="removal-revoke-all"
            name="revoke_all_access"
            defaultChecked={row?.revoke_all_access ?? false}
            label={B.fields.revoke_all_access}
            hint={row ? T.revokeAllHint : `${T.revokeAllUnknown} ${T.revokeAllHint}`}
          />
          <Field label={B.internalNote} optional>
            <textarea name="note" maxLength={2000} rows={2} />
          </Field>
          <div className={ops.actions}>
            <Button type="submit">{T.schedule}</Button>
          </div>
        </ActionForm>
      </Panel>
      <Panel title={T.completeTitle}>
        {due ? (
          <>
            <p className={styles.hint}>{T.completeHint}</p>
            <ActionForm action={completeRemovalAction} testId="complete-removal-form">
              <input type="hidden" name="removal_id" value={r.id} />
              <Checkbox
                id="removal-complete-confirm"
                name="confirm"
                required
                label={T.completeConfirm}
                hint={T.completeConsequence(day(today))}
              />
              <div className={ops.actions}>
                <Button variant="danger" type="submit">
                  {T.complete}
                </Button>
              </div>
            </ActionForm>
          </>
        ) : (
          <p className="muted" data-testid="removal-not-due">
            {T.notDue(day(effectiveOn))}
          </p>
        )}
      </Panel>
      <Panel title={T.cancelTitle}>
        <p className={styles.hint}>{T.cancelConsequence}</p>
        <ActionForm action={cancelRemovalAction} testId="cancel-removal-form">
          <input type="hidden" name="removal_id" value={r.id} />
          <Field label={B.internalNote}>
            <textarea name="note" maxLength={2000} rows={2} required />
          </Field>
          <div className={ops.actions}>
            <Button variant="secondary" type="submit">
              {T.cancel}
            </Button>
          </div>
        </ActionForm>
      </Panel>
    </>
  );

  return (
    <main className="page">
      <PageHeader
        title={T.title(r.number)}
        back={{ href: boHref.removals(), label: B.removals.title }}
        meta={
          <>
            <Badge labels={billingText.gardenRemovalStatus} value={r.status} kind="removal" />
            {view.blockedReason && <UiBadge tone="danger">{B.removals.blocked}</UiBadge>}
            {r.withdrawal && <UiBadge>{B.removals.withdrawal}</UiBadge>}
            {r.at_period_end && <UiBadge>{B.removals.atPeriodEnd}</UiBadge>}
          </>
        }
      />
      <BoResultNotice params={query} />
      {view.blockedReason && <Warning testId="removal-blocked">{T.blocked}</Warning>}
      {open ? <Split aside={actions}>{record}</Split> : <Stack>{record}</Stack>}
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
      <p className={styles.hint}>{completed ? T.calculation : T.previewHint}</p>
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
      <Table data-testid="removal-lines">
        <thead>
          <tr>
            <th>{T.order}</th>
            <th className={cell.num}>{T.amount}</th>
            <th className={cell.num}>{T.visits}</th>
            <th className={cell.num}>{T.visitFee}</th>
            <th className={cell.num}>{T.inventoryShare}</th>
            <th className={cell.num}>{T.gross}</th>
            <th className={cell.num}>{T.alreadyRefunded}</th>
            <th className={cell.num}>{T.refund}</th>
            <th className={cell.num}>{T.refundVat}</th>
          </tr>
        </thead>
        <tbody>
          {(p.lines ?? []).map((l) => (
            <tr key={l.order_item_id} data-unattributed={l.unattributed || undefined}>
              <td>
                <span className={styles.line}>{l.order_number}</span>
                <span className={styles.lineMode}>
                  {label(billingText.removalRefundMode, l.mode)}
                </span>
              </td>
              <td className={`${cell.num} ${cell.nowrap}`}>{money(l.amount_kurus)}</td>
              <td className={`${cell.num} ${cell.nowrap}`}>
                {formatNumber(l.visits_entitled)} / {formatNumber(l.visits_used)} /{" "}
                {formatNumber(l.visits_excluded)}
              </td>
              <td className={`${cell.num} ${cell.nowrap}`}>{money(l.visit_fee_kurus)}</td>
              <td className={`${cell.num} ${cell.nowrap}`}>
                {money(l.inventory_share_kurus)}
                {l.inventory_done && <span className="muted"> ({T.inventoryDone})</span>}
              </td>
              <td className={`${cell.num} ${cell.nowrap}`}>{money(l.gross_kurus)}</td>
              <td className={`${cell.num} ${cell.nowrap}`}>
                {money(-l.already_refunded_kurus)}
              </td>
              <td className={`${cell.num} ${cell.nowrap}`}>{money(l.refund_kurus)}</td>
              <td className={`${cell.num} ${cell.nowrap}`}>{money(l.refund_vat_kurus)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className={bo.totals}>
            <td colSpan={7}>{T.total}</td>
            <td className={`${cell.num} ${cell.nowrap}`} data-testid="removal-refund-total">
              {money(p.refund_kurus)}
            </td>
            <td className={`${cell.num} ${cell.nowrap}`}>{money(p.refund_vat_kurus)}</td>
          </tr>
        </tfoot>
      </Table>
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
    <div className={styles.pair}>
      <Panel title={T.context}>
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
      </Panel>
      <Panel title={T.accessScope}>
        <Facts
          testId="removal-access-scope"
          rows={[
            [T.customerOwner, formatNumber(scope.customer_owner)],
            [T.invitedViewers, formatNumber(scope.invited_viewers)],
            [T.otherViewers, formatNumber(scope.other_viewers)],
            [T.otherOwners, formatNumber(scope.other_owners)],
          ]}
        />
      </Panel>
    </div>
  );
}
