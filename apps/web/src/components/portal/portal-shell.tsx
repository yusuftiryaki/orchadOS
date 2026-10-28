import { signOut } from "@/app/actions";
import { accessibleSections } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { contractsText as C } from "@/lib/i18n/messages/contracts";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { PortalFrame, type PortalLink } from "./portal-frame";
import styles from "./portal-shell.module.css";

// The owner's frame: one navigation row. A customer (owner profile) gets the
// portal's own pages; a co-owner without a profile only the gardens. Other
// sections the user may open (a team member who is also a customer) follow
// at the end of the same row, so the header never shows two competing
// "Bahçelerim" links (docs/tasarim-sistemi.md §Denetim, Portal).
export function PortalShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const others: PortalLink[] = accessibleSections(user.roles)
    .filter((s) => s !== "portal")
    .map((s) => ({ href: `/${s}`, label: t.sections[s] }));
  const links: PortalLink[] = user.roles.customer
    ? [
        { href: "/portal", label: P.nav.gardens },
        { href: "/portal/basvuru", label: P.nav.applications },
        { href: "/portal/siparis", label: P.nav.orders },
        { href: "/portal/odeme", label: P.nav.payments },
        { href: "/portal/hesap/sozlesmeler", label: C.list.navLabel },
        { href: "/portal/hesap", label: P.nav.account },
        ...others,
      ]
    : [{ href: "/portal", label: t.sections.portal }, ...others];
  const initial = (user.email ?? "?").slice(0, 1).toLocaleUpperCase("tr-TR");
  return (
    <PortalFrame
      links={links}
      navLabel={user.roles.customer ? P.nav.label : t.nav.sections}
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
    </PortalFrame>
  );
}
