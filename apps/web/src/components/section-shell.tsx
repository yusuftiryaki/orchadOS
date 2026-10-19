import Link from "next/link";
import { signOut } from "@/app/actions";
import { accessibleSections, type Section } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
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

  return (
    <>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          {t.app.name}
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
          <span className="muted" data-testid="user-email">
            {user.email}
          </span>
          <form action={signOut}>
            <button className="button button-secondary" type="submit">
              {t.nav.logout}
            </button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
