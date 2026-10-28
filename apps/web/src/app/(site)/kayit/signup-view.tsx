import Link from "next/link";
import { siteText } from "@/lib/i18n/messages/site";
import type { WebCaptchaProvider } from "@/lib/site/captcha";
import { SignupForm } from "./signup-form";
import styles from "./signup.module.css";

const s = siteText.signup;

// Content of /kayit; the page decides who sees it. With the flag off it is
// only a "coming soon" card.
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
      <div className={styles.card} data-testid="signup-closed">
        <h1>{s.closedTitle}</h1>
        <p className="muted">{s.closedBody}</p>
        <p>
          <Link href="/iletisim">{s.closedContact}</Link>
        </p>
      </div>
    );
  }
  return (
    <div className={styles.card}>
      <h1>{s.title}</h1>
      <p className="muted">{s.subtitle}</p>
      <p className="muted">{s.locationNote}</p>
      <SignupForm turnstileSiteKey={turnstileSiteKey} captchaProvider={captchaProvider} />
      <p className={styles.footnote}>
        {s.haveAccount} <Link href="/giris">{s.login}</Link>
      </p>
    </div>
  );
}
