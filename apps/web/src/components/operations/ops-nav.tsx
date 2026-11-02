"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { boHref } from "@/lib/back-office/urls";
import { t } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { visitsText } from "@/lib/i18n/messages/visits";
import { opsServicesText } from "@/lib/i18n/messages/ops-services";
import { notificationsHref } from "@/lib/notifications/urls";
import { serviceHref } from "@/lib/operations/services";
import { opsHref } from "@/lib/operations/urls";
import styles from "./ops-nav.module.css";

const T = t.operations.nav;
const B = backOfficeText.nav;

interface Item {
  href: string;
  label: string;
  // Other screens that belong to this item (a quote to its application).
  also?: string[];
}

const groups: { label: string; items: Item[] }[] = [
  {
    label: B.groupField,
    items: [
      { href: opsHref.dashboard(), label: T.dashboard },
      // A parcel belongs to its owner's record; the dashboard only lists them.
      { href: opsHref.owners(), label: T.owners, also: ["/operasyon/parsel"] },
      { href: opsHref.visits(), label: T.visits },
      // IP15: weed mowing requests and the service catalogue.
      { href: serviceHref.queue(), label: opsServicesText.nav },
      { href: notificationsHref(), label: t.notifications.nav },
    ],
  },
  {
    label: B.group,
    items: [
      { href: boHref.applications(), label: B.applications, also: ["/operasyon/teklif"] },
      { href: boHref.orders(), label: B.orders },
      { href: boHref.payments(), label: B.payments },
      { href: boHref.refunds(), label: B.refunds },
      { href: boHref.removals(), label: B.removals },
      // T06 (contract 8A/6): the 8A reconciliation tasks.
      { href: opsHref.reconciliation(), label: visitsText.reconciliation.nav },
    ],
  },
  {
    label: B.groupAdmin,
    items: [
      { href: boHref.prices(), label: B.prices },
      { href: boHref.settings(), label: B.settings },
      { href: "/operasyon/personel", label: t.legal.staff.nav },
      { href: "/operasyon/kvkk", label: t.legal.kvkkRequest.ops.nav },
      { href: boHref.audit(), label: B.audit },
    ],
  },
];

function matches(path: string, href: string) {
  return href === "/operasyon" ? path === href : path === href || path.startsWith(`${href}/`);
}

// The operations screens, grouped: a sidebar on wide screens, a menu that
// opens under the section header on narrow ones. Actions ("Yeni sahip") are
// not here; each screen puts its own in its header.
export function OpsNav() {
  const path = usePathname() ?? "";
  const isCurrent = (item: Item) =>
    matches(path, item.href) || (item.also ?? []).some((a) => matches(path, a));
  const current = groups.flatMap((g) => g.items).find(isCurrent);
  const list = groups.map((group) => (
    <div key={group.label} className={styles.group}>
      <p className={styles.groupLabel}>{group.label}</p>
      <ul>
        {group.items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={styles.link}
              aria-current={isCurrent(item) ? "page" : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  ));
  return (
    <nav aria-label={t.sections.operasyon} className={styles.nav}>
      <div className={styles.wide}>{list}</div>
      <details className={styles.narrow} key={path}>
        <summary className={styles.summary}>
          <span className={styles.summaryLabel}>{B.menu}</span>
          {current && <span className={styles.summaryCurrent}>{current.label}</span>}
        </summary>
        <div className={styles.sheet}>{list}</div>
      </details>
    </nav>
  );
}
