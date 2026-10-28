import Link from "next/link";
import styles from "@/components/site/auth.module.css";
import { siteText } from "@/lib/i18n/messages/site";
import type { WebCaptchaProvider } from "@/lib/site/captcha";
import { SignupForm } from "./signup-form";

const s = siteText.signup;

// Content of /kayit; the page decides who sees it. With the flag off it is
// only a "coming soon" note.
export function SignupView({
  signupEnabled,
  turnstileSiteKey,
  captchaProvider,
}: {
  signupEnabled: boolean;
  turnstileSiteKey: string | null;
  captchaProvider?: WebCaptchaProvider;
}) {
  if (!signupEnabled) {
    return (
      <div className={styles.page}>
        <header className={styles.head} data-testid="signup-closed">
          <h1 className={styles.title}>{s.closedTitle}</h1>
          <p className={styles.lead}>{s.closedBody}</p>
          <p className={styles.below}>
            <Link href="/iletisim">{s.closedContact}</Link>
          </p>
        </header>
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
