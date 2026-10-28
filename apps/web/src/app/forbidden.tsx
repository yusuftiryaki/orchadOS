import { StatusPage } from "@/components/site/status-page";
import { ButtonLink } from "@/components/ui/button";
import { t } from "@/lib/i18n";

export default function Forbidden() {
  return (
    <StatusPage
      code="403"
      title={t.forbidden.title}
      testId="forbidden"
      action={<ButtonLink href="/">{t.forbidden.back}</ButtonLink>}
    >
      <p>{t.forbidden.body}</p>
    </StatusPage>
  );
}
