import { Panel } from "@/components/ui/panel";
import { QueueList, type QueueItem } from "@/components/operations/queue-list";
import type { BillingSummary } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { formatNumber } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { Warning } from "./parts";

const T = backOfficeText.dashboard;

// Above this many sign-up attempts in 24 hours the dashboard warns
// (docs/musteri-yonetimi.md §6.9, signup_register_attempt).
export const SIGNUP_ATTEMPT_WARNING = 300;

// "Müşteri ve ödeme" queues of the operations dashboard
// (ops_billing_summary): what went wrong first, then what waits on ops
// today, then what is in progress.
export function BillingCard({ summary }: { summary: BillingSummary }) {
  const items: QueueItem[] = [
    {
      key: "overdue",
      label: T.ordersOverdue,
      value: summary.orders_overdue,
      href: boHref.orders({ durum: "awaiting_payment" }),
      tone: "danger",
    },
    {
      key: "installmentsOverdue",
      label: T.installmentsOverdue,
      value: summary.installments_overdue,
      href: boHref.orders(),
      tone: "danger",
    },
    {
      key: "refundsFailed",
      label: T.refundsFailed,
      value: summary.refunds_failed,
      href: boHref.refunds(),
      tone: "danger",
    },
    {
      key: "removalsBlocked",
      label: T.removalsBlocked,
      value: summary.garden_removals_blocked,
      href: boHref.removals(),
      tone: "danger",
    },
    {
      key: "applications",
      label: T.applicationsSubmitted,
      value: summary.applications_submitted,
      href: boHref.applications({ durum: "submitted" }),
      tone: "warning",
    },
    {
      key: "review",
      label: T.paymentsReview,
      value: summary.payments_pending_review,
      href: boHref.payments({ durum: "pending_review" }),
      tone: "warning",
    },
    // IP14: the garden removal queue (open removals by their effective day).
    {
      key: "removalsRequested",
      label: T.removalsRequested,
      value: summary.garden_removals_requested,
      href: boHref.removals(),
      tone: "warning",
    },
    {
      key: "removalsDue",
      label: T.removalsDue,
      value: summary.garden_removals_due,
      href: boHref.removals(),
      tone: "warning",
    },
    {
      key: "quotes",
      label: T.quotesOpen,
      value: summary.quotes_open,
      href: boHref.applications({ durum: "quoted" }),
    },
    {
      key: "awaiting",
      label: T.ordersAwaiting,
      value: summary.orders_awaiting_payment,
      href: boHref.orders({ durum: "awaiting_payment" }),
    },
    { key: "refunds", label: T.refundsOpen, value: summary.refunds_open, href: boHref.refunds() },
    {
      key: "inventory",
      label: T.parcelsAwaitingInventory,
      value: summary.parcels_awaiting_inventory,
      href: boHref.orders({ durum: "active" }),
    },
    {
      key: "renewals",
      label: T.renewalsDue,
      value: summary.renewals_due,
      href: boHref.orders({ durum: "active" }),
    },
  ];
  return (
    <Panel
      title={T.title}
      testId="billing-card"
      actions={
        <span className="muted">
          {T.signupAttempts}: {formatNumber(summary.signup_attempts_24h)}
        </span>
      }
    >
      {summary.signup_attempts_24h > SIGNUP_ATTEMPT_WARNING && (
        <Warning testId="signup-warning">{T.signupWarning(summary.signup_attempts_24h)}</Warning>
      )}
      <QueueList items={items} label={T.title} />
    </Panel>
  );
}
