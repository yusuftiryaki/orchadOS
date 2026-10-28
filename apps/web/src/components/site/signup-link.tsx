import { ButtonLink } from "@/components/ui/button";
import { siteText } from "@/lib/i18n/messages/site";

// "Hesabınız yok mu?" beside the login form, only when sign-ups are open.
export function SignupLink({ signupEnabled }: { signupEnabled: boolean }) {
  if (!signupEnabled) return null;
  return (
    <div data-testid="login-signup-link">
      <h2>{siteText.login.noAccount}</h2>
      <p>{siteText.login.signupBody}</p>
      <ButtonLink href="/kayit" variant="secondary">
        {siteText.login.signup}
      </ButtonLink>
    </div>
  );
}
