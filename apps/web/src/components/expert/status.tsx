import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { SessionStatus } from "@/lib/expert/review";
import { t } from "@/lib/i18n";

// Visit states: work ahead is info, the published visit success.
export const SESSION_STATUS_TONE: Record<SessionStatus, BadgeTone> = {
  planned: "neutral",
  captured: "neutral",
  processed: "info",
  in_review: "info",
  published: "success",
  cancelled: "neutral",
};

export function SessionStatusBadge({ status, testId }: { status: SessionStatus; testId?: string }) {
  return (
    <Badge tone={SESSION_STATUS_TONE[status]} testId={testId}>
      {t.office.sessionStatus[status]}
    </Badge>
  );
}
