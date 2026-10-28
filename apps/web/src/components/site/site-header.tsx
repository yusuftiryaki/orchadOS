import Link from "next/link";
import { signOut } from "@/app/actions";
import { LogoMark } from "@/components/brand/logo";
import { t } from "@/lib/i18n";
import { demoText } from "@/lib/i18n/messages/demo";
import { DemoExitButton } from "./demo-exit-button";
import { siteText } from "@/lib/i18n/messages/site";
import styles from "./site.module.css";

export const SITE_NAV = [
  { href: "/nasil-calisir", label: siteText.nav.howItWorks },
  { href: "/paketler", label: siteText.nav.packages },
  { href: "/sss", label: siteText.nav.faq },
  { href: "/iletisim", label: siteText.nav.contact },
] as const;

// Header of the public site. Signed out: login, the demo when this site links
// to one, and sign-up when the flag is on. Signed in: the account (`/` sends
// the user to their section) and logout; a demo visitor gets "Demoya dön"
// and "Demodan çık" instead.
export function SiteHeader({
  signedIn,
  signupEnabled,
  demoUrl = null,
  demo = false,
}: {
  signedIn: boolean;
  signupEnabled: boolean;
  demoUrl?: string | null;
  demo?: boolean;
}) {
  const s = siteText.nav;
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.brand}>
          <LogoMark />
          <span>{t.app.name}</span>
        </Link>
        <nav aria-label={s.label} className={styles.nav}>
          {SITE_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.actions}>
          {signedIn && demo ? (
            <>
              <Link href="/portal" className={styles.actionLink} data-testid="header-demo-back">
                {demoText.site.backToDemo}
              </Link>
              <DemoExitButton next="/" label={demoText.site.exit} testId="header-demo-exit" />
            </>
          ) : signedIn ? (
            <>
              <Link href="/" className={styles.actionLink}>
                {s.account}
              </Link>
              <form action={signOut}>
                <button className="button button-secondary" type="submit">
                  {s.logout}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/giris" className={styles.actionLink}>
                {s.login}
              </Link>
              {demoUrl && (
                <Link href={demoUrl} className={styles.actionLink} data-testid="header-demo">
                  {s.demo}
                </Link>
              )}
              {signupEnabled && (
                <Link href="/kayit" className="button" data-testid="header-signup">
                  {s.signup}
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
