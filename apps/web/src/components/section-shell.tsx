import Link from "next/link";
import { signOut } from "@/app/actions";
import { accessibleSections, type Section } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { LogoMark } from "./brand/logo";
import styles from "./section-shell.module.css";

export function SectionShell({
  user,
  section,
  children,
}: {
  user: SessionUser;
  section: Section;
  children: React.ReactNode;
}) {
  const sections = accessibleSections(user.roles);
  const initial = (user.email ?? "?").slice(0, 1).toLocaleUpperCase("tr-TR");

  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Link href="/" className={styles.brand}>
            <LogoMark />
            <span>{t.app.name}</span>
          </Link>
          <nav aria-label={t.nav.sections} className={styles.nav}>
            {sections.map((s) => (
              <Link
                key={s}
                href={`/${s}`}
                className={s === section ? styles.active : styles.link}
                aria-current={s === section ? "page" : undefined}
              >
                {t.sections[s]}
              </Link>
            ))}
          </nav>
          <div className={styles.user}>
            <span className={styles.avatar} aria-hidden>
              {initial}
            </span>
            <span className={styles.email} data-testid="user-email">
              {user.email}
            </span>
            <form action={signOut}>
              <button className={`button button-secondary ${styles.logout}`} type="submit">
                {t.nav.logout}
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
