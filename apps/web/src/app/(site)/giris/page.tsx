import type { Metadata } from "next";
import { redirect } from "next/navigation";
import styles from "@/components/site/auth.module.css";
import { DemoContinue } from "@/components/site/demo-continue";
import { DemoLink } from "@/components/site/demo-link";
import { SignupLink } from "@/components/site/signup-link";
import { Alert } from "@/components/ui/alert";
import { getSessionUser } from "@/lib/auth/session";
import { siteFlags } from "@/lib/flags";
import { t } from "@/lib/i18n";
import { siteText } from "@/lib/i18n/messages/site";
import { LoginForm } from "./login-form";
import { loginMethodParam, safeNextPath } from "./login-methods";

export const metadata: Metadata = { title: t.login.title };

// Inside the site shell, like /kayit: the two are one flow. One centred card;
// the sign-up and demo links sit under it.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[];
    yontem?: string | string[];
    kayit?: string | string[];
  }>;
}) {
  const { next, yontem, kayit } = await searchParams;
  const target = safeNextPath(next);
  const user = await getSessionUser();
  if (user && !user.demo) redirect(target);
  const flags = siteFlags();
  const method = loginMethodParam(yontem);
  const hasAside = flags.signupEnabled || flags.demoUrl !== null;

  return (
    <div className={styles.page}>
      <div className={styles.column}>
        {kayit === "yarim" && !user?.demo && (
          <Alert tone="warning" role="status" testId="signup-unfinished">
            <p>{siteText.login.signupUnfinished}</p>
          </Alert>
        )}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <h1 className={styles.title}>{t.login.heading}</h1>
            <p className={styles.lead}>{t.login.subtitle}</p>
          </div>
          {user?.demo ? (
            <DemoContinue next="/giris" />
          ) : (
            // A new ?yontem= (the sign-up's not_completed error links
            // ?yontem=telefon) opens that tab.
            <LoginForm key={method} next={target} initialMethod={method} />
          )}
        </div>
        {!user?.demo && hasAside && (
          <aside className={styles.belowGroup} aria-label={siteText.login.asideLabel}>
            <SignupLink signupEnabled={flags.signupEnabled} />
            <DemoLink demoUrl={flags.demoUrl} />
          </aside>
        )}
      </div>
    </div>
  );
}
