import Link from "next/link";
import {
  cancelRefundAction,
  completeManualRefundAction,
  processRefundAction,
  resolveRefundAction,
} from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import bo from "@/components/back-office/back-office.module.css";
import { Badge, BoResultNotice, Submit, money, when } from "@/components/back-office/parts";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { listRefunds, type RefundRow } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsOrgs } from "@/lib/operations/data";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.refunds;

// Refunds, open work first (requested, failed, uncertain), with the actions
// each state allows: process a card refund (payments function), record a
// transfer refund, cancel a request, or record the result by hand.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const supabase = await createClient();
  const rows = await listRefunds(supabase, await opsOrgs(supabase, user.id));
  const today = todayIn(new Date());

  return (
    <main className="page">
      <OpsNav current="refunds" />
      <h1>{T.title}</h1>
      <BoResultNotice params={await searchParams} />
      <p className="muted">{T.hint}</p>
      {rows.length === 0 ? (
        <p className="muted">{T.empty}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="refund-list">
            <thead>
              <tr>
                <th>{T.number}</th>
                <th>{T.payment}</th>
                <th>{T.kind}</th>
                <th className={styles.number}>{T.amount}</th>
                <th>{T.reason}</th>
                <th>{T.requestedAt}</th>
                <th>{T.status}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  data-refund-id={r.id}
                  data-status={r.status}
                  className={r.uncertain || r.status === "failed" ? bo.highlight : undefined}
                >
                  <td>{r.number}</td>
                  <td>
                    <Link href={boHref.payment(r.payment_id)}>{r.order_number}</Link>
                    <br />
                    <span className="muted">{r.customer_name ?? B.none}</span>
                  </td>
                  <td>{billingText.refundKind[r.kind as keyof typeof billingText.refundKind]}</td>
                  <td className={styles.number}>{money(r.amount_kurus, r.currency)}</td>
                  <td>
                    {billingText.refundReason[r.reason as keyof typeof billingText.refundReason] ??
                      r.reason}
                    {r.by_system && <span className="muted"> · {T.bySystem}</span>}
                  </td>
                  <td>{when(r.requested_at)}</td>
                  <td>
                    <Badge labels={billingText.refundStatus} value={r.status} />
                    {r.uncertain && <span className={styles.badgeLate}> {T.uncertain}</span>}
                    {r.attempts > 0 && <span className="muted"> · {T.attempts(r.attempts)}</span>}
                    {r.failure_code && (
                      <span className={`muted ${bo.mono}`}> {r.failure_code}</span>
                    )}
                  </td>
                  <td>
                    <RowActions refund={r} today={today} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function RowActions({ refund: r, today }: { refund: RefundRow; today: string }) {
  const card = r.kind !== "manual";
  const canProcess = card && (r.status === "requested" || r.status === "failed");
  const canResolve = card && (r.status === "failed" || r.uncertain);
  if (!canProcess && !canResolve && r.status !== "requested") return null;
  return (
    <div className={bo.rowActions}>
      {canProcess && (
        <ActionForm action={processRefundAction} inline testId="process-refund">
          <input type="hidden" name="refund_id" value={r.id} />
          <Submit>{T.process}</Submit>
        </ActionForm>
      )}
      {!card && r.status === "requested" && (
        <details open>
          <summary>{T.completeManual}</summary>
          <ActionForm action={completeManualRefundAction} testId="complete-manual-refund">
            <input type="hidden" name="refund_id" value={r.id} />
            <label>
              {T.bankReference}
              <input name="bank_reference" maxLength={100} required />
            </label>
            <label>
              {T.completedOn}
              <input type="date" name="completed_on" defaultValue={today} max={today} required />
            </label>
            <Submit>{T.completeManual}</Submit>
          </ActionForm>
        </details>
      )}
      {canResolve && (
        <details>
          <summary>{T.resolve}</summary>
          <ActionForm action={resolveRefundAction} testId="resolve-refund">
            <input type="hidden" name="refund_id" value={r.id} />
            <label>
              {T.providerRef}
              <input name="provider_ref" maxLength={100} />
            </label>
            <label>
              {T.note}
              <input name="note" maxLength={2000} />
            </label>
            <Submit name="outcome" value="succeeded">
              {T.succeeded}
            </Submit>
            <Submit name="outcome" value="failed" secondary>
              {T.failed}
            </Submit>
          </ActionForm>
        </details>
      )}
      {r.status === "requested" && (
        <details>
          <summary>{T.cancel}</summary>
          <ActionForm action={cancelRefundAction} testId="cancel-refund">
            <input type="hidden" name="refund_id" value={r.id} />
            <label>
              {T.note}
              <input name="note" maxLength={2000} />
            </label>
            <Submit secondary>{T.cancel}</Submit>
          </ActionForm>
        </details>
      )}
    </div>
  );
}
