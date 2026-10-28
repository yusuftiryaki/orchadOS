import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DemoContinue } from "@/components/site/demo-continue";
import { getSessionUser } from "@/lib/auth/session";
import { siteFlags } from "@/lib/flags";
import { siteText } from "@/lib/i18n/messages/site";
import { SignupView } from "./signup-view";
import styles from "./signup.module.css";

export const metadata: Metadata = { title: siteText.signup.title };

export default async function SignupPage() {
  const user = await getSessionUser();
  // A demo visitor ends the demo first (docs/demo-turu.md §11.3).
  if (user?.demo) {
    return (
      <div className={styles.screen}>
        <div className={styles.card}>
          <h1>{siteText.signup.title}</h1>
          <DemoContinue next="/kayit" />
        </div>
      </div>
    );
  }
  if (user) redirect("/");
  const { signupEnabled, turnstileSiteKey } = siteFlags();
  return (
    <div className={styles.screen}>
      <SignupView signupEnabled={signupEnabled} turnstileSiteKey={turnstileSiteKey} />
    </div>
  );
}
