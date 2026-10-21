import Link from "next/link";
import { t } from "@/lib/i18n";
import { notificationsHref } from "@/lib/notifications/urls";
import { opsHref } from "@/lib/operations/urls";
import styles from "./operations.module.css";

const T = t.operations.nav;

export type OpsNavItem = "dashboard" | "owners" | "visits" | "notifications" | null;

// Links between the operations screens, under the section header.
export function OpsNav({ current }: { current: OpsNavItem }) {
  const items = [
    ["dashboard", opsHref.dashboard(), T.dashboard],
    ["owners", opsHref.owners(), T.owners],
    ["visits", opsHref.visits(), T.visits],
    ["notifications", notificationsHref(), t.notifications.nav],
  ] as const;
  return (
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
  );
}
