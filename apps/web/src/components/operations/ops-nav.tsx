import Link from "next/link";
import { boHref } from "@/lib/back-office/urls";
import { t } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { notificationsHref } from "@/lib/notifications/urls";
import { opsHref } from "@/lib/operations/urls";
import bo from "@/components/back-office/back-office.module.css";
import styles from "./operations.module.css";

const T = t.operations.nav;
const B = backOfficeText.nav;

export type OpsNavItem =
  | "dashboard"
  | "owners"
  | "visits"
  | "notifications"
  | "applications"
  | "orders"
  | "payments"
  | "refunds"
  | "prices"
  | "audit"
  | "settings"
  | null;

// Links between the operations screens, under the section header; the
// customer and payment screens (IP12) in a second group.
export function OpsNav({ current }: { current: OpsNavItem }) {
  const items = [
    ["dashboard", opsHref.dashboard(), T.dashboard],
    ["owners", opsHref.owners(), T.owners],
    ["visits", opsHref.visits(), T.visits],
    ["notifications", notificationsHref(), t.notifications.nav],
  ] as const;
  const billing = [
    ["applications", boHref.applications(), B.applications],
    ["orders", boHref.orders(), B.orders],
    ["payments", boHref.payments(), B.payments],
    ["refunds", boHref.refunds(), B.refunds],
    ["prices", boHref.prices(), B.prices],
    ["audit", boHref.audit(), B.audit],
    ["settings", boHref.settings(), B.settings],
  ] as const;
  return (
    <>
      <nav className={styles.subnav} aria-label={t.sections.operasyon}>
        {items.map(([key, href, label]) => (
          <Link key={key} href={href} aria-current={current === key ? "page" : undefined}>
            {label}
          </Link>
        ))}
        <Link href={opsHref.newOwner()}>+ {T.newOwner}</Link>
        <Link href={opsHref.newParcel()}>+ {T.newParcel}</Link>
        <Link href={opsHref.newVisit()}>+ {T.newVisit}</Link>
      </nav>
      <nav className={bo.navGroup} aria-label={B.group}>
        <span className={bo.navGroupLabel}>{B.group}:</span>
        {billing.map(([key, href, label]) => (
          <Link key={key} href={href} aria-current={current === key ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
