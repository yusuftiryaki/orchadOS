import Link from "next/link";
import {
  cancelRefundAction,
  completeManualRefundAction,
  processRefundAction,
  resolveRefundAction,
} from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { Badges, Sub, moneyUi } from "@/components/back-office/money-ui";
import { Badge, BoResultNotice, money, when } from "@/components/back-office/parts";
import { FilterTabs, Pagination, Toolbar, opsCell, pageOf } from "@/components/operations/ops-ui";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { listRefunds, type RefundRow } from "@/lib/back-office/data";
import { boHref, firstParam } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsOrgs } from "@/lib/operations/data";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.refunds;
const STATUSES = ["requested", "processing", "succeeded", "failed", "cancelled"] as const;
type Filter = "acik" | (typeof STATUSES)[number];

// Work to do on a refund: requested, failed, or processing for too long.
const isOpen = (r: RefundRow) => r.status === "requested" || r.status === "failed" || !!r.uncertain;

// Refunds, open work first (requested, failed, uncertain), with the actions
// each state allows: process a card refund (payments function), record a
// transfer refund, cancel a request, or record the result by hand. Filters
// by state (?durum=acik for open work) with counts; all by default.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const supabase = await createClient();
  const [params, all] = await Promise.all([
    searchParams,
    opsOrgs(supabase, user.id).then((orgs) => listRefunds(supabase, orgs)),
  ]);
  const today = todayIn(new Date());
  const raw = firstParam(params.durum);
  const filter: Filter | null =
    raw === "acik" || STATUSES.includes(raw as (typeof STATUSES)[number]) ? (raw as Filter) : null;
  const matches = (r: RefundRow, f: Filter) => (f === "acik" ? isOpen(r) : r.status === f);
  const rows = filter ? all.filter((r) => matches(r, filter)) : all;
  const page = pageOf(rows, params.sayfa);
  const href = (f: Filter | null, p?: number) => {
    const q = new URLSearchParams();
    if (f) q.set("durum", f);
    if (p) q.set("sayfa", String(p));
    const s = q.toString();
    return s ? `${boHref.refunds()}?${s}` : boHref.refunds();
  };

  return (
    <main className="page">
      <PageHeader title={T.title} lead={T.hint} />
      <BoResultNotice params={params} />
      <section aria-label={T.title}>
        <Toolbar end={<span className="muted">{T.count(rows.length)}</span>}>
          <FilterTabs
            label={T.filterLabel}
            items={[
              { href: href(null), label: B.all, count: all.length, current: !filter },
              {
                href: href("acik"),
                label: T.open,
                count: all.filter(isOpen).length,
                current: filter === "acik",
              },
              ...STATUSES.map((s) => ({
                href: href(s),
                label: billingText.refundStatus[s],
                count: all.filter((r) => r.status === s).length,
                current: filter === s,
              })),
            ]}
          />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState title={filter === "acik" ? T.emptyOpen : T.emptyTitle}>
            <p>{T.emptyHint}</p>
          </EmptyState>
        ) : (
          <>
            <Table data-testid="refund-list">
              <thead>
                <tr>
                  <th>{T.number}</th>
                  <th>{T.payment}</th>
                  <th>{T.kind}</th>
                  <th className={cell.num}>{T.amount}</th>
                  <th>{T.reason}</th>
                  <th className={cell.num}>{T.requestedAt}</th>
                  <th>{T.status}</th>
                  <th>{T.actions}</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((r) => (
                  <tr key={r.id} data-refund-id={r.id} data-status={r.status}>
                    <td className={cell.code}>{r.number}</td>
                    <td className={opsCell.nowrap}>
                      <Link href={boHref.payment(r.payment_id)}>{r.order_number}</Link>
                      <Sub>{r.customer_name ?? B.none}</Sub>
                    </td>
                    <td className={opsCell.nowrap}>
                      {billingText.refundKind[r.kind as keyof typeof billingText.refundKind]}
                    </td>
                    <td className={cell.num}>{money(r.amount_kurus, r.currency)}</td>
                    <td>
                      {billingText.refundReason[
                        r.reason as keyof typeof billingText.refundReason
                      ] ?? r.reason}
                      {r.by_system && <Sub>{T.bySystem}</Sub>}
                    </td>
                    <td className={cell.num}>{when(r.requested_at)}</td>
                    <td>
                      <Badges>
                        <Badge labels={billingText.refundStatus} value={r.status} />
                        {r.uncertain && <UiBadge tone="danger">{T.uncertain}</UiBadge>}
                      </Badges>
                      {r.attempts > 0 && <Sub>{T.attempts(r.attempts)}</Sub>}
                      {r.failure_code && <Sub code>{r.failure_code}</Sub>}
                    </td>
                    <td>
                      <RowActions refund={r} today={today} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination {...page} href={(p) => href(filter, p)} />
          </>
        )}
      </section>
    </main>
  );
}

function RowActions({ refund: r, today }: { refund: RefundRow; today: string }) {
  const card = r.kind !== "manual";
  // payment_refund_claim's rule: a failed refund goes again only when retryable
  // (not after a provider decline that cannot be retried, nor after ops
  // settled it by hand as failed).
  const canProcess =
    card && (r.status === "requested" || (r.status === "failed" && r.retryable !== false));
  const canResolve = card && (r.status === "failed" || r.uncertain);
  // The system's void for a provider mismatch is the only way out of the
  // payment's review: not cancelled from here.
  const canCancel = r.status === "requested" && !(r.by_system && r.reason === "provider_mismatch");
  if (!canProcess && !canResolve && !canCancel && r.status !== "requested") return null;
  return (
    <div className={moneyUi.rowActions}>
      {canProcess && (
        <ActionForm action={processRefundAction} inline testId="process-refund">
          <input type="hidden" name="refund_id" value={r.id} />
          <Button type="submit" size="sm" variant="secondary" title={T.processHint}>
            {T.process}: {money(r.amount_kurus, r.currency)}
          </Button>
        </ActionForm>
      )}
      {!card && r.status === "requested" && (
        <details open>
          <summary>{T.completeManual}</summary>
          <ActionForm action={completeManualRefundAction} inline testId="complete-manual-refund">
            <input type="hidden" name="refund_id" value={r.id} />
            <label>
              {T.bankReference}
              <input name="bank_reference" maxLength={100} required />
            </label>
            <label>
              {T.completedOn}
              <input type="date" name="completed_on" defaultValue={today} max={today} required />
            </label>
            <Button type="submit" size="sm" variant="secondary">
              {T.completeManual}
            </Button>
          </ActionForm>
        </details>
      )}
      {canResolve && (
        <details>
          <summary>{T.resolve}</summary>
          <ActionForm action={resolveRefundAction} inline testId="resolve-refund">
            <input type="hidden" name="refund_id" value={r.id} />
            <label>
              {T.providerRef}
              <input name="provider_ref" maxLength={100} />
            </label>
            <label>
              {T.note}
              <input name="note" maxLength={2000} />
            </label>
            <Button type="submit" size="sm" variant="secondary" name="outcome" value="succeeded">
              {T.succeeded}
            </Button>
            <Button type="submit" size="sm" variant="secondary" name="outcome" value="failed">
              {T.failed}
            </Button>
          </ActionForm>
        </details>
      )}
      {canCancel && (
        <details>
          <summary>{T.cancel}</summary>
          <ActionForm action={cancelRefundAction} inline testId="cancel-refund">
            <input type="hidden" name="refund_id" value={r.id} />
            <label>
              {T.note}
              <input name="note" maxLength={2000} />
            </label>
            <Button type="submit" size="sm" variant="danger">
              {T.cancel}
            </Button>
          </ActionForm>
        </details>
      )}
    </div>
  );
}
