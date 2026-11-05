import { AccountMenu, type AccountMenuLink } from "@/components/ui/account-menu";
import {
  IconCard,
  IconClipboard,
  IconFileText,
  IconGrid,
  IconPackage,
  IconShield,
  IconTool,
  IconTree,
  IconUser,
} from "@/components/ui/icons";
import { accessibleSections } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { contractsText as C } from "@/lib/i18n/messages/contracts";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { servicesText } from "@/lib/i18n/messages/services";
import { PortalFrame, type PortalLink } from "./portal-frame";

// The owner's frame. The header carries at most five top-level destinations
// (the gardens and the customer's work items); the account pages, contracts,
// permissions, other sections and "Çıkış" live in the account menu. On a
// phone the destinations become a bottom tab bar (docs/tasarim-sistemi.md,
// wave 4).
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
  const others: AccountMenuLink[] = accessibleSections(user.roles)
    .filter((s) => s !== "portal")
    .map((s) => ({ href: `/${s}`, label: t.sections[s], icon: <IconGrid size={18} /> }));
  const serviceLink: PortalLink[] = services
    ? [{ href: "/portal/hizmetler", label: servicesText.nav, icon: <IconTool /> }]
    : [];
  const links: PortalLink[] = user.roles.customer
    ? [
        { href: "/portal", label: P.nav.gardens, icon: <IconTree /> },
        { href: "/portal/basvuru", label: P.nav.applications, icon: <IconClipboard /> },
        { href: "/portal/siparis", label: P.nav.orders, icon: <IconPackage /> },
        { href: "/portal/odeme", label: P.nav.payments, icon: <IconCard /> },
        // IP15: service requests (weed mowing), for owners with the switch on.
        ...serviceLink,
      ]
    : [
        { href: "/portal", label: t.sections.portal, icon: <IconTree /> },
        // An owner without a customer profile (a pilot owner) may request
        // services too; a co-owner has nothing there.
        ...serviceLink,
      ];
  const accountLinks: AccountMenuLink[] = user.roles.customer
    ? [
        { href: "/portal/hesap", label: P.nav.account, icon: <IconUser size={18} /> },
        {
          href: "/portal/hesap/sozlesmeler",
          label: C.list.navLabel,
          icon: <IconFileText size={18} />,
        },
        { href: "/portal/hesap/izinler", label: P.nav.permissions, icon: <IconShield size={18} /> },
      ]
    : [];
  return (
    <PortalFrame
      links={links}
      navLabel={user.roles.customer ? P.nav.label : t.nav.sections}
      account={<AccountMenu email={user.email} links={accountLinks} sections={others} />}
    >
      {children}
    </PortalFrame>
  );
}
