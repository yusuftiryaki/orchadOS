import { signOut } from "@/app/actions";
import { accessibleSections } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { contractsText as C } from "@/lib/i18n/messages/contracts";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { servicesText } from "@/lib/i18n/messages/services";
import { PortalFrame, type PortalLink } from "./portal-frame";
import styles from "./portal-shell.module.css";

// The owner's frame: one navigation row. A customer (owner profile) gets the
// portal's own pages; a co-owner without a profile only the gardens. Other
// sections the user may open (a team member who is also a customer) follow
// at the end of the same row, so the header never shows two competing
// "Bahçelerim" links (docs/tasarim-sistemi.md §Denetim, Portal).
export function PortalShell({
  user,
  services = false,
  children,
}: {
  user: SessionUser;
  // IP15: the caller owns a parcel with the service layer on.
  services?: boolean;
  children: React.ReactNode;
}) {
  const others: PortalLink[] = accessibleSections(user.roles)
    .filter((s) => s !== "portal")
    .map((s) => ({ href: `/${s}`, label: t.sections[s] }));
  const links: PortalLink[] = user.roles.customer
    ? [
        { href: "/portal", label: P.nav.gardens },
        { href: "/portal/basvuru", label: P.nav.applications },
        { href: "/portal/siparis", label: P.nav.orders },
        { href: "/portal/odeme", label: P.nav.payments },
        // IP15: service requests (weed mowing), for owners with the switch on.
        ...(services ? [{ href: "/portal/hizmetler", label: servicesText.nav }] : []),
        { href: "/portal/hesap/sozlesmeler", label: C.list.navLabel },
        { href: "/portal/hesap", label: P.nav.account },
        ...others,
      ]
    : [
        { href: "/portal", label: t.sections.portal },
        // An owner without a customer profile (a pilot owner) may request
        // services too; a co-owner has nothing there.
        ...(services ? [{ href: "/portal/hizmetler", label: servicesText.nav }] : []),
        ...others,
      ];
  const initial = (user.email ?? "?").slice(0, 1).toLocaleUpperCase("tr-TR");
  return (
    <PortalFrame
      links={links}
      navLabel={user.roles.customer ? P.nav.label : t.nav.sections}
      account={
        <>
          <span className={styles.avatar} aria-hidden title={user.email ?? undefined}>
            {initial}
          </span>
          {/* Six portal links leave no room for the address in the header;
              the customer finds it on "Hesabım". */}
          <span className={user.roles.customer ? "sr-only" : styles.email} data-testid="user-email">
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
