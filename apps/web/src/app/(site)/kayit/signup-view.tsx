import Link from "next/link";
import styles from "@/components/site/auth.module.css";
import { ButtonLink } from "@/components/ui/button";
import { IconMessage, IconPackage, IconTree } from "@/components/ui/icons";
import { siteText } from "@/lib/i18n/messages/site";
import type { WebCaptchaProvider } from "@/lib/site/captcha";
import { SignupForm } from "./signup-form";

const s = siteText.signup;

// Content of /kayit; the page decides who sees it. With the flag off it is a
// "coming soon" note with the ways forward: contact, the packages, the demo
// (when this site links to one) and the login. The demo's "Gerçek hesap aç"
// lands here while the main site's sign-up is closed.
export function SignupView({
  signupEnabled,
  turnstileSiteKey,
  captchaProvider,
  demoUrl = null,
}: {
  signupEnabled: boolean;
  turnstileSiteKey: string | null;
  captchaProvider?: WebCaptchaProvider;
  demoUrl?: string | null;
}) {
  if (!signupEnabled) {
    const w = s.closedWays;
    return (
      <div className={styles.page}>
        <div className={styles.column}>
          <div className={styles.card}>
            <div className={styles.cardHead} data-testid="signup-closed">
              <h1 className={styles.title}>{s.closedTitle}</h1>
              <p className={styles.lead}>{s.closedBody}</p>
            </div>
            <section aria-labelledby="signup-ways">
              <h2 id="signup-ways" className={styles.sheetTitle}>
                {s.closedWaysTitle}
              </h2>
              <ul className={styles.ways}>
                <li>
                  <span className={styles.wayIcon} aria-hidden>
                    <IconMessage />
                  </span>
                  <strong>{w.contact.title}</strong>
                  <span>{w.contact.body}</span>
                  <ButtonLink href="/iletisim" data-testid="signup-closed-contact">
                    {s.closedContact}
                  </ButtonLink>
                </li>
                <li>
                  <span className={styles.wayIcon} aria-hidden>
                    <IconPackage />
                  </span>
                  <strong>{w.packages.title}</strong>
                  <span>{w.packages.body}</span>
                  <ButtonLink
                    href="/paketler"
                    variant="secondary"
                    data-testid="signup-closed-packages"
                  >
                    {w.packages.link}
                  </ButtonLink>
                </li>
                {demoUrl && (
                  <li>
                    <span className={styles.wayIcon} aria-hidden>
                      <IconTree />
                    </span>
                    <strong>{w.demo.title}</strong>
                    <span>{w.demo.body}</span>
                    <ButtonLink href={demoUrl} variant="secondary" data-testid="signup-closed-demo">
                      {w.demo.link}
                    </ButtonLink>
                  </li>
                )}
              </ul>
              <p className={`${styles.below} ${styles.cardFoot}`}>
                {s.haveAccount} <Link href="/giris">{s.login}</Link>
              </p>
            </section>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.page}>
      <div className={`${styles.column} ${styles.columnWide}`}>
        <SignupForm turnstileSiteKey={turnstileSiteKey} captchaProvider={captchaProvider} />
        <p className={styles.below}>
          {s.haveAccount} <Link href="/giris">{s.login}</Link>
        </p>
      </div>
      <aside className={styles.after} aria-labelledby="signup-next">
        <h2 id="signup-next">{s.asideTitle}</h2>
        <ol className={styles.next}>
          {s.asideSteps.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.body}</span>
            </li>
          ))}
        </ol>
        <p className={styles.afterNote}>{s.locationNote}</p>
      </aside>
    </div>
  );
}
