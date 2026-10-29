import Link from "next/link";
import { signOut } from "@/app/actions";
import { LogoMark } from "@/components/brand/logo";
import { t } from "@/lib/i18n";
import { demoText } from "@/lib/i18n/messages/demo";
import { CurrentLink } from "./current-link";
import { DemoExitButton } from "./demo-exit-button";
import { siteText } from "@/lib/i18n/messages/site";
import { MobileNav } from "./mobile-nav";
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
// and "Demodan çık" instead. On a phone the page links, login and the demo
// move into the menu; sign-up (or the account) stays on the bar.
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
            <CurrentLink key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </CurrentLink>
          ))}
        </nav>
        <div className={styles.actions}>
          {signedIn && demo ? (
            <>
              <Link
                href="/portal"
                className="button button-secondary button-sm"
                data-testid="header-demo-back"
              >
                {demoText.site.backToDemo}
              </Link>
              <span className={styles.wideOnly}>
                <DemoExitButton next="/" label={demoText.site.exit} testId="header-demo-exit" />
              </span>
            </>
          ) : signedIn ? (
            <>
              <Link href="/" className="button button-secondary button-sm">
                {s.account}
              </Link>
              <form action={signOut} className={styles.wideOnly}>
                <button className="button button-quiet button-sm" type="submit">
                  {s.logout}
                </button>
              </form>
            </>
          ) : (
            <>
              <CurrentLink href="/giris" className={`${styles.navLink} ${styles.wideOnly}`}>
                {s.login}
              </CurrentLink>
              {demoUrl && (
                <Link
                  href={demoUrl}
                  className={`button button-secondary button-sm ${styles.wideOnly}`}
                  data-testid="header-demo"
                >
                  {s.demo}
                </Link>
              )}
              {signupEnabled && (
                <Link href="/kayit" className="button button-sm" data-testid="header-signup">
                  {s.signup}
                </Link>
              )}
            </>
          )}
          <MobileNav openLabel={s.menu} closeLabel={s.menuClose}>
            <nav aria-label={s.label} className={styles.menuLinks}>
              {SITE_NAV.map((item) => (
                <CurrentLink key={item.href} href={item.href}>
                  {item.label}
                </CurrentLink>
              ))}
            </nav>
            <div className={styles.menuActions}>
              {signedIn && demo ? (
                <DemoExitButton next="/" label={demoText.site.exit} />
              ) : signedIn ? (
                <form action={signOut}>
                  <button className="button button-secondary button-block" type="submit">
                    {s.logout}
                  </button>
                </form>
              ) : (
                <>
                  {demoUrl && (
                    <Link href={demoUrl} className="button button-secondary button-block">
                      {s.demo}
                    </Link>
                  )}
                  <Link href="/giris" className="button button-quiet button-block">
                    {s.login}
                  </Link>
                </>
              )}
            </div>
          </MobileNav>
        </div>
      </div>
    </header>
  );
}
