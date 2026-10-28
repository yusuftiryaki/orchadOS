import { Badge, type BadgeTone } from "@/components/ui/badge";
import { billingText as B } from "@/lib/i18n/messages/billing";

// One tone per state across the customer's screens (docs/tasarim-sistemi.md
// §Kullanım 5): done and paid are success, waiting on the customer is
// warning, waiting on us is info, ended or failed is danger, the rest
// neutral. The text always names the state; the tone only supports it.
const TONES = {
  application: {
    draft: "neutral",
    submitted: "info",
    quoted: "warning",
    accepted: "success",
    rejected: "danger",
    withdrawn: "neutral",
  },
  quote: {
    issued: "warning",
    accepted: "success",
    declined: "neutral",
    superseded: "neutral",
    expired: "danger",
    cancelled: "neutral",
  },
  order: {
    awaiting_payment: "warning",
    active: "success",
    completed: "neutral",
    cancelled: "neutral",
    terminated: "danger",
  },
  payment: {
    initiated: "neutral",
    pending_review: "info",
    succeeded: "success",
    failed: "danger",
    expired: "danger",
    voided: "neutral",
  },
  refund: {
    requested: "info",
    processing: "info",
    succeeded: "success",
    failed: "danger",
    cancelled: "neutral",
  },
  removal: {
    requested: "info",
    scheduled: "warning",
    completed: "neutral",
    cancelled: "neutral",
  },
} as const satisfies Record<string, Record<string, BadgeTone>>;

const LABELS = {
  application: B.applicationStatus,
  quote: B.quoteStatus,
  order: B.orderStatus,
  payment: B.paymentStatus,
  refund: B.refundStatus,
  removal: B.gardenRemovalStatus,
} as const;

export type StatusKind = keyof typeof TONES;

export function statusTone(kind: StatusKind, status: string): BadgeTone {
  return (TONES[kind] as Record<string, BadgeTone>)[status] ?? "neutral";
}

// A billing state as a badge: <StatusBadge kind="order" status="active" />.
// `children` overrides the label (a garden's dated state line).
export function StatusBadge({
  kind,
  status,
  children,
  testId,
}: {
  kind: StatusKind;
  status: string;
  children?: React.ReactNode;
  testId?: string;
}) {
  const label = children ?? (LABELS[kind] as Record<string, string>)[status] ?? status;
  return (
    <Badge tone={statusTone(kind, status)} testId={testId}>
      {label}
    </Badge>
  );
}

// A garden's service state (my_gardens.state): in service, upcoming,
// leaving or removed. The text is gardenBadge()'s dated line.
export function gardenTone(state: string): BadgeTone {
  switch (state) {
    case "leaving":
      return "warning";
    case "removed":
      return "neutral";
    case "upcoming":
      return "info";
    default:
      return "success";
  }
}
