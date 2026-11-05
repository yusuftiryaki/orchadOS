"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/app-shell";

export interface PortalLink {
  href: string;
  label: string;
  icon?: ReactNode;
}

// Which link a portal path belongs to: quotes go with the applications, the
// parcel pages with the gardens; the longest matching link wins. The account
// pages (Hesabım, Sözleşmelerim) are in the account menu, so no tab is
// current there.
export function currentLink(path: string, links: PortalLink[]): string | null {
  if (path.startsWith("/portal/teklif")) path = "/portal/basvuru";
  const match = links
    .filter((l) => l.href !== "/portal" && (path === l.href || path.startsWith(`${l.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (match) return match.href;
  if (path.startsWith("/portal/hesap")) return null;
  return path === "/portal" || path.startsWith("/portal/") ? "/portal" : null;
}

// The portal's AppShell. The layout persists across client navigations, so
// the current link is read from the URL here, in the browser.
export function PortalFrame({
  links,
  navLabel,
  account,
  children,
}: {
  links: PortalLink[];
  navLabel: string;
  account: ReactNode;
  children: ReactNode;
}) {
  const current = currentLink(usePathname() ?? "/portal", links);
  return (
    <AppShell
      variant="portal"
      navLabel={navLabel}
      nav={links.map((l) => ({ ...l, current: l.href === current }))}
      account={account}
    >
      {children}
    </AppShell>
  );
}
