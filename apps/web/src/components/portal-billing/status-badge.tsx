import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/components/ui/status";
import { billingText as B } from "@/lib/i18n/messages/billing";

// A billing state in the app-wide tone (components/ui/status.ts) with its
// Turkish label.
const LABELS = {
  application: B.applicationStatus,
  quote: B.quoteStatus,
  order: B.orderStatus,
  payment: B.paymentStatus,
  refund: B.refundStatus,
  removal: B.gardenRemovalStatus,
} as const;

export type StatusKind = keyof typeof LABELS;

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
    <Badge tone={statusTone(status, kind)} testId={testId}>
      {label}
    </Badge>
  );
}
