import type { Metadata } from "next";
import { redirect } from "next/navigation";
import styles from "@/components/site/auth.module.css";
import { DemoContinue } from "@/components/site/demo-continue";
import { getSessionUser } from "@/lib/auth/session";
import { siteFlags } from "@/lib/flags";
import { siteText } from "@/lib/i18n/messages/site";
import { SignupView } from "./signup-view";

export const metadata: Metadata = { title: siteText.signup.title };

export default async function SignupPage() {
  const user = await getSessionUser();
  // A demo visitor ends the demo first (docs/demo-turu.md §11.3).
  if (user?.demo) {
    return (
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>{siteText.signup.title}</h1>
        </header>
        <div className={`${styles.main} ${styles.sheet}`}>
          <DemoContinue next="/kayit" />
        </div>
      </div>
    );
  }
  if (user) redirect("/");
  const { signupEnabled, turnstileSiteKey, captchaProvider, demoUrl } = siteFlags();
  return (
    <SignupView
      signupEnabled={signupEnabled}
      turnstileSiteKey={turnstileSiteKey}
      captchaProvider={captchaProvider}
      demoUrl={demoUrl}
    />
  );
}
