import { signOut } from "@/app/actions";
import { AppShell } from "@/components/ui/app-shell";
import { accessibleSections, type Section } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import styles from "./section-shell.module.css";

// Frame of a signed-in section: the sections the user may open, the account
// and logout. The portal is the owner's shell; ofis, operasyon and uzman use
// the staff shell (components/ui/app-shell.tsx), compact throughout.
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
    <AppShell
      variant={section === "portal" ? "portal" : "staff"}
      // Staff screens are dense desktop work (docs/tasarim-sistemi.md §Personel).
      dense={section !== "portal"}
      navLabel={t.nav.sections}
      nav={sections.map((s) => ({ href: `/${s}`, label: t.sections[s], current: s === section }))}
      account={
        <>
          <span className={styles.avatar} aria-hidden>
            {initial}
          </span>
          <span className={styles.email} data-testid="user-email">
            {user.email}
          </span>
          <form action={signOut}>
            <button className="button button-secondary button-sm" type="submit">
              {t.nav.logout}
            </button>
          </form>
        </>
      }
    >
      {children}
    </AppShell>
  );
}
