import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/components/ui/status";
import type { SessionStatus } from "@/lib/expert/review";
import { t } from "@/lib/i18n";

export function SessionStatusBadge({ status, testId }: { status: SessionStatus; testId?: string }) {
  return (
    <Badge tone={statusTone(status, "visit")} testId={testId}>
      {t.office.sessionStatus[status]}
    </Badge>
  );
}
