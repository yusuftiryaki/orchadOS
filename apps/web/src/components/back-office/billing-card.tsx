import Link from "next/link";
import styles from "@/components/operations/operations.module.css";
import type { BillingSummary } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { formatNumber } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { Warning } from "./parts";

const T = backOfficeText.dashboard;

// Above this many sign-up attempts in 24 hours the dashboard warns
// (docs/musteri-yonetimi.md §6.9, signup_register_attempt).
export const SIGNUP_ATTEMPT_WARNING = 300;

// "Müşteri ve ödeme" card of the operations dashboard (ops_billing_summary).
export function BillingCard({ summary }: { summary: BillingSummary }) {
  const stats: [string, number, string][] = [
    ["applications", summary.applications_submitted, boHref.applications({ durum: "submitted" })],
    ["quotes", summary.quotes_open, boHref.applications({ durum: "quoted" })],
    ["awaiting", summary.orders_awaiting_payment, boHref.orders({ durum: "awaiting_payment" })],
    ["overdue", summary.orders_overdue, boHref.orders({ durum: "awaiting_payment" })],
    ["review", summary.payments_pending_review, boHref.payments({ durum: "pending_review" })],
    ["refunds", summary.refunds_open, boHref.refunds()],
    ["refundsFailed", summary.refunds_failed, boHref.refunds()],
    ["inventory", summary.parcels_awaiting_inventory, boHref.orders({ durum: "active" })],
    ["renewals", summary.renewals_due, boHref.orders({ durum: "active" })],
    // IP14: the garden removal queue (open removals by their effective day).
    ["removalsRequested", summary.garden_removals_requested, boHref.removals()],
    ["removalsDue", summary.garden_removals_due, boHref.removals()],
    ["removalsBlocked", summary.garden_removals_blocked, boHref.removals()],
    // The payment plan: open installments 30+ days past due (H35 (c)).
    ["installmentsOverdue", summary.installments_overdue, boHref.orders()],
  ];
  const labels: Record<string, string> = {
    applications: T.applicationsSubmitted,
    quotes: T.quotesOpen,
    awaiting: T.ordersAwaiting,
    overdue: T.ordersOverdue,
    review: T.paymentsReview,
    refunds: T.refundsOpen,
    refundsFailed: T.refundsFailed,
    inventory: T.parcelsAwaitingInventory,
    renewals: T.renewalsDue,
    removalsRequested: T.removalsRequested,
    removalsDue: T.removalsDue,
    removalsBlocked: T.removalsBlocked,
    installmentsOverdue: T.installmentsOverdue,
  };
  return (
    <section className={styles.section} data-testid="billing-card">
      <h2>{T.title}</h2>
      {summary.signup_attempts_24h > SIGNUP_ATTEMPT_WARNING && (
        <Warning testId="signup-warning">{T.signupWarning(summary.signup_attempts_24h)}</Warning>
      )}
      <ul className={styles.stats}>
        {stats.map(([key, value, href]) => (
          <li key={key}>
            <Link className={styles.stat} href={href} data-stat={key}>
              <span className={styles.statValue}>{formatNumber(value)}</span>
              {labels[key]}
            </Link>
          </li>
        ))}
      </ul>
      <p className="muted">
        {T.signupAttempts}: {formatNumber(summary.signup_attempts_24h)}
      </p>
    </section>
  );
}
