import Link from "next/link";
import { siteText } from "@/lib/i18n/messages/site";

// "Hesabınız yok mu? Kayıt olun" under the login form, only when sign-ups
// are open.
export function SignupLink({ signupEnabled }: { signupEnabled: boolean }) {
  if (!signupEnabled) return null;
  return (
    <p data-testid="login-signup-link">
      {siteText.login.noAccount} <Link href="/kayit">{siteText.login.signup}</Link>
    </p>
  );
}
