"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import styles from "./portal-billing.module.css";

const ITEMS = [
  ["/portal", P.nav.gardens],
  ["/portal/basvuru", P.nav.applications],
  ["/portal/siparis", P.nav.orders],
  ["/portal/odeme", P.nav.payments],
  ["/portal/hesap", P.nav.account],
] as const;

// Which item a portal path belongs to: quotes go with the applications, the
// parcel pages with the gardens.
function currentOf(path: string): string {
  if (path.startsWith("/portal/teklif")) return "/portal/basvuru";
  const match = ITEMS.slice(1).find(([href]) => path === href || path.startsWith(`${href}/`));
  return match ? match[0] : "/portal";
}

// Links between the customer's screens, under the section header (§10).
export function PortalNav() {
  const current = currentOf(usePathname() ?? "/portal");
  return (
    <nav aria-label={P.nav.label} className={styles.nav}>
      <div className={styles.navInner}>
        {ITEMS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={current === href ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
