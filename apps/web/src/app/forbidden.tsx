import { signOut } from "@/app/actions";
import { StatusPage } from "@/components/site/status-page";
import { Button, ButtonLink } from "@/components/ui/button";
import { t } from "@/lib/i18n";

export default function Forbidden() {
  return (
    <StatusPage
      code="403"
      title={t.forbidden.title}
      testId="forbidden"
      // Only a signed-in user without the role sees this page: offer the way
      // to another account the text names.
      action={
        <>
          <ButtonLink href="/">{t.forbidden.back}</ButtonLink>
          <form action={signOut}>
            <Button variant="secondary" type="submit">
              {t.forbidden.signOut}
            </Button>
          </form>
        </>
      }
    >
      <p>{t.forbidden.body}</p>
    </StatusPage>
  );
}
