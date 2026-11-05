import Link from "next/link";
import { siteText } from "@/lib/i18n/messages/site";
import styles from "./auth.module.css";

// "Hesabınız yok mu? Kayıt ol" under the login card, only when sign-ups are
// open.
export function SignupLink({ signupEnabled }: { signupEnabled: boolean }) {
  if (!signupEnabled) return null;
  return (
    <p className={styles.below} data-testid="login-signup-link">
      {siteText.login.noAccount} <Link href="/kayit">{siteText.login.signup}</Link>
    </p>
  );
}
