import { Alert } from "@/components/ui/alert";
import { servicesText as S } from "@/lib/i18n/messages/services";
import { longDate } from "@/lib/services/format";

// Expert review (IP15, docs/MVP.md Module 6, "Bağımsızlık"): orchadOS itself
// mowed the parcel in the window before this visit. Read-only information;
// the review and signature flow do not change.
export function OwnWorkNotice({ days }: { days: string[] }) {
  if (days.length === 0) return null;
  return (
    <Alert tone="info" title={S.care.expertTitle} testId="own-work-notice">
      <p>{S.care.ownWork(days.map(longDate).join(", "))}</p>
      <p>{S.care.expertBody}</p>
    </Alert>
  );
}
