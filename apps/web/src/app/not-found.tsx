import { StatusPage } from "@/components/site/status-page";
import { ButtonLink } from "@/components/ui/button";
import { t } from "@/lib/i18n";

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title={t.notFound.title}
      action={<ButtonLink href="/">{t.notFound.back}</ButtonLink>}
    >
      <p>{t.notFound.body}</p>
    </StatusPage>
  );
}
