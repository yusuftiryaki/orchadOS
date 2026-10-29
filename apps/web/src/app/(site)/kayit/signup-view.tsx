import Link from "next/link";
import styles from "@/components/site/auth.module.css";
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
        <header className={styles.head} data-testid="signup-closed">
          <h1 className={styles.title}>{s.closedTitle}</h1>
          <p className={styles.lead}>{s.closedBody}</p>
        </header>
        <section className={`${styles.main} ${styles.sheet}`} aria-labelledby="signup-ways">
          <h2 id="signup-ways" className={styles.sheetTitle}>
            {s.closedWaysTitle}
          </h2>
          <ul className={styles.ways}>
            <li>
              <strong>{w.contact.title}</strong>
              <span>{w.contact.body}</span>
              <Link href="/iletisim" className="button" data-testid="signup-closed-contact">
                {s.closedContact}
              </Link>
            </li>
            <li>
              <strong>{w.packages.title}</strong>
              <span>{w.packages.body}</span>
              <Link href="/paketler" data-testid="signup-closed-packages">
                {w.packages.link}
              </Link>
            </li>
            {demoUrl && (
              <li>
                <strong>{w.demo.title}</strong>
                <span>{w.demo.body}</span>
                <Link href={demoUrl} data-testid="signup-closed-demo">
                  {w.demo.link}
                </Link>
              </li>
            )}
          </ul>
          <p className={styles.below}>
            {s.haveAccount} <Link href="/giris">{s.login}</Link>
          </p>
        </section>
      </div>
    );
  }
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{s.title}</h1>
        <p className={styles.lead}>{s.subtitle}</p>
      </header>
      <div className={styles.main}>
        <SignupForm turnstileSiteKey={turnstileSiteKey} captchaProvider={captchaProvider} />
        <p className={styles.below}>
          {s.haveAccount} <Link href="/giris">{s.login}</Link>
        </p>
      </div>
      <aside className={styles.aside} aria-labelledby="signup-next">
        <div>
          <h2 id="signup-next">{s.asideTitle}</h2>
          <ol className={styles.next}>
            {s.asideSteps.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </li>
            ))}
          </ol>
          <p>{s.locationNote}</p>
        </div>
      </aside>
    </div>
  );
}
