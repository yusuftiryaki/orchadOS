import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { siteFlags } from "@/lib/flags";
import { siteText } from "@/lib/i18n/messages/site";
import { SignupView } from "./signup-view";
import styles from "./signup.module.css";

export const metadata: Metadata = { title: siteText.signup.title };

export default async function SignupPage() {
  if (await getSessionUser()) redirect("/");
  const { signupEnabled, turnstileSiteKey } = siteFlags();
  return (
    <div className={styles.screen}>
      <SignupView signupEnabled={signupEnabled} turnstileSiteKey={turnstileSiteKey} />
    </div>
  );
}
